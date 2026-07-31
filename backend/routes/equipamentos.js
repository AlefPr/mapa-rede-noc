const db = require('../db');
const logger = require('../logger');
const { autenticarToken } = require('../middleware/auth');

function formatPeriodo(periodo) {
  const map = { '30m': 1800, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };
  return map[periodo] || 3600;
}

function auth(req, res, next) { autenticarToken(req, res, next); }

module.exports = (app) => {

  // ── Listar equipamentos com tráfego ao vivo ──
  app.get('/api/flow/equipamentos', auth, async (req, res) => {
    try {
      const segundos = formatPeriodo(req.query.periodo || '1h');
      const [equip] = await db.execute(
        'SELECT id, nome, fabricante, modelo, tipo, ip, localidade, agent_id, ativo FROM flow_data.equipamentos ORDER BY nome'
      );
      const [traff] = await db.execute(`
        SELECT agent_id,
               COALESCE(SUM(bytes_total * 8 / ?), 0) AS bps,
               COALESCE(SUM(bytes_total), 0) AS bytes_total
        FROM flow_data.flow_minuto
        WHERE timestamp >= NOW() - INTERVAL ? SECOND AND agent_id > 0
        GROUP BY agent_id
      `, [segundos, segundos]);

      const byAgent = {};
      traff.forEach(t => { byAgent[t.agent_id] = t; });

      const result = equip.map(e => {
        const t = byAgent[e.agent_id] || { bps: 0, bytes_total: 0 };
        return { ...e, bps: Math.round(t.bps), bytes_total: Math.round(t.bytes_total) };
      });

      res.json(result);
    } catch (e) {
      logger.error('Flow equipamentos error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Séries de tráfego de um equipamento ──
  app.get('/api/flow/equipamento/:id/trafego', auth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const segundos = formatPeriodo(req.query.periodo || '6h');
      const intervaloSeg = parseInt(req.query.intervalo) || 300;

      const [equip] = await db.execute(
        'SELECT agent_id FROM flow_data.equipamentos WHERE id = ?', [id]
      );
      if (!equip.length) return res.status(404).json({ error: 'Equipamento não encontrado' });
      const agentId = equip[0].agent_id || 0;

      const [rows] = await db.execute(`
        SELECT UNIX_TIMESTAMP(timestamp) DIV ? AS bucket,
               COALESCE(SUM(bytes_total * 8 / ?), 0) AS bps
        FROM flow_data.flow_minuto
        WHERE timestamp >= NOW() - INTERVAL ? SECOND AND agent_id = ?
        GROUP BY bucket ORDER BY bucket ASC
      `, [intervaloSeg, intervaloSeg, segundos, agentId]);

      res.json(rows.map(r => ({ t: r.bucket * intervaloSeg * 1000, bps: r.bps })));
    } catch (e) {
      logger.error('Flow equipamento trafego error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Criar equipamento ──
  app.post('/api/flow/equipamentos', auth, async (req, res) => {
    try {
      const { nome, fabricante, modelo, tipo, ip, localidade, agent_id } = req.body;
      if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
      const [r] = await db.execute(
        'INSERT INTO flow_data.equipamentos (nome, fabricante, modelo, tipo, ip, localidade, agent_id) VALUES (?,?,?,?,?,?,?)',
        [nome, fabricante || null, modelo || null, tipo || 'roteador', ip || null, localidade || null, agent_id || null]
      );
      res.status(201).json({ id: r.insertId });
    } catch (e) {
      logger.error('Flow equipamento create error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Atualizar equipamento ──
  app.put('/api/flow/equipamentos/:id', auth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nome, fabricante, modelo, tipo, ip, localidade, agent_id, ativo } = req.body;
      if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
      await db.execute(
        `UPDATE flow_data.equipamentos SET nome=?, fabricante=?, modelo=?, tipo=?, ip=?, localidade=?, agent_id=?, ativo=? WHERE id=?`,
        [nome, fabricante || null, modelo || null, tipo || 'roteador', ip || null, localidade || null, agent_id || null, ativo === undefined ? 1 : (ativo ? 1 : 0), id]
      );
      res.json({ ok: true });
    } catch (e) {
      logger.error('Flow equipamento update error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Excluir equipamento ──
  app.delete('/api/flow/equipamentos/:id', auth, async (req, res) => {
    try {
      await db.execute('DELETE FROM flow_data.equipamentos WHERE id = ?', [parseInt(req.params.id)]);
      res.json({ ok: true });
    } catch (e) {
      logger.error('Flow equipamento delete error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

};
