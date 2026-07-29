const logger = require('../logger');

let cache = [];
let initialized = false;

function ipToInt(ip) {
  const parts = ip.split('.');
  return ((+parts[0] >>> 0) << 24) + ((+parts[1] >>> 0) << 16) + ((+parts[2] >>> 0) << 8) + (+parts[3] >>> 0);
}

function parseCIDR(cidr) {
  const [ip, bits] = cidr.split('/');
  const m = parseInt(bits);
  const mask = ~(2 ** (32 - m) - 1) >>> 0;
  return { network: ipToInt(ip) & mask, mask, bits: m, ip };
}

function init() {
  const raw = process.env.CLIENTE_RANGES || '';
  cache = raw.split(',').map(s => s.trim()).filter(Boolean).map(parseCIDR);
  initialized = true;
  logger.info(`Cliente ranges: ${cache.length} CIDRs loaded`);
}

function isPrivate(ip) {
  if (ip.startsWith('10.') || ip.startsWith('127.')) return true;
  if (ip.startsWith('172.')) { const o = parseInt(ip.split('.')[1]); if (o >= 16 && o <= 31) return true; }
  if (ip.startsWith('192.168.')) return true;
  return false;
}

function isCliente(ip) {
  if (!initialized) init();
  if (isPrivate(ip)) return false;
  const ipInt = ipToInt(ip);
  for (const r of cache) {
    if ((ipInt & r.mask) === r.network) return true;
  }
  return false;
}

function sqlClause(column) {
  if (!cache.length) return '1=0';
  return cache.map(r => {
    const base = r.network >>> 0;
    const p3 = base & 255;
    const p2 = (base >>> 8) & 255;
    const p1 = (base >>> 16) & 255;
    const p0 = (base >>> 24) & 255;
    return `(INET_ATON(${column}) & ~(POW(2,32-${r.bits})-1)) = INET_ATON('${p0}.${p1}.${p2}.${p3}')`;
  }).join(' OR ');
}

function sqlNotPrivateClause(column) {
  return `${column} NOT LIKE '10.%' AND ${column} NOT LIKE '192.168.%' AND NOT (${column} LIKE '172.%' AND INET_ATON(${column}) BETWEEN INET_ATON('172.16.0.0') AND INET_ATON('172.31.255.255'))`;
}

function reload() { initialized = false; init(); }

init();
module.exports = { isCliente, isPrivate, sqlClause, sqlNotPrivateClause, reload, ipToInt, parseCIDR };
