const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const logger = require('../logger');

const ASN_URL = 'https://iptoasn.com/data/ip2asn-v4.tsv.gz';
const DATA_DIR = path.join(__dirname, '..', 'data');
const ASN_FILE = path.join(DATA_DIR, 'ip2asn-v4.tsv');

let ranges = [];
let loaded = false;

function ipToInt(ip) {
  const parts = ip.split('.');
  return ((+parts[0] << 24) | (+parts[1] << 16) | (+parts[2] << 8) | +parts[3]) >>> 0;
}
function intToIp(n) {
  return [(n >>> 24), (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function loadRanges() {
  if (!fs.existsSync(ASN_FILE)) {
    logger.warn('ASN database file not found. Run download or place ip2asn-v4.tsv in data/');
    return;
  }
  try {
    const data = fs.readFileSync(ASN_FILE, 'utf-8');
    const lines = data.trim().split('\n');
    ranges = [];
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 5) continue;
      const [start, end, asn, code, ...orgParts] = parts;
      if (!asn || asn === '0' || asn === 'AS0') continue;
      ranges.push({
        start: ipToInt(start),
        end: ipToInt(end),
        asn: parseInt(asn, 10) || 0,
        code: code || '',
        org: (orgParts.join(' ') || '').trim().replace(/"/g, '')
      });
    }
    ranges.sort((a, b) => a.start - b.start);
    loaded = true;
    logger.info(`ASN lookup loaded: ${ranges.length} ranges`);
  } catch (e) {
    logger.error('ASN load error:', e.message);
  }
}

function lookup(ip) {
  if (!loaded) return null;
  const ipInt = ipToInt(ip);
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const r = ranges[mid];
    if (ipInt < r.start) hi = mid - 1;
    else if (ipInt > r.end) lo = mid + 1;
    else return { asn: r.asn, org: r.org, code: r.code, range: intToIp(r.start) + ' - ' + intToIp(r.end) };
  }
  return null;
}

function download() {
  return new Promise((resolve, reject) => {
    logger.info('Downloading ASN database...');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = fs.createWriteStream(ASN_FILE);
    const gunzip = zlib.createGunzip();
    https.get(ASN_URL, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(gunzip).pipe(file);
      file.on('finish', () => {
        file.close();
        loadRanges();
        logger.info('ASN database downloaded and loaded');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(ASN_FILE, () => {});
      reject(err);
    });
  });
}

loadRanges();

module.exports = { lookup, download, reload: loadRanges, loaded: () => loaded };
