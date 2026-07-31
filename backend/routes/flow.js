const db = require('../db');
const logger = require('../logger');
const { autenticarToken } = require('../middleware/auth');
const geoip = require('geoip-lite');
const asnLookup = require('../services/asnLookup');
const rangeMatch = require('../services/rangeMatch');
const clienteRange = require('../services/clienteRange');
const { applyEquipamentoFilter, applyClienteFilter } = require('../services/flowFilters');

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
      const whereBase = ['timestamp >= NOW() - INTERVAL ? SECOND'];
      const paramsBase = [segundos];
      await applyEquipamentoFilter(req, whereBase, paramsBase);
      await applyClienteFilter(req, whereBase, paramsBase);
      const whereSql = whereBase.join(' AND ');
      const params = [...paramsBase];

      const [rows] = await db.execute(`
        SELECT
          COALESCE(SUM(CASE WHEN bytes_total > 0 THEN bytes_total ELSE 0 END), 0) AS total_bytes,
          COALESCE(SUM(flows_count), 0) AS total_flows
        FROM flow_data.flow_minuto
        WHERE ${whereSql}
      `, params);
      const totalBytes = rows[0]?.total_bytes || 0;
      const totalFlows = rows[0]?.total_flows || 0;
      const bps = segundos > 0 ? (totalBytes * 8 / segundos) : 0;

      let inBps = bps * 0.6, outBps = bps * 0.4;
      const [inRow] = await db.execute(`
        SELECT COALESCE(SUM(bytes_total), 0) AS b FROM flow_data.flow_minuto
        WHERE ${whereSql} AND ${rangeMatch.sqlNotPrivateClause('ip_dst')}
      `, params);
      const [outRow] = await db.execute(`
        SELECT COALESCE(SUM(bytes_total), 0) AS b FROM flow_data.flow_minuto
        WHERE ${whereSql} AND ${rangeMatch.sqlNotPrivateClause('ip_src')}
      `, params);
      if (inRow[0]?.b > 0) inBps = (inRow[0].b * 8 / segundos);
      if (outRow[0]?.b > 0) outBps = (outRow[0].b * 8 / segundos);

      let clienteBps = 0, transitoBps = 0;
      const cliWhere = clienteRange.sqlClause('ip_src');
      const cliWhereDst = clienteRange.sqlClause('ip_dst');
      if (cliWhere !== '1=0') {
        const [cliRow] = await db.execute(`
          SELECT COALESCE(SUM(bytes_total), 0) AS b FROM flow_data.flow_minuto
          WHERE ${whereSql} AND (${cliWhere} OR ${cliWhereDst})
        `, params);
        if (cliRow[0]?.b > 0) clienteBps = (cliRow[0].b * 8 / segundos);
      }
      transitoBps = bps - clienteBps;
      if (transitoBps < 0) transitoBps = 0;

      res.json({ in_bps: Math.round(inBps), out_bps: Math.round(outBps), cliente_bps: Math.round(clienteBps), transito_bps: Math.round(transitoBps), total_flows: totalFlows });
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

      const where = ['timestamp >= NOW() - INTERVAL ? SECOND'];
      const params = [segundos];
      await applyEquipamentoFilter(req, where, params);
      await applyClienteFilter(req, where, params);

      const [rows] = await db.execute(`
        SELECT ${selectCol},
               COALESCE(SUM(bytes_total), 0) AS bytes_total,
               COALESCE(SUM(flows_count), 0) AS total_flows,
               COALESCE(SUM(bytes_total * 8 / ${segundos}), 0) AS bps
        FROM flow_data.flow_minuto
        WHERE ${where.join(' AND ')}
        GROUP BY ${groupCol}
        ORDER BY bytes_total DESC
        LIMIT ?
      `, [...params, limite]);

      const ipKey = tipo === 'ip_dst' ? 'ip_dst' : tipo === 'ip_src' ? 'ip_src' : null;
      const tagged = rows.map(r => {
        if (ipKey && r[ipKey]) {
          const ip = r[ipKey];
          r.tipo_ip = clienteRange.matchCliente(ip) ? 'cliente' : (rangeMatch.isPrivate(ip) ? 'interno' : 'transito');
        } else if (tipo === 'ip' && r.ip_src && r.ip_dst) {
          const srcTipo = clienteRange.matchCliente(r.ip_src) ? 'cliente' : (rangeMatch.isPrivate(r.ip_src) ? 'interno' : 'transito');
          const dstTipo = clienteRange.matchCliente(r.ip_dst) ? 'cliente' : (rangeMatch.isPrivate(r.ip_dst) ? 'interno' : 'transito');
          r.tipo_src = srcTipo; r.tipo_dst = dstTipo;
        }
        return r;
      });
      res.json(tagged);
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

      const where = ['timestamp >= NOW() - INTERVAL ? SECOND'];
      const params = [intervaloSeg, segundos];
      await applyEquipamentoFilter(req, where, params);
      await applyClienteFilter(req, where, params);

      const [rows] = await db.execute(`
        SELECT
          UNIX_TIMESTAMP(timestamp) DIV ? AS bucket,
          COALESCE(SUM(CASE WHEN ${rangeMatch.sqlNotPrivateClause('ip_dst')} THEN bytes_total ELSE 0 END), 0) AS in_bytes,
          COALESCE(SUM(CASE WHEN ${rangeMatch.sqlNotPrivateClause('ip_src')} THEN bytes_total ELSE 0 END), 0) AS out_bytes
        FROM flow_data.flow_minuto
        WHERE ${where.join(' AND ')}
        GROUP BY bucket
        ORDER BY bucket ASC
      `, params);

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

  // ── IP Profile ──
  app.get('/api/flow/ip-profile', auth, async (req, res) => {
    try {
      const ip = req.query.ip;
      if (!ip) return res.status(400).json({ error: 'IP obrigatório' });
      const segundos = formatPeriodo(req.query.periodo || '1h');

      const [[stats]] = await db.execute(`
        SELECT
          MIN(timestamp) AS first_seen,
          MAX(timestamp) AS last_seen,
          COUNT(DISTINCT port_dst) AS total_ports,
          COUNT(DISTINCT proto) AS total_protos,
          SUM(bytes_total) AS total_bytes,
          SUM(flows_count) AS total_flows,
          COALESCE(SUM(bytes_total * 8 / ${segundos}), 0) AS bps,
          SUM(CASE WHEN ip_src = ? THEN bytes_total ELSE 0 END) AS bytes_src,
          SUM(CASE WHEN ip_dst = ? THEN bytes_total ELSE 0 END) AS bytes_dst
        FROM flow_data.flow_minuto
        WHERE (ip_src = ? OR ip_dst = ?)
          AND timestamp >= NOW() - INTERVAL ? SECOND
      `, [ip, ip, ip, ip, segundos]);

      const [[protoDist]] = await db.execute(`
        SELECT proto, SUM(bytes_total) AS bytes
        FROM flow_data.flow_minuto
        WHERE (ip_src = ? OR ip_dst = ?)
          AND timestamp >= NOW() - INTERVAL ? SECOND
        GROUP BY proto ORDER BY bytes DESC LIMIT 5
      `, [ip, ip, segundos]);

      const [topPorts] = await db.execute(`
        SELECT port_dst, SUM(bytes_total) AS bytes
        FROM flow_data.flow_minuto
        WHERE (ip_src = ? OR ip_dst = ?)
          AND timestamp >= NOW() - INTERVAL ? SECOND
          AND port_dst > 0
        GROUP BY port_dst ORDER BY bytes DESC LIMIT 5
      `, [ip, ip, segundos]);

      const [[atkCount]] = await db.execute(`
        SELECT COUNT(*) AS total, SUM(CASE WHEN status='ativo' THEN 1 ELSE 0 END) AS ativos
        FROM flow_data.ataques WHERE ip_src = ?
      `, [ip]);

      const geo = geoip.lookup(ip);
      const asn = asnLookup.lookup(ip);

      // Risk score
      let score = 0;
      if (atkCount?.total > 0) score += 30;
      if (atkCount?.ativos > 0) score += 20;
      if ((stats?.bps || 0) > 5e8) score += 20;
      if ((stats?.total_ports || 0) > 20) score += 10;
      if ((stats?.total_protos || 0) > 3) score += 10;
      if (!asn?.asn) score += 10;
      score = Math.min(score, 100);

      res.json({
        ip,
        first_seen: stats?.first_seen || null,
        last_seen: stats?.last_seen || null,
        total_bytes: parseFloat(stats?.total_bytes || 0),
        total_flows: parseFloat(stats?.total_flows || 0),
        bps: Math.round(stats?.bps || 0),
        bytes_src: parseFloat(stats?.bytes_src || 0),
        bytes_dst: parseFloat(stats?.bytes_dst || 0),
        total_ports: stats?.total_ports || 0,
        total_protos: stats?.total_protos || 0,
        top_ports: (topPorts || []).map(p => ({ port: p.port_dst, bytes: parseFloat(p.bytes) })),
        geo: geo ? { country: geo.country, region: geo.region, city: geo.city } : null,
        asn: asn ? { asn: asn.asn, org: asn.org } : null,
        ataques: { total: atkCount?.total || 0, ativos: atkCount?.ativos || 0 },
        risk_score: score,
        periodo: req.query.periodo || '1h'
      });
    } catch (e) {
      logger.error('Flow ip-profile error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Attack Timeline ──
  app.get('/api/flow/ataques-timeline', auth, async (req, res) => {
    try {
      const [rows] = await db.execute(`
        SELECT
          UNIX_TIMESTAMP(timestamp) DIV 600 AS bucket,
          COUNT(*) AS total_ataques,
          COALESCE(SUM(CASE WHEN tipo='ddos' THEN 1 ELSE 0 END), 0) AS ddos,
          COALESCE(SUM(CASE WHEN tipo='portscan' THEN 1 ELSE 0 END), 0) AS portscan,
          COALESCE(SUM(CASE WHEN tipo='bruteforce' THEN 1 ELSE 0 END), 0) AS bruteforce,
          COALESCE(AVG(bps), 0) AS avg_bps
        FROM flow_data.ataques
        WHERE timestamp >= NOW() - INTERVAL 24 HOUR
        GROUP BY bucket ORDER BY bucket ASC
      `);
      res.json(rows.map(r => ({
        t: r.bucket * 600 * 1000,
        total: r.total_ataques,
        ddos: r.ddos,
        portscan: r.portscan,
        bruteforce: r.bruteforce,
        avg_bps: Math.round(r.avg_bps)
      })));
    } catch (e) {
      logger.error('Flow ataques-timeline error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Port Scan Check (ip scan check) ──
  app.get('/api/flow/port-scan-check', auth, async (req, res) => {
    try {
      const ip = req.query.ip;
      if (!ip) return res.status(400).json({ error: 'IP obrigatório' });
      const janela = parseInt(req.query.janela) || 300;
      const [[stats]] = await db.execute(`
        SELECT
          COUNT(DISTINCT port_dst) AS portas_diff,
          COUNT(DISTINCT ip_dst) AS alvos_diff,
          COUNT(*) AS total_flows,
          COALESCE(SUM(bytes_total), 0) AS total_bytes
        FROM flow_data.flow_minuto
        WHERE ip_src = ? AND timestamp >= NOW() - INTERVAL ? SECOND
      `, [ip, janela]);
      const portas = stats?.portas_diff || 0;
      const alvos = stats?.alvos_diff || 0;
      let resultado = 'normal';
      if (portas > 100) resultado = 'scan_agressivo';
      else if (portas > 20) resultado = 'scan';
      else if (alvos > 10 && portas > 5) resultado = 'scan_leve';
      res.json({
        ip, janela,
        portas_distintas: portas,
        alvos_distintos: alvos,
        total_flows: stats?.total_flows || 0,
        total_bytes: parseFloat(stats?.total_bytes || 0),
        resultado
      });
    } catch (e) {
      logger.error('Flow port-scan-check error:', e.message);
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
  function classificarAtaque(a) {
    const ratioConexAlvos = a.alvos > 0 ? a.conexoes / a.alvos : 0;
    const amplPorts = [53, 123, 161, 1900, 5353, 11211, 27015];
    const isAmpl = a.proto_pred === 17 && amplPorts.includes(a.porta_top);
    if (a.bps > 1e9 && a.alvos > 15 && a.conexoes > 100) return 'ddos';
    if (a.bps > 2e9) return 'ddos';
    if (ratioConexAlvos > 25 && a.conexoes > 30) return 'portscan';
    if (a.alvos <= 2 && a.conexoes > 60) return 'bruteforce';
    if (a.bps > 1e8 && isAmpl) return 'amplification';
    if (a.bps > 5e8 && a.alvos > 5) return 'suspeito';
    return 'suspeito';
  }
  async function detectarAtaques() {
    try {
      const [rows] = await db.execute(`
        SELECT f.ip_src,
               SUM(f.bytes_total * 8 / 60) AS bps,
               COUNT(DISTINCT f.ip_dst) AS alvos,
               COUNT(DISTINCT CONCAT(f.ip_dst,':',f.port_dst)) AS conexoes
        FROM flow_data.flow_minuto f
        WHERE f.timestamp >= NOW() - INTERVAL 1 MINUTE
        GROUP BY f.ip_src
        HAVING (bps > 500000000 AND alvos > 5) OR (bps > 2000000000) OR (conexoes > 100)
      `);
      for (const r of rows) {
        const [extra] = await db.execute(`
          SELECT proto, port_dst, COUNT(*) AS cnt
          FROM flow_data.flow_minuto
          WHERE ip_src = ? AND timestamp >= NOW() - INTERVAL 1 MINUTE
          GROUP BY proto, port_dst ORDER BY cnt DESC LIMIT 1
        `, [r.ip_src]);
        r.proto_pred = extra[0]?.proto || 0;
        r.porta_top = extra[0]?.port_dst || 0;
      }

      for (const ataque of rows) {
        const ip = ataque.ip_src;
        const tipo = classificarAtaque(ataque);
        const [exist] = await db.execute(
          `SELECT id FROM flow_data.ataques WHERE ip_src = ? AND status = 'ativo' LIMIT 1`,
          [ip]
        );
        if (exist.length === 0) {
          const descs = {
            ddos: `DDoS: ${(ataque.bps / 1e9).toFixed(2)} Gbps para ${ataque.alvos} alvos`,
            portscan: `Port Scan: ${ataque.conexoes} conexões em ${ataque.alvos} alvos`,
            bruteforce: `Brute Force: ${ataque.conexoes} tentativas, porta ${ataque.porta_top}`,
            amplification: `Amplificação (porta ${ataque.porta_top}): ${(ataque.bps / 1e6).toFixed(0)} Mbps`
          };
          await db.execute(
            `INSERT INTO flow_data.ataques (ip_src, bps, alvos, tipo, descricao, status)
             VALUES (?, ?, ?, ?, ?, 'ativo')`,
            [ip, Math.round(ataque.bps), ataque.alvos, tipo,
             descs[tipo] || `Tráfego suspeito: ${(ataque.bps / 1e9).toFixed(2)} Gbps para ${ataque.alvos} alvos`]
          );
          logger.warn(`Ataque detectado: ${ip} (${tipo}) - ${(ataque.bps / 1e9).toFixed(2)} Gbps`);
          try { io?.emit('novoAtaque', { ip_src: ip, bps: ataque.bps, tipo }); } catch {}
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

  // ── GeoIP lookup ──
  app.post('/api/flow/geoip', auth, (req, res) => {
    try {
      const { ips } = req.body;
      if (!Array.isArray(ips) || !ips.length)
        return res.status(400).json({ error: 'Envie um array de IPs' });
      const result = {};
      for (const ip of ips) {
        const lookup = geoip.lookup(ip);
        if (lookup) {
          result[ip] = {
            country: lookup.country,
            region: lookup.region,
            city: lookup.city,
            ll: lookup.ll
          };
        } else {
          result[ip] = null;
        }
      }
      res.json(result);
    } catch (e) {
      logger.error('Flow geoip error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── ASN lookup ──
  app.post('/api/flow/asn', auth, (req, res) => {
    try {
      const { ips } = req.body;
      if (!Array.isArray(ips) || !ips.length)
        return res.status(400).json({ error: 'Envie um array de IPs' });
      const result = {};
      for (const ip of ips) {
        const lookup = asnLookup.lookup(ip);
        if (lookup) {
          result[ip] = { asn: lookup.asn, org: lookup.org, code: lookup.code };
        } else {
          result[ip] = null;
        }
      }
      res.json(result);
    } catch (e) {
      logger.error('Flow asn error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Top ASNs ──
  app.get('/api/flow/top-asns', auth, async (req, res) => {
    try {
      const segundos = formatPeriodo(req.query.periodo || '1h');
      const limite = parseInt(req.query.limite) || 30;
      const where = ['timestamp >= NOW() - INTERVAL ? SECOND'];
      const params = [segundos];
      await applyEquipamentoFilter(req, where, params);
      await applyClienteFilter(req, where, params);
      const [rows] = await db.execute(`
        SELECT ip_src, ip_dst, COALESCE(SUM(bytes_total), 0) AS bytes_total,
               COALESCE(SUM(bytes_total * 8 / ${segundos}), 0) AS bps
        FROM flow_data.flow_minuto
        WHERE ${where.join(' AND ')}
        GROUP BY ip_src, ip_dst
        ORDER BY bps DESC
        LIMIT ${limite * 3}
      `, params);

      const asnMap = {};
      const seenIps = new Set();

      for (const r of rows) {
        for (const ip of [r.ip_src, r.ip_dst]) {
          if (!ip || seenIps.has(ip)) continue;
          seenIps.add(ip);
          const info = asnLookup.lookup(ip);
          const geo = geoip.lookup(ip);
          asnMap[ip] = {
            asn: info?.asn || 0,
            org: info?.org || 'Desconhecido',
            country: geo?.country || '??',
            city: geo?.city || ''
          };
        }
      }

      const asnGroups = {};
      for (const r of rows) {
        const srcInfo = asnMap[r.ip_src];
        const dstInfo = asnMap[r.ip_dst];
        for (const info of [srcInfo, dstInfo]) {
          if (!info || !info.asn) continue;
          const key = info.asn;
          if (!asnGroups[key]) {
            asnGroups[key] = {
              asn: info.asn, org: info.org, country: info.country,
              bps: 0, bytes: 0, ips: new Set(), flows: 0
            };
          }
          asnGroups[key].bps += r.bps || 0;
          asnGroups[key].bytes += r.bytes_total || 0;
          asnGroups[key].ips.add(r.ip_src);
          asnGroups[key].ips.add(r.ip_dst);
          asnGroups[key].flows++;
        }
      }

      let result = Object.values(asnGroups)
        .map(g => {
          const firstIp = [...g.ips].find(ip => asnMap[ip]?.asn === g.asn);
          const rangeInfo = firstIp ? asnLookup.lookup(firstIp) : null;
          return { ...g, ips: g.ips.size, asn: g.asn, range: rangeInfo?.range || '' };
        })
        .sort((a, b) => b.bps - a.bps)
        .slice(0, limite);

      const totalBps = result.reduce((s, x) => s + x.bps, 0);

      res.json({ asns: result, total_bps: totalBps, ips: asnMap });
    } catch (e) {
      logger.error('Flow top-asns error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Protocol distribution ──
  app.get('/api/flow/protocolos', auth, async (req, res) => {
    try {
      const segundos = formatPeriodo(req.query.periodo || '1h');
      const where = ['timestamp >= NOW() - INTERVAL ? SECOND'];
      const params = [segundos];
      await applyEquipamentoFilter(req, where, params);
      await applyClienteFilter(req, where, params);
      const [rows] = await db.execute(`
        SELECT proto,
               COALESCE(SUM(bytes_total), 0) AS bytes_total,
               COALESCE(SUM(flows_count), 0) AS total_flows,
               COALESCE(SUM(bytes_total * 8 / ${segundos}), 0) AS bps
        FROM flow_data.flow_minuto
        WHERE ${where.join(' AND ')}
        GROUP BY proto
        ORDER BY bytes_total DESC
      `, params);
      const protoMap = { 6: 'TCP', 17: 'UDP', 1: 'ICMP', 2: 'IGMP', 47: 'GRE', 50: 'ESP', 51: 'AH', 58: 'ICMPv6', 89: 'OSPF', 132: 'SCTP' };
      const result = rows.map(r => ({
        proto: r.proto,
        nome: protoMap[r.proto] || `Proto ${r.proto}`,
        bytes_total: parseFloat(r.bytes_total),
        total_flows: parseFloat(r.total_flows),
        bps: parseFloat(r.bps)
      }));
      const totalBps = result.reduce((s, x) => s + x.bps, 0);
      res.json({ protocolos: result, total_bps: totalBps });
    } catch (e) {
      logger.error('Flow protocolos error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Capacity metrics (peak, 95th, avg) ──
  app.get('/api/flow/metricas', auth, async (req, res) => {
    try {
      const segundos = formatPeriodo(req.query.periodo || '1h');
      const intervalo = segundos < 7200 ? 60 : 300;
      const where = ['timestamp >= NOW() - INTERVAL ? SECOND'];
      const params = [intervalo, intervalo, intervalo, intervalo, segundos];
      await applyEquipamentoFilter(req, where, params);
      await applyClienteFilter(req, where, params);
      const [rows] = await db.execute(`
        SELECT
          UNIX_TIMESTAMP(timestamp) DIV ? AS bucket,
          COALESCE(SUM(bytes_total * 8 / ?), 0) AS bps,
          COALESCE(SUM(CASE WHEN ${rangeMatch.sqlNotPrivateClause('ip_dst')} THEN bytes_total ELSE 0 END * 8 / ?), 0) AS in_bps,
          COALESCE(SUM(CASE WHEN ${rangeMatch.sqlNotPrivateClause('ip_src')} THEN bytes_total ELSE 0 END * 8 / ?), 0) AS out_bps
        FROM flow_data.flow_minuto
        WHERE ${where.join(' AND ')}
        GROUP BY bucket ORDER BY bucket ASC
      `, params);

      const vals = rows.map(r => r.bps);
      if (!vals.length) return res.json({ pico: 0, pico_bps: 0, media: 0, percentil95: 0, amostras: 0 });

      const valsIn = rows.map(r => r.in_bps);
      const valsOut = rows.map(r => r.out_bps);
      vals.sort((a, b) => a - b);
      valsIn.sort((a, b) => a - b);
      valsOut.sort((a, b) => a - b);
      const n = vals.length;
      const media = vals.reduce((s, v) => s + v, 0) / n;
      const mediaIn = valsIn.reduce((s, v) => s + v, 0) / n;
      const mediaOut = valsOut.reduce((s, v) => s + v, 0) / n;
      const pico = vals[n - 1];
      const idx95 = Math.ceil(0.95 * n) - 1;
      const percentil95 = vals[Math.max(0, idx95)];
      const picoRow = rows.reduce((a, b) => a.bps > b.bps ? a : b);

      res.json({
        pico_bps: Math.round(pico),
        pico_in_bps: Math.round(picoRow.in_bps),
        pico_out_bps: Math.round(picoRow.out_bps),
        pico_horario: new Date(picoRow.bucket * intervalo * 1000).toISOString(),
        media_bps: Math.round(media),
        media_in_bps: Math.round(mediaIn),
        media_out_bps: Math.round(mediaOut),
        percentil95_bps: Math.round(percentil95),
        periodo: req.query.periodo || '1h',
        intervalo_buckets: intervalo,
        amostras: n
      });
    } catch (e) {
      logger.error('Flow metricas error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── ASN traffic matrix ──
  app.get('/api/flow/matriz-asn', auth, async (req, res) => {
    try {
      const segundos = formatPeriodo(req.query.periodo || '1h');
      const limite = parseInt(req.query.limite) || 20;

      const where = ['timestamp >= NOW() - INTERVAL ? SECOND'];
      const params = [segundos];
      await applyEquipamentoFilter(req, where, params);
      await applyClienteFilter(req, where, params);

      const [rows] = await db.execute(`
        SELECT ip_src, ip_dst,
               COALESCE(SUM(bytes_total), 0) AS bytes_total,
               COALESCE(SUM(flows_count), 0) AS total_flows,
               COALESCE(SUM(bytes_total * 8 / ${segundos}), 0) AS bps
        FROM flow_data.flow_minuto
        WHERE ${where.join(' AND ')}
        GROUP BY ip_src, ip_dst
        ORDER BY bytes_total DESC
        LIMIT 200
      `, params);

      const asnCache = {};
      function getAsnInfo(ip) {
        if (asnCache[ip]) return asnCache[ip];
        const info = asnLookup.lookup(ip);
        const geo = geoip.lookup(ip);
        const isPriv = ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('192.168.') || (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31);
        asnCache[ip] = {
          asn: isPriv ? -1 : (info?.asn || 0),
          org: isPriv ? 'Rede Interna' : (info?.org || 'Desconhecido'),
          country: isPriv ? '--' : (geo?.country || '??')
        };
        return asnCache[ip];
      }

      const pairs = {};
      for (const r of rows) {
        if (!r.ip_src || !r.ip_dst) continue;
        const src = getAsnInfo(r.ip_src);
        const dst = getAsnInfo(r.ip_dst);
        if (!src) continue;
        if (!dst) continue;
        const key = `${src.asn}->${dst.asn}`;
        if (!pairs[key]) {
          pairs[key] = {
            src_asn: src.asn, src_org: src.org, src_country: src.country,
            dst_asn: dst.asn, dst_org: dst.org, dst_country: dst.country,
            bps: 0, bytes_total: 0, total_flows: 0, ips: new Set()
          };
        }
        pairs[key].bps += r.bps || 0;
        pairs[key].bytes_total += parseFloat(r.bytes_total) || 0;
        pairs[key].total_flows += parseFloat(r.total_flows) || 0;
        pairs[key].ips.add(r.ip_src);
        pairs[key].ips.add(r.ip_dst);
      }

      let result = Object.values(pairs)
        .map(p => ({ ...p, ips: p.ips.size }))
        .sort((a, b) => b.bps - a.bps)
        .slice(0, limite);

      const totalBps = result.reduce((s, x) => s + x.bps, 0);
      res.json({ pares: result, total_bps: totalBps });
    } catch (e) {
      logger.error('Flow matriz-asn error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Top subnets (by prefix) ──
  app.get('/api/flow/top-subnets', auth, async (req, res) => {
    try {
      const segundos = formatPeriodo(req.query.periodo || '1h');
      const limite = parseInt(req.query.limite) || 30;
      const prefixo = parseInt(req.query.prefixo) || 24;
      const lado = req.query.lado || 'src';
      const ipCol = lado === 'src' ? 'ip_src' : 'ip_dst';

      const where = ['timestamp >= NOW() - INTERVAL ? SECOND'];
      const params = [segundos, limite];
      await applyEquipamentoFilter(req, where, params);
      await applyClienteFilter(req, where, params);

      const [rows] = await db.execute(`
        SELECT
          INET_NTOA(INET_ATON(${ipCol}) & ~(POW(2,32-${prefixo})-1)) AS subnet,
          COALESCE(SUM(bytes_total), 0) AS bytes_total,
          COALESCE(COUNT(DISTINCT ${ipCol}), 0) AS ips_ativos,
          COALESCE(SUM(flows_count), 0) AS total_flows,
          MAX(${ipCol}) AS top_ip
        FROM flow_data.flow_minuto
        WHERE ${where.join(' AND ')}
        GROUP BY subnet
        ORDER BY bytes_total DESC
        LIMIT ?
      `, params);

      const totalBytes = rows.reduce((s, r) => s + parseFloat(r.bytes_total), 0);
      const result = rows.map(r => ({
        subnet: r.subnet + '/' + prefixo,
        bytes_total: parseFloat(r.bytes_total),
        bps: parseFloat(r.bytes_total) * 8 / segundos,
        ips_ativos: parseInt(r.ips_ativos),
        total_flows: parseFloat(r.total_flows),
        top_ip: r.top_ip,
        pct: totalBytes > 0 ? Math.round(parseFloat(r.bytes_total) / totalBytes * 10000) / 100 : 0
      }));

      res.json(result);
    } catch (e) {
      logger.error('Flow top-subnets error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Top apps (port-based) ──
  app.get('/api/flow/top-apps', auth, async (req, res) => {
    try {
      const segundos = formatPeriodo(req.query.periodo || '1h');
      const limite = parseInt(req.query.limite) || 15;
      const portas = req.query.portas === 'todas';

      const where = ['timestamp >= NOW() - INTERVAL ? SECOND', 'port_dst IS NOT NULL AND port_dst > 0'];
      const params = [segundos];
      await applyEquipamentoFilter(req, where, params);
      await applyClienteFilter(req, where, params);

      const [rows] = await db.execute(`
        SELECT port_dst, proto,
               COALESCE(SUM(bytes_total), 0) AS bytes_total,
               COALESCE(SUM(flows_count), 0) AS total_flows,
               COALESCE(SUM(bytes_total * 8 / ${segundos}), 0) AS bps
        FROM flow_data.flow_minuto
        WHERE ${where.join(' AND ')}
        GROUP BY port_dst, proto
        ORDER BY bytes_total DESC
        LIMIT ${limite * 3}
      `, params);

      const appMap = {
        20:'FTP',21:'FTP',22:'SSH',23:'Telnet',25:'SMTP',
        53:'DNS',67:'DHCP',68:'DHCP',69:'TFTP',
        80:'HTTP',110:'POP3',123:'NTP',135:'RPC',137:'NetBIOS',
        139:'NetBIOS',143:'IMAP',161:'SNMP',162:'SNMP-Trap',
        389:'LDAP',443:'HTTPS',445:'SMB',465:'SMTPS',
        500:'IPsec',514:'Syslog',520:'RIP',587:'SMTP-Sub',
        636:'LDAPS',993:'IMAPS',995:'POP3S',
        1080:'Proxy',1433:'MSSQL',1521:'Oracle',
        1701:'L2TP',1723:'PPTP',1812:'RADIUS',
        2049:'NFS',2082:'cPanel',2083:'cPanel-SSL',
        3128:'Squid',3306:'MySQL',3389:'RDP',
        3690:'SVN',4333:'mSQL',4500:'IPsec-NAT',
        5000:'UPnP',5060:'SIP',5222:'XMPP',
        5223:'XMPP-SSL',5432:'PostgreSQL',5500:'VNC',
        5631:'pcAnywhere',5800:'VNC-HTTP',5900:'VNC',
        5984:'CouchDB',6000:'X11',6080:'VNC-WS',
        6379:'Redis',6443:'HTTPS-Alt',6667:'IRC',
        8080:'HTTP-Alt',8081:'HTTP-Proxy',8443:'HTTPS-Alt',
        8444:'HTTPS-Alt',9000:'SonarQube',9001:'Tor',
        9090:'Prometheus',9092:'Kafka',9100:'NodeExporter',
        9200:'Elasticsearch',9300:'Elasticsearch',
        9418:'Git',9600:'Logstash',9999:'Zabbix',
        10000:'Webmin',11211:'Memcached',
        27017:'MongoDB',32400:'Plex',
        50070:'HDFS',50075:'HDFS'
      };

      const grouped = {};
      for (const r of rows) {
        const name = appMap[r.port_dst] || 'Outros';
        if (!grouped[name]) grouped[name] = { bytes: 0, flows: 0, bps: 0, ports: [] };
        grouped[name].bytes += parseFloat(r.bytes_total) || 0;
        grouped[name].flows += parseFloat(r.total_flows) || 0;
        grouped[name].bps += parseFloat(r.bps) || 0;
        if (!grouped[name].ports.includes(r.port_dst))
          grouped[name].ports.push(r.port_dst);
      }

      // merge low-traffic into "Outros"
      let list = Object.entries(grouped).map(([name, d]) => ({ name, ...d }));
      const thresh = list.reduce((s, x) => s + x.bps, 0) * 0.02;
      let outros = { name: 'Outros', bytes: 0, flows: 0, bps: 0, ports: [] };
      list = list.filter(x => {
        if (x.name === 'Outros') return true;
        if (x.bps < thresh && list.length > limite) {
          outros.bytes += x.bytes; outros.flows += x.flows;
          outros.bps += x.bps; outros.ports.push(...x.ports);
          return false;
        }
        return true;
      });
      if (outros.bps > 0) list.push(outros);

      list.sort((a, b) => b.bps - a.bps);
      res.json(list);
    } catch (e) {
      logger.error('Flow top-apps error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Period comparison ──
  // ── Weekly capacity report ──
  app.get('/api/flow/comparativo-semanal', auth, async (req, res) => {
    try {
      const intv = 3600;
      async function fetchWeek(offsetWeeks) {
        const [r] = await db.execute(`
          SELECT
            UNIX_TIMESTAMP(timestamp) DIV ? AS bucket,
            COALESCE(SUM(bytes_total * 8 / ?), 0) AS bps,
            COALESCE(SUM(CASE WHEN ${rangeMatch.sqlNotPrivateClause('ip_dst')} THEN bytes_total ELSE 0 END), 0) AS in_bytes,
            COALESCE(SUM(CASE WHEN ${rangeMatch.sqlNotPrivateClause('ip_src')} THEN bytes_total ELSE 0 END), 0) AS out_bytes,
            COALESCE(SUM(bytes_total), 0) AS total_bytes
          FROM flow_data.flow_minuto
          WHERE timestamp >= NOW() - INTERVAL ? WEEK AND timestamp < NOW() - INTERVAL ? WEEK
          GROUP BY bucket ORDER BY bucket ASC
        `, [intv, intv, offsetWeeks, offsetWeeks - 1]);
        return r;
      }
      const [thisWeek, lastWeek] = await Promise.all([fetchWeek(0), fetchWeek(1)]);

      function stats(rows) {
        if (!rows.length) return { total_bps: 0, total_bytes: 0, pico_bps: 0, pico_in_bps: 0, pico_out_bps: 0, media_bps: 0, media_in_bps: 0, media_out_bps: 0, amostras: 0, inicio: '', fim: '' };
        const totalBps = rows.reduce((s, x) => s + x.bps, 0);
        const totalBytes = rows.reduce((s, x) => s + parseFloat(x.total_bytes), 0);
        const media = totalBps / rows.length;
        const mediaIn = rows.reduce((s, x) => s + (x.in_bytes * 8 / intv), 0) / rows.length;
        const mediaOut = rows.reduce((s, x) => s + (x.out_bytes * 8 / intv), 0) / rows.length;
        const picoRow = rows.reduce((a, b) => a.bps > b.bps ? a : b);
        const firstT = rows[0].bucket * intv;
        const lastT = rows[rows.length - 1].bucket * intv;
        return {
          total_bps: Math.round(totalBps),
          total_bytes: parseFloat(totalBytes.toFixed(0)),
          pico_bps: Math.round(picoRow.bps),
          pico_in_bps: Math.round(picoRow.in_bytes * 8 / intv),
          pico_out_bps: Math.round(picoRow.out_bytes * 8 / intv),
          pico_horario: new Date(picoRow.bucket * intv * 1000).toISOString(),
          media_bps: Math.round(media),
          media_in_bps: Math.round(mediaIn),
          media_out_bps: Math.round(mediaOut),
          amostras: rows.length,
          inicio: new Date(firstT * 1000).toISOString(),
          fim: new Date(lastT * 1000).toISOString()
        };
      }
      const s1 = stats(thisWeek);
      const s2 = stats(lastWeek);
      function diff(curr, prev) {
        if (!prev) return 0;
        return Math.round((curr - prev) / prev * 100);
      }
      res.json({
        esta_semana: s1,
        semana_passada: s2,
        diff_total_pct: diff(s1.total_bps, s2.total_bps),
        diff_total_bytes_pct: diff(s1.total_bytes, s2.total_bytes),
        diff_pico_pct: diff(s1.pico_bps, s2.pico_bps),
        diff_media_pct: diff(s1.media_bps, s2.media_bps)
      });
    } catch (e) {
      logger.error('Flow comparativo-semanal error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/flow/comparar', auth, async (req, res) => {
    try {
      const p1 = req.query.p1 || '30m';
      const p2 = req.query.p2 || '6h';
      const intv = parseInt(req.query.intervalo) || 300;

      async function fetch(periodo) {
        const seg = formatPeriodo(periodo);
        const [r] = await db.execute(`
          SELECT UNIX_TIMESTAMP(timestamp) DIV ? AS bucket,
            COALESCE(SUM(CASE WHEN ${rangeMatch.sqlNotPrivateClause('ip_dst')} THEN bytes_total ELSE 0 END), 0) AS in_bytes,
            COALESCE(SUM(CASE WHEN ${rangeMatch.sqlNotPrivateClause('ip_src')} THEN bytes_total ELSE 0 END), 0) AS out_bytes
          FROM flow_data.flow_minuto
          WHERE timestamp >= NOW() - INTERVAL ? SECOND
          GROUP BY bucket ORDER BY bucket ASC
        `, [intv, seg]);
        return r.map(x => ({
          t: x.bucket * intv * 1000,
          in_bps: x.in_bytes * 8 / intv,
          out_bps: x.out_bytes * 8 / intv
        }));
      }

      const [series1, series2] = await Promise.all([fetch(p1), fetch(p2)]);
      res.json({ periodo1: p1, periodo2: p2, series1, series2 });
    } catch (e) {
      logger.error('Flow comparar error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Live flow feed via Socket.IO ──
  function emitLiveFlows() {
    if (!io) return;
    db.execute(`
      SELECT ip_src, ip_dst, port_src, port_dst, proto,
             bytes_total, flows_count, timestamp
      FROM flow_data.flow_minuto
      WHERE timestamp >= NOW() - INTERVAL 60 SECOND
      ORDER BY timestamp DESC LIMIT 50
    `).then(([rows]) => {
      if (rows && rows.length) {
        io.emit('liveFlows', rows);
      }
    }).catch(e => logger.error('Live flows query error:', e.message));
  }
  setInterval(emitLiveFlows, 10000);

  // Polling de deteção a cada 60s
  const ATAQUE_POLL = 60000;
  setInterval(detectarAtaques, ATAQUE_POLL);

  // Try to download ASN DB if not loaded
  if (!asnLookup.loaded()) {
    asnLookup.download().catch(e => logger.warn('ASN download failed:', e.message));
  }

  logger.info('Flow routes loaded');
};
