const db = require('../db');
const clienteRange = require('./clienteRange');

// Adiciona filtro opcional por equipamento (agent_id) a uma query.
// Uso: const where = ['timestamp >= NOW() - INTERVAL ? SECOND']; const params=[segundos];
//      await applyEquipamentoFilter(req, where, params);
async function applyEquipamentoFilter(req, where, params) {
  const eqId = parseInt(req.query.equipamento_id);
  if (!eqId) return;
  const [rows] = await db.execute('SELECT agent_id FROM flow_data.equipamentos WHERE id = ?', [eqId]);
  if (!rows.length) return;
  const agentId = rows[0].agent_id;
  if (agentId) {
    where.push('agent_id = ?');
    params.push(agentId);
  }
}

// Adiciona filtro opcional por cliente (blocos CIDR) a uma query.
async function applyClienteFilter(req, where, params) {
  const cliId = parseInt(req.query.cliente_id);
  if (!cliId) return;
  const src = clienteRange.sqlClauseForCliente(cliId, 'ip_src');
  const dst = clienteRange.sqlClauseForCliente(cliId, 'ip_dst');
  if (src && dst) {
    where.push(`(${src} OR ${dst})`);
  } else if (src) {
    where.push(src);
  } else if (dst) {
    where.push(dst);
  } else {
    where.push('1=0');
  }
}

module.exports = { applyEquipamentoFilter, applyClienteFilter };
