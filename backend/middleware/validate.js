const crypto = require('crypto');
const logger = require('../logger');

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function isArray(val) {
  return Array.isArray(val);
}

function isString(val) {
  return typeof val === 'string' || val instanceof String;
}

function isNumeric(val) {
  return !isNaN(parseFloat(val)) && isFinite(val);
}

function validarCriacaoRota(req, res, next) {
  const erros = [];

  if (!req.body.nome || !isString(req.body.nome) || !req.body.nome.trim()) {
    erros.push('"nome" é obrigatório e deve ser uma string não vazia.');
  }

  if (req.body.nome && req.body.nome.length > 255) {
    erros.push('"nome" deve ter no máximo 255 caracteres.');
  }

  if (req.body.cor && !/^#[0-9a-fA-F]{6}$/.test(req.body.cor)) {
    erros.push('"cor" deve ser um hexadecimal válido (ex: #3b82f6).');
  }

  if (req.body.espessura !== undefined && (!isNumeric(req.body.espessura) || req.body.espessura < 1 || req.body.espessura > 20)) {
    erros.push('"espessura" deve ser um número entre 1 e 20.');
  }

  if (!req.body.coordenadas || !isArray(req.body.coordenadas) || req.body.coordenadas.length < 2) {
    erros.push('"coordenadas" é obrigatório e deve ser um array com pelo menos 2 pontos.');
  }

  if (req.body.coordenadas) {
    req.body.coordenadas.forEach((coord, i) => {
      if (!coord.lat || !coord.lng || !isNumeric(coord.lat) || !isNumeric(coord.lng)) {
        erros.push(`"coordenadas[${i}]" deve ter "lat" e "lng" numéricos válidos.`);
      }
    });
  }

  if (req.body.tipo_rota && !['agregado', 'backup', 'cliente', 'backbone'].includes(req.body.tipo_rota)) {
    erros.push('"tipo_rota" deve ser um dos valores: agregado, backup, cliente, backbone.');
  }

  if (req.body.estilo && !['solida', 'tracejada', 'setas', 'neon', 'particulas'].includes(req.body.estilo)) {
    erros.push('"estilo" deve ser um dos valores: solida, tracejada, setas, neon, particulas.');
  }

  if (req.body.capacidade && (!isNumeric(req.body.capacidade) || req.body.capacidade < 0)) {
    erros.push('"capacidade" deve ser um número positivo.');
  }

  if (erros.length > 0) {
    return res.status(400).json({ error: 'Dados inválidos.', detalhes: erros });
  }

  next();
}

function validarAtualizacaoRota(req, res, next) {
  const erros = [];

  if (!req.params.id || !isNumeric(req.params.id)) {
    erros.push('"id" do parâmetro é inválido.');
  }

  if (req.body.nome !== undefined && (!isString(req.body.nome) || !req.body.nome.trim())) {
    erros.push('"nome" deve ser uma string não vazia.');
  }

  if (req.body.nome && req.body.nome.length > 255) {
    erros.push('"nome" deve ter no máximo 255 caracteres.');
  }

  if (req.body.cor && !/^#[0-9a-fA-F]{6}$/.test(req.body.cor)) {
    erros.push('"cor" deve ser um hexadecimal válido (ex: #3b82f6).');
  }

  if (req.body.espessura !== undefined && (!isNumeric(req.body.espessura) || req.body.espessura < 1 || req.body.espessura > 20)) {
    erros.push('"espessura" deve ser um número entre 1 e 20.');
  }

  if (req.body.coordenadas && (!isArray(req.body.coordenadas) || req.body.coordenadas.length < 2)) {
    erros.push('"coordenadas" deve ser um array com pelo menos 2 pontos.');
  }

  if (req.body.coordenadas && isArray(req.body.coordenadas)) {
    req.body.coordenadas.forEach((coord, i) => {
      if (!coord.lat || !coord.lng || !isNumeric(coord.lat) || !isNumeric(coord.lng)) {
        erros.push(`"coordenadas[${i}]" deve ter "lat" e "lng" numéricos válidos.`);
      }
    });
  }

  if (req.body.tipo_rota && !['agregado', 'backup', 'cliente', 'backbone'].includes(req.body.tipo_rota)) {
    erros.push('"tipo_rota" deve ser um dos valores: agregado, backup, cliente, backbone.');
  }

  if (req.body.estilo && !['solida', 'tracejada', 'setas', 'neon', 'particulas'].includes(req.body.estilo)) {
    erros.push('"estilo" deve ser um dos valores: solida, tracejada, setas, neon, particulas.');
  }

  if (req.body.capacidade && (!isNumeric(req.body.capacidade) || req.body.capacidade < 0)) {
    erros.push('"capacidade" deve ser um número positivo.');
  }

  if (erros.length > 0) {
    return res.status(400).json({ error: 'Dados inválidos.', detalhes: erros });
  }

  next();
}

function validarWebhook(req, res, next) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('WEBHOOK_SECRET não configurado. A autenticação do webhook está desativada.');
    return next();
  }
  const token = req.headers['x-webhook-secret'] || req.headers['authorization'];
  if (!token || !timingSafeCompare(token, secret)) {
    return res.status(401).json({ error: 'Não autorizado. Token inválido ou ausente.' });
  }
  next();
}

module.exports = {
  validarCriacaoRota,
  validarAtualizacaoRota,
  validarWebhook
};
