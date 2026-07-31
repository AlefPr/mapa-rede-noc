const db = require('../db');
const logger = require('../logger');
const rangeMatch = require('./rangeMatch');

let cache = null;

function buildEnvFallback() {
  const raw = process.env.CLIENTE_RANGES || '';
  const blocos = raw.split(',').map(s => s.trim()).filter(Boolean).map(parseCIDR).filter(Boolean);
  return {
    clientes: [{ id: 0, nome: 'Default (env)', banda_contratada_mbps: null, blocos }],
    fallback: true
  };
}

function parseCIDR(cidr) {
  try {
    const [ip, bits] = cidr.split('/');
    const m = parseInt(bits);
    if (!ip || !m || m < 0 || m > 32) return null;
    const mask = ~(2 ** (32 - m) - 1) >>> 0;
    return { ip, bits: m, network: rangeMatch.ipToInt(ip) & mask, mask };
  } catch {
    return null;
  }
}

function ensureCache() {
  if (!cache) cache = buildEnvFallback();
}

function maskSql(column, r) {
  const base = r.network >>> 0;
  const p3 = base & 255;
  const p2 = (base >>> 8) & 255;
  const p1 = (base >>> 16) & 255;
  const p0 = (base >>> 24) & 255;
  return `(INET_ATON(${column}) & ~(POW(2,32-${r.bits})-1)) = INET_ATON('${p0}.${p1}.${p2}.${p3}')`;
}

function sqlClause(column) {
  ensureCache();
  const blocos = cache.clientes.flatMap(c => c.blocos);
  if (!blocos.length) return '1=0';
  return blocos.map(r => maskSql(column, r)).join(' OR ');
}

function sqlClauseForCliente(clienteId, column) {
  ensureCache();
  const c = cache.clientes.find(x => x.id == clienteId);
  if (!c || !c.blocos.length) return null;
  return c.blocos.map(r => maskSql(column, r)).join(' OR ');
}

function matchCliente(ip) {
  ensureCache();
  if (rangeMatch.isPrivate(ip)) return null;
  const ipInt = rangeMatch.ipToInt(ip);
  for (const c of cache.clientes) {
    for (const r of c.blocos) {
      if ((ipInt & r.mask) === r.network) return { id: c.id, nome: c.nome };
    }
  }
  return null;
}

function list() {
  ensureCache();
  return cache.clientes;
}

async function reloadFromDb() {
  try {
    const [clientes] = await db.execute(
      'SELECT id, nome, plano, banda_contratada_mbps, ativo FROM flow_data.clientes WHERE ativo = 1 ORDER BY nome'
    );
    const out = [];
    for (const c of clientes) {
      const [blocos] = await db.execute(
        'SELECT bloco, descricao FROM flow_data.cliente_blocos WHERE cliente_id = ?', [c.id]
      );
      const parsed = blocos
        .map(b => { const p = parseCIDR(b.bloco); return p ? { ...p, descricao: b.descricao } : null; })
        .filter(Boolean);
      out.push({
        id: c.id,
        nome: c.nome,
        plano: c.plano,
        banda_contratada_mbps: c.banda_contratada_mbps,
        blocos: parsed
      });
    }
    if (out.length) {
      cache = { clientes: out, fallback: false };
      logger.info(`ClienteRange: ${out.length} clientes carregados do banco`);
    } else {
      cache = buildEnvFallback();
      logger.info('ClienteRange: banco vazio, usando fallback do .env');
    }
  } catch (e) {
    logger.error('ClienteRange reloadFromDb error:', e.message);
    if (!cache) cache = buildEnvFallback();
  }
}

async function reload() { await reloadFromDb(); }

ensureCache();
reloadFromDb();

module.exports = {
  sqlClause, sqlClauseForCliente, matchCliente, list, reload, reloadFromDb,
  isFallback: () => (cache && cache.fallback) || false
};
