const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../logger');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.error('FATAL: JWT_SECRET não configurado. Encerrando.');
  process.exit(1);
}

function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, username: usuario.username },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

async function tokenBlacklisted(token) {
  try {
    const redisClient = require('../redisClient');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await redisClient.get(`blk:${hash}`);
    return result !== null;
  } catch {
    return false;
  }
}

async function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  try {
    const blacklisted = await tokenBlacklisted(token);
    if (blacklisted) {
      return res.status(401).json({ error: 'Token revogado. Faça login novamente.' });
    }
  } catch {
    // Redis indisponível; prossegue sem verificar blacklist
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      logger.warn('Tentativa de acesso com token inválido:', err.message);
      return res.status(403).json({ error: 'Token inválido ou expirado.' });
    }
    req.usuario = decoded;
    next();
  });
}

function autenticarTokenOpcional(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return next();

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err) req.usuario = decoded;
    next();
  });
}

async function verificarCookie(req, res, next) {
  const token = req.cookies?.noc_auth_token;
  if (!token) {
    return res.redirect('/mapa/login.html');
  }
  const blacklisted = await tokenBlacklisted(token).catch(() => false);
  if (blacklisted) {
    return res.redirect('/mapa/login.html');
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.redirect('/mapa/login.html');
    req.usuario = decoded;
    next();
  });
}

module.exports = { gerarToken, autenticarToken, autenticarTokenOpcional, verificarCookie };
