const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const logger = require('../logger');
const { gerarToken } = require('../middleware/auth');
const redisClient = require('../redisClient');

exports.registrar = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password são obrigatórios.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'A password deve ter pelo menos 8 caracteres.' });
    }
    if (!/(?=.*[a-z])/.test(password)) {
      return res.status(400).json({ error: 'A password deve conter pelo menos uma letra minúscula.' });
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      return res.status(400).json({ error: 'A password deve conter pelo menos uma letra maiúscula.' });
    }
    if (!/(?=.*\d)/.test(password)) {
      return res.status(400).json({ error: 'A password deve conter pelo menos um número.' });
    }
    if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) {
      return res.status(400).json({ error: 'A password deve conter pelo menos um caractere especial.' });
    }

    const [existentes] = await db.execute('SELECT id FROM usuarios WHERE username = ?', [username]);
    if (existentes.length > 0) {
      return res.status(409).json({ error: 'Username já existe.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute('INSERT INTO usuarios (username, password) VALUES (?, ?)', [username, hash]);

    logger.info(`Novo utilizador registado: ${username}`);
    res.status(201).json({ message: 'Utilizador registado com sucesso.' });
  } catch (error) {
    logger.error('Erro no registo:', error);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password são obrigatórios.' });
    }

    const [usuarios] = await db.execute('SELECT * FROM usuarios WHERE username = ?', [username]);
    if (usuarios.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const usuario = usuarios[0];
    const senhaValida = await bcrypt.compare(password, usuario.password);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = gerarToken(usuario);
    logger.info(`Login bem-sucedido: ${username}`);
    res.cookie('noc_auth_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/mapa',
      maxAge: 24 * 60 * 60 * 1000
    });
    res.json({ token, usuario: { id: usuario.id, username: usuario.username } });
  } catch (error) {
    logger.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
};

exports.verificarToken = async (req, res) => {
  res.json({ valido: true, usuario: req.usuario });
};

exports.logout = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(400).json({ error: 'Token não fornecido.' });
    }

    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await redisClient.set(`blk:${hash}`, '1', { EX: 86400 });

    res.clearCookie('noc_auth_token', { path: '/mapa' });
    logger.info(`Logout: ${req.usuario?.username || 'desconhecido'}`);
    res.json({ message: 'Sessão encerrada com sucesso.' });
  } catch (error) {
    logger.error('Erro no logout:', error);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
};
