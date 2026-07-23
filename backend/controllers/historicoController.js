const db = require('../db');
const logger = require('../logger');

exports.getHistorico = async (req, res) => {
  try {
    const { id } = req.params;
    const dias = parseInt(req.query.dias) || 30;

    const [rows] = await db.execute(
      `SELECT timestamp, in_bps, out_bps
       FROM historico_trafego
       WHERE rota_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY timestamp ASC`,
      [id, dias]
    );

    res.json(rows);
  } catch (error) {
    logger.error('Erro ao buscar histórico:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
};
