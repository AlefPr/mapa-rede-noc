const db = require('../db');
const logger = require('../logger');

exports.listarTemplates = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM templates_rotas ORDER BY nome ASC');
    res.json(rows);
  } catch (error) {
    logger.error('Erro ao listar templates:', error);
    res.status(500).json({ error: 'Erro ao listar templates' });
  }
};

exports.criarTemplate = async (req, res) => {
  try {
    const { nome, descricao, itens_zabbix } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const [result] = await db.execute(
      'INSERT INTO templates_rotas (nome, descricao, itens_zabbix) VALUES (?, ?, ?)',
      [nome, descricao || '', itens_zabbix ? JSON.stringify(itens_zabbix) : null]
    );
    const [novo] = await db.execute('SELECT * FROM templates_rotas WHERE id = ?', [result.insertId]);
    logger.info(`Template criado: ${nome}`);
    res.status(201).json(novo[0]);
  } catch (error) {
    logger.error('Erro ao criar template:', error);
    res.status(500).json({ error: 'Erro ao criar template' });
  }
};

exports.excluirTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('DELETE FROM templates_rotas WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Erro ao excluir template:', error);
    res.status(500).json({ error: 'Erro ao excluir template' });
  }
};
