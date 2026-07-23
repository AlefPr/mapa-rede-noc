const db = require('../db');
const logger = require('../logger');

exports.listarRotas = async (req, res) => {
  try {
    const [rotas] = await db.execute('SELECT * FROM rotas');
    const [allItemRows] = await db.execute('SELECT * FROM rota_zabbix_items');
    
    const itemsByRota = {};
    allItemRows.forEach(item => {
        if (!itemsByRota[item.rota_id]) {
            itemsByRota[item.rota_id] = { in: [], out: [], status: [], rx: [] };
        }
        
        switch(item.tipo_item) {
            case 'download': itemsByRota[item.rota_id].in.push(item.zabbix_itemid); break;
            case 'upload':   itemsByRota[item.rota_id].out.push(item.zabbix_itemid); break;
            case 'status':   itemsByRota[item.rota_id].status.push(item.zabbix_itemid); break;
            case 'rx':       itemsByRota[item.rota_id].rx.push(item.zabbix_itemid); break;
        }
    });

    rotas.forEach(rota => {
        rota.zabbix_items = itemsByRota[rota.id] || { in: [], out: [], status: [], rx: [] };
    });

    res.json(rotas);
  } catch (error) {
    logger.error('Erro na listagem de rotas:', error);
    res.status(500).json({ error: 'Erro interno ao buscar as rotas.' });
  }
};

exports.criarRota = async (req, res, io) => {
  let connection;
  try {
    const { nome, cor, espessura, coordenadas, tipo_rota, capacidade, unidade, itemsIn, itemsOut, itemsStatus, estilo, itemsRx } = req.body;
    
    const vCapacidade = (capacidade === "" || capacidade === undefined) ? null : capacidade;
    const vUnidade = (unidade === "" || unidade === undefined) ? 'Gbps' : unidade;

    connection = await db.getConnection();
    await connection.beginTransaction();
  
    const sqlRota = 'INSERT INTO rotas (nome_rota, cor, espessura, coordenadas, tipo_rota, capacidade, unidade, estilo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    
    const [result] = await connection.execute(sqlRota, [
        nome || 'Sem Nome', 
        cor || '#000000', 
        espessura || 3, 
        JSON.stringify(coordenadas), 
        tipo_rota || 'agregado', 
        vCapacidade, 
        vUnidade, 
        estilo || 'solida'
    ]);
    const insertId = result.insertId;

    const sqlItems = 'INSERT INTO rota_zabbix_items (rota_id, zabbix_itemid, tipo_item) VALUES ?';
    const itemsParaSalvar = [];
    (itemsIn || []).forEach(id => { if(id) itemsParaSalvar.push([insertId, id, 'download']) });
    (itemsOut || []).forEach(id => { if(id) itemsParaSalvar.push([insertId, id, 'upload']) });
    (itemsStatus || []).forEach(id => { if(id) itemsParaSalvar.push([insertId, id, 'status']) });
    (itemsRx || []).forEach(id => { if(id) itemsParaSalvar.push([insertId, id, 'rx']) });

    if (itemsParaSalvar.length > 0) {
        await connection.query(sqlItems, [itemsParaSalvar]);
    }

    await connection.commit();
    
    const [rotaSalva] = await db.execute('SELECT * FROM rotas WHERE id = ?', [insertId]);
    const [itemsSalvos] = await db.execute('SELECT * FROM rota_zabbix_items WHERE rota_id = ?', [insertId]);
    
    rotaSalva[0].zabbix_items = {
        in: itemsSalvos.filter(i => i.tipo_item === 'download').map(i => i.zabbix_itemid),
        out: itemsSalvos.filter(i => i.tipo_item === 'upload').map(i => i.zabbix_itemid),
        status: itemsSalvos.filter(i => i.tipo_item === 'status').map(i => i.zabbix_itemid),
        rx: itemsSalvos.filter(i => i.tipo_item === 'rx').map(i => i.zabbix_itemid) 
    };
    
    io.emit('rotaCriada', rotaSalva[0]);
    logger.info(`Rota criada: ${nome} (ID: ${insertId})`);
    res.status(201).json({ id: insertId, message: 'Rota criada com sucesso!' });

  } catch (error) {
    if (connection) await connection.rollback();
    logger.error(`Erro ao criar rota:`, error);
    res.status(500).json({ error: 'Erro interno no servidor ao salvar rota.' });
  } finally {
    if (connection) connection.release();
  }
};

