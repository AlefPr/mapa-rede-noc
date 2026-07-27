const db = require('../db');
const logger = require('../logger');
const { autenticarToken } = require('../middleware/auth');

function formatPeriodo(periodo) {
  const map = { '30m': 1800, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };
  return map[periodo] || 3600;
}

function auth(req, res, next) { autenticarToken(req, res, next); }

module.exports = (app, io) => {
  // Health check
  app.get('/api/flow/ping', (req, res) => res.json({ ok: true }));

  // Dashboard summary
  app.get('/api/flow/resumo', auth, async (req, res) => {
    try {
      const segundos = formatPeriodo(req.query.periodo || '1h');
      const [rows] = await db.execute(`
        SELECT
          COALESCE(SUM(CASE WHEN bytes_total > 0 THEN bytes_total ELSE 0 END), 0) AS total_bytes,
          COALESCE(SUM(flows_count), 0) AS total_flows
        FROM flow_data.flow_minuto
        WHERE timestamp >= NOW() - INTERVAL ? SECOND
      `, [segundos]);
      const totalBytes = rows[0]?.total_bytes || 0;
      const totalFlows = rows[0]?.total_flows || 0;
      const bps = segundos > 0 ? (totalBytes * 8 / segundos) : 0;

      let inBps = bps * 0.6, outBps = bps * 0.4;
      const [inRow] = await db.execute(`
        SELECT COALESCE(SUM(bytes_total), 0) AS b FROM flow_data.flow_minuto
        WHERE timestamp >= NOW() - INTERVAL ? SECOND AND ip_dst NOT LIKE '10.%' AND ip_dst NOT LIKE '172.1%' AND ip_dst NOT LIKE '192.168.%'
      `, [segundos]);
      const [outRow] = await db.execute(`
        SELECT COALESCE(SUM(bytes_total), 0) AS b FROM flow_data.flow_minuto
        WHERE timestamp >= NOW() - INTERVAL ? SECOND AND ip_src NOT LIKE '10.%' AND ip_src NOT LIKE '172.1%' AND ip_src NOT LIKE '192.168.%'
      `, [segundos]);
      if (inRow[0]?.b > 0) inBps = (inRow[0].b * 8 / segundos);
      if (outRow[0]?.b > 0) outBps = (outRow[0].b * 8 / segundos);

      res.json({ in_bps: Math.round(inBps), out_bps: Math.round(outBps), total_flows: totalFlows });
    } catch (e) {
      logger.error('Flow resumo error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Top talkers
  app.get('/api/flow/top-talkers', auth, async (req, res) => {
    try {
      const segundos = formatPeriodo(req.query.periodo || '1h');
      const tipo = req.query.tipo || 'ip_src';
      const limite = parseInt(req.query.limite) || 20;

      let groupCol, selectCol;
      if (tipo === 'ip_src') { groupCol = 'ip_src'; selectCol = 'ip_src'; }
      else if (tipo === 'ip_dst') { groupCol = 'ip_dst'; selectCol = 'ip_dst'; }
      else if (tipo === 'porta') { groupCol = 'port_dst, proto'; selectCol = 'port_dst, proto'; }
      else if (tipo === 'proto') { groupCol = 'proto'; selectCol = 'proto'; }
      else if (tipo === 'ip') { groupCol = 'ip_src, ip_dst, port_src, port_dst, proto'; selectCol = 'ip_src, ip_dst, port_src, port_dst, proto'; }
      else groupCol = selectCol = 'ip_src';

      const [rows] = await db.execute(`
        SELECT ${selectCol},
               COALESCE(SUM(bytes_total), 0) AS bytes_total,
               COALESCE(SUM(flows_count), 0) AS total_flows,
               COALESCE(SUM(bytes_total * 8 / ${segundos}), 0) AS bps
        FROM flow_data.flow_minuto
        WHERE timestamp >= NOW() - INTERVAL ? SECOND
        GROUP BY ${groupCol}
        ORDER BY bytes_total DESC
        LIMIT ?
      `, [segundos, limite]);

      res.json(rows);
    } catch (e) {
      logger.error('Flow top-talkers error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Traffic time series
  app.get('/api/flow/series-trafego', auth, async (req, res) => {
    try {
      const segundos = formatPeriodo(req.query.periodo || '6h');
      const intervaloSeg = parseInt(req.query.intervalo) || 300;

      const [rows] = await db.execute(`
        SELECT
          UNIX_TIMESTAMP(timestamp) DIV ? AS bucket,
          COALESCE(SUM(CASE WHEN ip_dst NOT LIKE '10.%' AND ip_dst NOT LIKE '172.1%' AND ip_dst NOT LIKE '192.168.%' THEN bytes_total ELSE 0 END), 0) AS in_bytes,
          COALESCE(SUM(CASE WHEN ip_src NOT LIKE '10.%' AND ip_src NOT LIKE '172.1%' AND ip_src NOT LIKE '192.168.%' THEN bytes_total ELSE 0 END), 0) AS out_bytes
        FROM flow_data.flow_minuto
        WHERE timestamp >= NOW() - INTERVAL ? SECOND
        GROUP BY bucket
        ORDER BY bucket ASC
      `, [intervaloSeg, segundos]);

      const series = rows.map(r => ({
        t: r.bucket * intervaloSeg * 1000,
        in_bps: r.in_bytes * 8 / intervaloSeg,
        out_bps: r.out_bytes * 8 / intervaloSeg
      }));

      res.json(series);
    } catch (e) {
      logger.error('Flow series error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Buscar IP
  app.get('/api/flow/buscar', auth, async (req, res) => {
    try {
      const ip = req.query.ip;
      const segundos = formatPeriodo(req.query.periodo || '6h');
      if (!ip) return res.status(400).json({ error: 'IP é obrigatório' });

      const [rows] = await db.execute(`
        SELECT
          CASE WHEN ip_src = ? THEN ip_dst ELSE ip_src END AS ip_par,
          port_src, port_dst, proto,
          COALESCE(SUM(bytes_total), 0) AS bytes_total,
          COALESCE(SUM(flows_count), 0) AS total_flows
        FROM flow_data.flow_minuto
        WHERE (ip_src = ? OR ip_dst = ?)
          AND timestamp >= NOW() - INTERVAL ? SECOND
        GROUP BY ip_par, port_src, port_dst, proto
        ORDER BY bytes_total DESC
        LIMIT 100
      `, [ip, ip, ip, segundos]);

      res.json(rows);
    } catch (e) {
      logger.error('Flow buscar error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Ataques
  app.get('/api/flow/ataques', auth, async (req, res) => {
    try {
      const [rows] = await db.execute(`
        SELECT id, ip_src, bps, alvos, descricao, status, timestamp
        FROM flow_data.ataques
        WHERE status != 'encerrado'
        ORDER BY timestamp DESC
        LIMIT 50
      `);
      res.json(rows);
    } catch (e) {
      logger.error('Flow ataques error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Deteção automática de ataques (roda a cada 60s)
  async function detectarAtaques() {
    try {
      const [rows] = await db.execute(`
        SELECT ip_src,
               SUM(bytes_total * 8 / 60) AS bps,
               COUNT(DISTINCT ip_dst) AS alvos,
               COUNT(DISTINCT CONCAT(ip_dst,':',port_dst)) AS conexoes
        FROM flow_data.flow_minuto
        WHERE timestamp >= NOW() - INTERVAL 1 MINUTE
        GROUP BY ip_src
        HAVING (bps > 500000000 AND alvos > 5) OR (bps > 2000000000) OR (conexoes > 100)
      `);

      for (const ataque of rows) {
        const ip = ataque.ip_src;
        const [exist] = await db.execute(
          `SELECT id FROM flow_data.ataques WHERE ip_src = ? AND status = 'ativo' LIMIT 1`,
          [ip]
        );
        if (exist.length === 0) {
          await db.execute(
            `INSERT INTO flow_data.ataques (ip_src, bps, alvos, descricao, status)
             VALUES (?, ?, ?, ?, 'ativo')`,
            [ip, Math.round(ataque.bps), ataque.alvos,
             `Tráfego suspeito: ${(ataque.bps / 1e9).toFixed(2)} Gbps para ${ataque.alvos} alvos`]
          );
          logger.warn(`Ataque detectado: ${ip} - ${(ataque.bps / 1e9).toFixed(2)} Gbps`);
          try { io?.emit('novoAtaque', { ip_src: ip, bps: ataque.bps }); } catch {}
        }
      }

      // Auto-resolver ataques que pararam
      await db.execute(`
        UPDATE flow_data.ataques SET status = 'encerrado'
        WHERE status = 'ativo' AND timestamp < NOW() - INTERVAL 30 MINUTE
        AND ip_src NOT IN (
          SELECT ip_src FROM flow_data.flow_minuto
          WHERE timestamp >= NOW() - INTERVAL 5 MINUTE
          AND bytes_total > 100000000
        )
      `);
    } catch (e) {
      if (!e.message.includes("doesn't exist")) {
        logger.error('Flow deteccao error:', e.message);
      }
    }
  }

  // Polling de deteção a cada 60s
  const ATAQUE_POLL = 60000;
  setInterval(detectarAtaques, ATAQUE_POLL);

  logger.info('Flow routes loaded');
};
