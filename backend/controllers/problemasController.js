const db = require('../db');
const logger = require('../logger');

exports.webhook = async (req, res, io) => {
  let connection;
  try {
    const { itemid, trigger_status, trigger_id, trigger_name, trigger_severity } = req.body;
    
    if (!itemid || !trigger_id) {
      return res.status(400).json({ error: "Dados incompletos. 'itemid' e 'trigger_id' são obrigatórios." });
    }
    if (trigger_status && !['PROBLEM', 'OK'].includes(trigger_status)) {
      return res.status(400).json({ error: "'trigger_status' deve ser 'PROBLEM' ou 'OK'." });
    }

    connection = await db.getConnection();

    const [itens] = await connection.execute('SELECT rota_id FROM rota_zabbix_items WHERE zabbix_itemid = ? LIMIT 1', [itemid]);
    if (itens.length === 0) return res.json({ message: "Ignorado. Item não pertence a nenhuma rota mapeada." });

    const rotaId = itens[0].rota_id;

    if (trigger_status === "PROBLEM") {
      const [existente] = await connection.execute('SELECT id FROM problemas WHERE trigger_id = ? AND status = "Ativo"', [trigger_id]);
      if (existente.length === 0) {
        await connection.execute(
          'INSERT INTO problemas (rota_id, trigger_id, descricao, severidade) VALUES (?, ?, ?, ?)',
          [rotaId, trigger_id, trigger_name || "Falha na interface", trigger_severity || "Erro"]
        );
        io.emit('novoProblema', { rotaId, trigger_id, status: 'Ativo' });
      }
    } else if (trigger_status === "OK") {
      await connection.execute(
        'UPDATE problemas SET status = "Resolvido", data_fim = NOW() WHERE trigger_id = ? AND status = "Ativo"',
        [trigger_id]
      );
      io.emit('problemaResolvido', { rotaId, trigger_id, status: 'Resolvido' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error("Erro no webhook:", error);
    res.status(500).json({ error: "Erro interno no servidor." });
  } finally {
    if (connection) connection.release();
  }
};

exports.listarProblemas = async (req, res) => {
  const { severidade } = req.query;
  if (severidade && !['Crítico', 'Erro', 'Aviso'].includes(severidade)) {
    return res.status(400).json({ error: "Severidade inválida." });
  }
  try {
    const { severidade } = req.query;
    let sql = `
      SELECT p.*, r.nome_rota, r.cor 
      FROM problemas p
      JOIN rotas r ON p.rota_id = r.id
    `;
    const params = [];

    if (severidade) {
        sql += ' WHERE p.severidade = ?';
        params.push(severidade);
    }
    
    sql += ' ORDER BY p.status ASC, p.data_inicio DESC';
    
    const [rows] = await db.execute(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar problemas." });
  }
};

exports.limparProblemas = async (req, res, io) => {
  try {
    await db.execute('DELETE FROM problemas WHERE status = "Resolvido"');
    io.emit('problemaResolvido', { status: 'Limpeza' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erro ao limpar problemas." });
  }
};