exports.atualizarRota = async (req, res, io) => {
  let connection;
  try {
    const { id } = req.params;
    const { nome, cor, espessura, tipo_rota, capacidade, unidade, itemsIn, itemsOut, itemsStatus, estilo, itemsRx } = req.body;
    
    const vNome = nome || 'Rota Sem Nome';
    const vCor = cor || '#007bff';
    const vEspessura = espessura || 3;
    const vTipoRota = tipo_rota || 'agregado';
    const vCapacidade = (capacidade === "" || capacidade === undefined) ? null : capacidade;
    const vUnidade = (unidade === "" || unidade === undefined) ? 'Gbps' : unidade;
    const vEstilo = estilo || 'solida';

    connection = await db.getConnection();
    await connection.beginTransaction();

    const sqlRota = 'UPDATE rotas SET nome_rota = ?, cor = ?, espessura = ?, tipo_rota = ?, capacidade = ?, unidade = ?, estilo = ? WHERE id = ?';
    const values = [vNome, vCor, vEspessura, vTipoRota, vCapacidade, vUnidade, vEstilo, id];

    await connection.execute(sqlRota, values);
    await connection.execute('DELETE FROM rota_zabbix_items WHERE rota_id = ?', [id]);
    
    const sqlItems = 'INSERT INTO rota_zabbix_items (rota_id, zabbix_itemid, tipo_item) VALUES ?';
    const itemsParaSalvar = [];
    (itemsIn || []).forEach(itemId => { if(itemId) itemsParaSalvar.push([id, itemId, 'download']) });
    (itemsOut || []).forEach(itemId => { if(itemId) itemsParaSalvar.push([id, itemId, 'upload']) });
    (itemsStatus || []).forEach(itemId => { if(itemId) itemsParaSalvar.push([id, itemId, 'status']) });
    (itemsRx || []).forEach(itemId => { if(itemId) itemsParaSalvar.push([id, itemId, 'rx']) });
    
    if (itemsParaSalvar.length > 0) {
      await connection.query(sqlItems, [itemsParaSalvar]);
    }

    await connection.commit();

    const [rotaAtualizada] = await db.execute('SELECT * FROM rotas WHERE id = ?', [id]);
    const [itemsAtualizados] = await db.execute('SELECT * FROM rota_zabbix_items WHERE rota_id = ?', [id]);
    
    rotaAtualizada[0].zabbix_items = {
        in: itemsAtualizados.filter(i => i.tipo_item === 'download').map(i => i.zabbix_itemid),
        out: itemsAtualizados.filter(i => i.tipo_item === 'upload').map(i => i.zabbix_itemid),
        status: itemsAtualizados.filter(i => i.tipo_item === 'status').map(i => i.zabbix_itemid),
        rx: itemsAtualizados.filter(i => i.tipo_item === 'rx').map(i => i.zabbix_itemid)
    };
    
    io.emit('rotaAtualizada', rotaAtualizada[0]);
    logger.info(`Rota atualizada: ID ${id}`);
    res.json({ message: 'Rota atualizada com sucesso!' });

  } catch (error) {
    if (connection) await connection.rollback();
    logger.error(`ERRO FATAL NO PUT (ID ${req.params.id}):`, error);
    res.status(500).json({ error: 'Erro interno no servidor ao atualizar rota.' });
  } finally {
    if (connection) connection.release();
  }
};

exports.toggleManutencao = async (req, res, io) => {
  try {
    const { id } = req.params;
    const { ativa, ate } = req.body;

    const ateValue = ate || null;
    await db.execute('UPDATE rotas SET manutencao_ativa = ?, manutencao_ate = ? WHERE id = ?', [ativa ? 1 : 0, ateValue, id]);

    const [rota] = await db.execute('SELECT * FROM rotas WHERE id = ?', [id]);
    if (rota.length === 0) return res.status(404).json({ error: 'Rota não encontrada.' });

    io.emit('rotaManutencaoAtualizada', {
      id: rota[0].id,
      nome_rota: rota[0].nome_rota,
      manutencao_ativa: !!rota[0].manutencao_ativa,
      manutencao_ate: rota[0].manutencao_ate
    });

    logger.info(`Manutenção ${ativa ? 'ativada' : 'desativada'} para rota ID ${id}`);
    res.json({ message: `Manutenção ${ativa ? 'ativada' : 'desativada'} com sucesso!` });
  } catch (error) {
    logger.error(`Erro ao alternar manutenção da rota ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
};

exports.timelineIncidentes = async (req, res) => {
  try {
    const { id } = req.params;
    const dias = parseInt(req.query.dias) || 7;
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const [problemas] = await db.execute(
      `SELECT p.id, p.descricao, p.severidade, p.status, p.data_inicio, p.data_fim
       FROM problemas p WHERE p.rota_id = ? AND p.data_inicio >= ?
       ORDER BY p.data_inicio DESC`,
      [id, desde]
    );

    res.json(problemas);
  } catch (error) {
    logger.error('Erro ao buscar timeline:', error);
    res.status(500).json({ error: 'Erro ao buscar timeline' });
  }
};

exports.excluirRota = async (req, res, io) => {
  try {
    const { id } = req.params;
    const [result] = await db.execute('DELETE FROM rotas WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Rota não encontrada.' });
    io.emit('rotaExcluida', { id: parseInt(id) });
    logger.info(`Rota excluída: ID ${id}`);
    res.json({ message: 'Rota excluída com sucesso!' });
  } catch (error) {
    logger.error(`Erro ao excluir rota ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Erro interno ao excluir.' });
  }
};
