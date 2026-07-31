const db = require('../db');
const logger = require('../logger');
const { autenticarToken } = require('../middleware/auth');
const clienteRange = require('../services/clienteRange');
const { applyEquipamentoFilter, applyClienteFilter } = require('../services/flowFilters');

function formatPeriodo(periodo) {
  const map = { '30m': 1800, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };
  return map[periodo] || 3600;
}

function auth(req, res, next) { autenticarToken(req, res, next); }

function parseBlocos(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map(b => typeof b === 'string' ? b.trim() : (b && b.bloco ? b.bloco : null))
    .filter(Boolean);
}

module.exports = (app) => {

  // ── Listar clientes com blocos ──
  app.get('/api/clientes', auth, async (req, res) => {
    try {
      const [clientes] = await db.execute(
        'SELECT * FROM flow_data.clientes ORDER BY nome'
      );
      const [blocos] = await db.execute(
        'SELECT id, cliente_id, bloco, descricao FROM flow_data.cliente_blocos ORDER BY bloco'
      );
      const byCliente = {};
      blocos.forEach(b => {
        if (!byCliente[b.cliente_id]) byCliente[b.cliente_id] = [];
        byCliente[b.cliente_id].push({ id: b.id, bloco: b.bloco, descricao: b.descricao });
      });
      res.json(clientes.map(c => ({ ...c, blocos: byCliente[c.id] || [] })));
    } catch (e) {
      logger.error('Clientes list error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Criar cliente ──
  app.post('/api/clientes', auth, async (req, res) => {
    try {
      const { nome, documento, contato, telefone, email, endereco, plano, banda_contratada_mbps, blocos } = req.body;
      if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
      const [r] = await db.execute(
        `INSERT INTO flow_data.clientes
         (nome, documento, contato, telefone, email, endereco, plano, banda_contratada_mbps, ativo)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [nome, documento || null, contato || null, telefone || null, email || null,
         endereco || null, plano || null, banda_contratada_mbps ? parseInt(banda_contratada_mbps) : null, 1]
      );
      for (const bloco of parseBlocos(blocos)) {
        await db.execute(
          'INSERT INTO flow_data.cliente_blocos (cliente_id, bloco) VALUES (?,?)', [r.insertId, bloco]
        );
      }
      await clienteRange.reloadFromDb();
      res.status(201).json({ id: r.insertId });
    } catch (e) {
      logger.error('Cliente create error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Atualizar cliente ──
  app.put('/api/clientes/:id', auth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nome, documento, contato, telefone, email, endereco, plano, banda_contratada_mbps, ativo } = req.body;
      if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
      await db.execute(
        `UPDATE flow_data.clientes SET nome=?, documento=?, contato=?, telefone=?, email=?,
         endereco=?, plano=?, banda_contratada_mbps=?, ativo=? WHERE id=?`,
        [nome, documento || null, contato || null, telefone || null, email || null,
         endereco || null, plano || null, banda_contratada_mbps ? parseInt(banda_contratada_mbps) : null,
         ativo === undefined ? 1 : (ativo ? 1 : 0), id]
      );
      await clienteRange.reloadFromDb();
      res.json({ ok: true });
    } catch (e) {
      logger.error('Cliente update error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Excluir cliente (cascade nos blocos) ──
  app.delete('/api/clientes/:id', auth, async (req, res) => {
    try {
      await db.execute('DELETE FROM flow_data.clientes WHERE id = ?', [parseInt(req.params.id)]);
      await clienteRange.reloadFromDb();
      res.json({ ok: true });
    } catch (e) {
      logger.error('Cliente delete error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Adicionar bloco a cliente ──
  app.post('/api/clientes/:id/blocos', auth, async (req, res) => {
    try {
      const clienteId = parseInt(req.params.id);
      const { bloco, descricao } = req.body;
      if (!bloco) return res.status(400).json({ error: 'Bloco é obrigatório' });
      const [r] = await db.execute(
        'INSERT INTO flow_data.cliente_blocos (cliente_id, bloco, descricao) VALUES (?,?,?)',
        [clienteId, bloco.trim(), descricao || null]
      );
      await clienteRange.reloadFromDb();
      res.status(201).json({ id: r.insertId });
    } catch (e) {
      logger.error('Cliente bloco add error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Remover bloco ──
  app.delete('/api/clientes/blocos/:blocoId', auth, async (req, res) => {
    try {
      await db.execute('DELETE FROM flow_data.cliente_blocos WHERE id = ?', [parseInt(req.params.blocoId)]);
      await clienteRange.reloadFromDb();
      res.json({ ok: true });
    } catch (e) {
      logger.error('Cliente bloco delete error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Resumo de uso por cliente ──
  app.get('/api/flow/clientes/resumo', auth, async (req, res) => {
    try {
      const segundos = formatPeriodo(req.query.periodo || '1h');
      const whereBase = ['timestamp >= NOW() - INTERVAL ? SECOND'];
      const paramsBase = [segundos];
      await applyEquipamentoFilter(req, whereBase, paramsBase);
      const whereSql = whereBase.join(' AND ');
      const params = [...paramsBase];

      const clienteList = clienteRange.list().filter(c => c.id !== 0 && c.blocos.length);
      const out = [];
      for (const c of clienteList) {
        const src = clienteRange.sqlClauseForCliente(c.id, 'ip_src');
        const dst = clienteRange.sqlClauseForCliente(c.id, 'ip_dst');
        const [rows] = await db.execute(`
          SELECT
            COALESCE(SUM(bytes_total * 8 / ?), 0) AS bps,
            COALESCE(SUM(CASE WHEN ${src} THEN bytes_total ELSE 0 END * 8 / ?), 0) AS up_bps,
            COALESCE(SUM(CASE WHEN ${dst} THEN bytes_total ELSE 0 END * 8 / ?), 0) AS down_bps
          FROM flow_data.flow_minuto
          WHERE ${whereSql} AND (${src} OR ${dst})
        `, [segundos, segundos, segundos, ...params]);
        const bps = rows[0]?.bps || 0;
        out.push({
          id: c.id, nome: c.nome, plano: c.plano,
          banda_contratada_mbps: c.banda_contratada_mbps,
          blocos: c.blocos.map(b => b.ip + '/' + b.bits),
          bps: Math.round(bps),
          up_bps: Math.round(rows[0]?.up_bps || 0),
          down_bps: Math.round(rows[0]?.down_bps || 0),
          pct_uso: c.banda_contratada_mbps ? Math.round(bps / (c.banda_contratada_mbps * 1e6) * 100) : null
        });
      }
      res.json(out);
    } catch (e) {
      logger.error('Clientes resumo error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Série de tráfego de um cliente ──
  app.get('/api/flow/cliente/:id/trafego', auth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const segundos = formatPeriodo(req.query.periodo || '6h');
      const intervaloSeg = parseInt(req.query.intervalo) || 300;
      const src = clienteRange.sqlClauseForCliente(id, 'ip_src');
      const dst = clienteRange.sqlClauseForCliente(id, 'ip_dst');
      if (!src || !dst) return res.status(404).json({ error: 'Cliente sem blocos' });
      const [rows] = await db.execute(`
        SELECT UNIX_TIMESTAMP(timestamp) DIV ? AS bucket,
               COALESCE(SUM(bytes_total * 8 / ?), 0) AS bps
        FROM flow_data.flow_minuto
        WHERE timestamp >= NOW() - INTERVAL ? SECOND AND (${src} OR ${dst})
        GROUP BY bucket ORDER BY bucket ASC
      `, [intervaloSeg, intervaloSeg, segundos]);
      res.json(rows.map(r => ({ t: r.bucket * intervaloSeg * 1000, bps: r.bps })));
    } catch (e) {
      logger.error('Cliente trafego error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

};
