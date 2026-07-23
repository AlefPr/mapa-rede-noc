const db = require('../db');
const logger = require('../logger');

exports.getSLA = async (req, res) => {
  try {
    const period = parseInt(req.query.periodo) || 30;
    const now = new Date();
    const from = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
    const periodSeconds = period * 24 * 3600;

    const [rotas] = await db.execute('SELECT id, nome_rota, cor FROM rotas');
    if (!rotas.length) return res.json([]);

    const [problemas] = await db.execute(
      `SELECT p.rota_id, p.data_inicio, p.data_fim, p.severidade, p.status
       FROM problemas p
       WHERE p.data_inicio >= ? OR (p.data_fim IS NOT NULL AND p.data_fim >= ?)`,
      [from, from]
    );

    const downtimeByRota = {};
    const incidentCountByRota = {};

    for (const p of problemas) {
      const inicio = new Date(p.data_inicio).getTime();
      const fim = p.data_fim ? new Date(p.data_fim).getTime() : now.getTime();
      const effectiveStart = Math.max(inicio, from.getTime());
      const effectiveEnd = Math.min(fim, now.getTime());
      const downtimeMs = Math.max(0, effectiveEnd - effectiveStart);

      if (!downtimeByRota[p.rota_id]) downtimeByRota[p.rota_id] = 0;
      downtimeByRota[p.rota_id] += downtimeMs;

      if (!incidentCountByRota[p.rota_id]) incidentCountByRota[p.rota_id] = 0;
      incidentCountByRota[p.rota_id]++;
    }

    const result = rotas.map(rota => {
      const downtimeMs = downtimeByRota[rota.id] || 0;
      const uptimeSeconds = periodSeconds - (downtimeMs / 1000);
      const sla = periodSeconds > 0 ? Math.max(0, (uptimeSeconds / periodSeconds) * 100) : 100;
      return {
        id: rota.id,
        nome: rota.nome_rota,
        cor: rota.cor,
        sla: parseFloat(sla.toFixed(3)),
        downtimeMin: Math.round(downtimeMs / 60000),
        incidentes: incidentCountByRota[rota.id] || 0,
        periodo: `${period}d`
      };
    });

    result.sort((a, b) => a.sla - b.sla);
    res.json(result);
  } catch (error) {
    logger.error('Erro ao calcular SLA:', error);
    res.status(500).json({ error: 'Erro ao calcular SLA' });
  }
};
