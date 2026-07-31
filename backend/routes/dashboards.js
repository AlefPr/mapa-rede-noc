const db = require('../db');
const logger = require('../logger');
const { autenticarToken } = require('../middleware/auth');

function auth(req, res, next) { autenticarToken(req, res, next); }

module.exports = (app) => {

  // ── Listar dashboards ──
  app.get('/api/flow/dashboards', auth, async (req, res) => {
    try {
      const [rows] = await db.execute(
        'SELECT id, nome, descricao, widgets, ativo FROM flow_data.dashboards ORDER BY nome'
      );
      res.json(rows.map(r => ({ ...r, widgets: typeof r.widgets === 'string' ? JSON.parse(r.widgets) : (r.widgets || []) })));
    } catch (e) {
      logger.error('Dashboards list error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Buscar dashboard ──
  app.get('/api/flow/dashboards/:id', auth, async (req, res) => {
    try {
      const [rows] = await db.execute(
        'SELECT id, nome, descricao, widgets, ativo FROM flow_data.dashboards WHERE id = ?', [parseInt(req.params.id)]
      );
      if (!rows.length) return res.status(404).json({ error: 'Dashboard não encontrado' });
      const r = rows[0];
      res.json({ ...r, widgets: typeof r.widgets === 'string' ? JSON.parse(r.widgets) : (r.widgets || []) });
    } catch (e) {
      logger.error('Dashboard get error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Criar dashboard ──
  app.post('/api/flow/dashboards', auth, async (req, res) => {
    try {
      const { nome, descricao, widgets } = req.body;
      if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
      const [r] = await db.execute(
        'INSERT INTO flow_data.dashboards (nome, descricao, widgets) VALUES (?,?,?)',
        [nome, descricao || null, JSON.stringify(widgets || [])]
      );
      res.status(201).json({ id: r.insertId });
    } catch (e) {
      logger.error('Dashboard create error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Atualizar dashboard ──
  app.put('/api/flow/dashboards/:id', auth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nome, descricao, widgets, ativo } = req.body;
      if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
      await db.execute(
        'UPDATE flow_data.dashboards SET nome=?, descricao=?, widgets=?, ativo=? WHERE id=?',
        [nome, descricao || null, JSON.stringify(widgets || []), ativo === undefined ? 1 : (ativo ? 1 : 0), id]
      );
      res.json({ ok: true });
    } catch (e) {
      logger.error('Dashboard update error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Excluir dashboard ──
  app.delete('/api/flow/dashboards/:id', auth, async (req, res) => {
    try {
      await db.execute('DELETE FROM flow_data.dashboards WHERE id = ?', [parseInt(req.params.id)]);
      res.json({ ok: true });
    } catch (e) {
      logger.error('Dashboard delete error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

};
