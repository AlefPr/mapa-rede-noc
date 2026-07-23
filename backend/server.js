// ==========================================
// 1. IMPORTAÇÕES E CONFIGURAÇÕES INICIAIS
// ==========================================
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require("socket.io");
const zabbixService = require('./services/zabbixService');
const redisClient = require('./redisClient');
const logger = require('./logger');
const { errorHandler } = require('./middleware/errorHandler');

const FRONTEND_DIR = '/var/www/html/mapa';

const app = express();
const server = http.createServer(app);
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';

const allowedOrigins = [frontendUrl, frontendUrl.replace('http://', 'https://')];
if (process.env.FRONTEND_URLS) {
  process.env.FRONTEND_URLS.split(',').forEach(o => {
    const url = o.trim();
    if (url && !allowedOrigins.includes(url)) allowedOrigins.push(url);
    const httpsUrl = url.replace('http://', 'https://');
    if (httpsUrl !== url && !allowedOrigins.includes(httpsUrl)) allowedOrigins.push(httpsUrl);
  });
}

// Auto-detect IPs da máquina e adiciona como origins permitidas
const os = require('os');
const ifaces = os.networkInterfaces();
for (const name of Object.keys(ifaces)) {
  for (const iface of ifaces[name]) {
    if (iface.family === 'IPv4' && !iface.internal) {
      const httpOrigin = `http://${iface.address}`;
      const httpsOrigin = `https://${iface.address}`;
      if (!allowedOrigins.includes(httpOrigin)) allowedOrigins.push(httpOrigin);
      if (!allowedOrigins.includes(httpsOrigin)) allowedOrigins.push(httpsOrigin);
    }
  }
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS bloqueado para origin não configurada: ${origin}. Adicione a FRONTEND_URLS no .env.`);
      callback(null, false);
    }
  },
  credentials: true
};

const io = new Server(server, { cors: { ...corsOptions, methods: ["GET", "POST", "PUT", "DELETE"] } });

const PORT = process.env.PORT || 3000;
const POLLING_INTERVAL = parseInt(process.env.ZABBIX_POLLING_INTERVAL) || 30000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://code.jquery.com", "https://unpkg.com", "https://maps.googleapis.com", "https://cdn.socket.io"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://maps.googleapis.com", "https://maps.gstatic.com"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      frameSrc: ["https://maps.googleapis.com"],
      "upgrade-insecure-requests": null,
    }
  }
}));
app.use(compression());
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.set('trust proxy', 1);

// ── Proxy /mapa: serve frontend com verificação de cookie JWT ──
// Rotas públicas (sem auth)
app.get('/mapa/health', async (req, res) => {
  const health = { status: 'ok', timestamp: new Date().toISOString(), mariadb: false, redis: false };
  try {
    const db = require('./db');
    const conn = await db.getConnection();
    conn.release();
    health.mariadb = true;
  } catch { health.mariadb = false; }
  try {
    const ping = await redisClient.ping();
    health.redis = ping === 'PONG';
  } catch { health.redis = false; }
  res.json(health);
});

app.use('/mapa', express.static(FRONTEND_DIR));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' }
});
app.use('/api/', limiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente mais tarde.' }
});
app.use('/api/auth/login', loginLimiter);

io.on('connection', (socket) => {
  logger.info(`Novo cliente conectado! ID: ${socket.id}`);
});

app.get('/', (req, res) => res.json({ message: "API OK!" }));

// ==========================================
// 1.5 MOTOR DE EXPIRAÇÃO DE MANUTENÇÃO
// ==========================================
const MAINT_CHECK_INTERVAL = 60000;
async function verificarManutencaoExpirada() {
  try {
    const db = require('./db');
    const [expiradas] = await db.execute(
      'SELECT id, nome_rota FROM rotas WHERE manutencao_ativa = 1 AND manutencao_ate IS NOT NULL AND manutencao_ate <= NOW()'
    );
    for (const rota of expiradas) {
      await db.execute('UPDATE rotas SET manutencao_ativa = 0, manutencao_ate = NULL WHERE id = ?', [rota.id]);
      io.emit('rotaManutencaoAtualizada', {
        id: rota.id,
        nome_rota: rota.nome_rota,
        manutencao_ativa: false,
        manutencao_ate: null
      });
      logger.info(`Manutenção expirada automaticamente: ${rota.nome_rota} (ID: ${rota.id})`);
    }
  } catch (e) {
    logger.error('Erro ao verificar manutenções expiradas:', e);
  }
}
setInterval(verificarManutencaoExpirada, MAINT_CHECK_INTERVAL);

// ==========================================
// 1.6 AMOSTRAGEM DE HISTÓRICO DE TRÁFEGO
// ==========================================
const TRAFFIC_SAMPLE_INTERVAL = 5 * 60 * 1000;
async function amostrarTrafego() {
  try {
    const db = require('./db');
    const [rotas] = await db.execute('SELECT id FROM rotas');
    for (const rota of rotas) {
      const cache = await redisClient.hGetAll('zabbix_cache');
      if (!cache) continue;
      let inBps = 0, outBps = 0;
      try {
        const parsed = JSON.parse(Object.values(cache)[0] || '{}');
        const [items] = await db.execute('SELECT zabbix_itemid, tipo_item FROM rota_zabbix_items WHERE rota_id = ?', [rota.id]);
        items.forEach(item => {
          const val = parseFloat(parsed[item.zabbix_itemid]?.current) || 0;
          if (item.tipo_item === 'download') inBps += val;
          if (item.tipo_item === 'upload') outBps += val;
        });
      } catch {}
      await db.execute(
        'INSERT INTO historico_trafego (rota_id, in_bps, out_bps) VALUES (?, ?, ?)',
        [rota.id, inBps, outBps]
      );
    }
    logger.debug(`Amostragem de tráfego concluída: ${rotas.length} rotas`);
  } catch (e) {
    logger.error('Erro na amostragem de tráfego:', e.message);
  }
}
setInterval(amostrarTrafego, TRAFFIC_SAMPLE_INTERVAL);

// ==========================================
// 2. ROTAS E CONTROLADORES
// ==========================================
require('./routes/auth')(app);
require('./routes/rotas')(app, io);
require('./routes/zabbix')(app);
require('./routes/weather')(app);
require('./routes/sla')(app);
require('./routes/historico')(app);
require('./routes/templates')(app);
require('./routes/problemas')(app, io);
require('./routes/swagger')(app);

// Middleware de erros (deve ser o último)
app.use(errorHandler);

// ==========================================
// 3.5 MOTOR DE CACHE ZABBIX
// ==========================================
(async function pollingLoop() {
  await zabbixService.syncZabbixCache(io);
  setTimeout(pollingLoop, POLLING_INTERVAL);
})();

// ==========================================
// 4. GRACEFUL SHUTDOWN
// ==========================================
async function gracefulShutdown(signal) {
  logger.info(`${signal} recebido. A encerrar servidor...`);
  io.close();
  server.close(async () => {
    try {
      const db = require('./db');
      if (db && typeof db.end === 'function') await db.end();
    } catch (e) { /* pool já encerrado */ }
    try {
      if (redisClient && typeof redisClient.quit === 'function') await redisClient.quit();
    } catch (e) { /* redis já encerrado */ }
    logger.info('Servidor encerrado com segurança.');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forçando encerramento após timeout de 10s.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ==========================================
// 5. INICIALIZAÇÃO DO SERVIDOR
// ==========================================
server.listen(PORT, async () => {
  logger.info(`Servidor rodando na porta ${PORT}`);
  try {
    const db = require('./db');
    const connection = await db.getConnection();
    logger.info('Conexão MySQL OK!');
    connection.release(); 
  } catch (error) { 
    logger.error('Erro de conexão com o Banco de Dados:', error); 
  }
});
