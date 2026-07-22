const axios = require('axios');
const db = require('../db');
const redisClient = require('../redisClient');
const logger = require('../logger');

const GLOBAL_ZABBIX_API_URL = process.env.ZABBIX_API_URL;
const ZABBIX_TOKEN = process.env.ZABBIX_API_TOKEN;
const ZABBIX_REQUEST_TIMEOUT = parseInt(process.env.ZABBIX_REQUEST_TIMEOUT) || 15000;
const CACHE_HISTORY_LIMIT = parseInt(process.env.CACHE_HISTORY_LIMIT) || 120;

let isSyncing = false;

async function zabbixApiCall(method, params) {
  const response = await axios.post(GLOBAL_ZABBIX_API_URL, {
    jsonrpc: '2.0',
    method: method,
    params: params,
    auth: ZABBIX_TOKEN,
    id: 1
  }, { timeout: ZABBIX_REQUEST_TIMEOUT });
  if (response.data.error) throw new Error(response.data.error.data);
  return response.data.result;
}

async function syncZabbixCache(io) {
  if (isSyncing) {
    logger.warn('Sync Zabbix já em execução. A ignorar novo ciclo.');
    return;
  }
  isSyncing = true;
  try {
    const [allRows] = await db.execute(
      'SELECT rz.zabbix_itemid, rz.rota_id, rz.tipo_item, r.nome_rota FROM rota_zabbix_items rz JOIN rotas r ON rz.rota_id = r.id WHERE (r.manutencao_ativa IS NULL OR r.manutencao_ativa = 0)'
    );
    const itemIds = [...new Set(allRows.map(r => r.zabbix_itemid))];
    
    if (itemIds.length === 0) return;

    const items = await zabbixApiCall('item.get', { output: ['itemid', 'lastvalue'], itemids: itemIds });
    
    let zabbixCache = JSON.parse(await redisClient.get('zabbix_cache') || '{}');
    const previousCache = JSON.parse(JSON.stringify(zabbixCache));

    items.forEach(item => {
      const id = item.itemid;
      const val = parseFloat(item.lastvalue) || 0;

      if (!zabbixCache[id]) {
        zabbixCache[id] = { current: val, history: [] };
      } else {
        zabbixCache[id].current = val;
      }

      zabbixCache[id].history.push(val);
      if (zabbixCache[id].history.length > CACHE_HISTORY_LIMIT) {
        zabbixCache[id].history.shift(); 
      }
    });
    
    await redisClient.set('zabbix_cache', JSON.stringify(zabbixCache), { EX: 300 });
    io.emit('zabbixCacheUpdated', zabbixCache);

    // ── Auto-detecção de DOWN/UP para alarmes ──
    const statusRows = allRows.filter(r => r.tipo_item === 'status');
    const rotaStatus = {};
    for (const row of statusRows) {
      if (!rotaStatus[row.rota_id]) {
        rotaStatus[row.rota_id] = { nome: row.nome_rota, itensDown: 0, itensUp: 0, total: 0 };
      }
      const currVal = zabbixCache[row.zabbix_itemid] ? zabbixCache[row.zabbix_itemid].current : null;
      const estaDown = currVal == 2 || currVal == '2';
      rotaStatus[row.rota_id].total++;
      if (estaDown) rotaStatus[row.rota_id].itensDown++;
      else rotaStatus[row.rota_id].itensUp++;
    }

    const [ativos] = await db.execute('SELECT id, rota_id FROM problemas WHERE status = "Ativo" AND trigger_id LIKE "auto:%%"');
    const rotaComProblemaAtivo = new Set(ativos.map(p => String(p.rota_id)));

    for (const [rotaId, info] of Object.entries(rotaStatus)) {
      if (info.itensDown > 0) {
        if (!rotaComProblemaAtivo.has(rotaId)) {
          await db.execute(
            'INSERT INTO problemas (rota_id, trigger_id, descricao, severidade) VALUES (?, ?, ?, ?)',
            [rotaId, `auto:status`, `Rota ${info.nome} ficou DOWN (${info.itensDown}/${info.total} interfaces)` , 'Crítico']
          );
          io.emit('novoProblema', { rotaId, trigger_id: `auto:status`, status: 'Ativo' });
          logger.info(`Alarme criado automaticamente: rota #${rotaId} (${info.nome})`);
        }
      } else if (info.itensUp === info.total && info.total > 0) {
        if (rotaComProblemaAtivo.has(rotaId)) {
          await db.execute(
            'UPDATE problemas SET status = "Resolvido", data_fim = NOW() WHERE rota_id = ? AND status = "Ativo" AND trigger_id LIKE "auto:%%"',
            [rotaId]
          );
          io.emit('problemaResolvido', { rotaId, status: 'Resolvido' });
          logger.info(`Alarme resolvido automaticamente: rota #${rotaId} (${info.nome})`);
        }
      }
    }

    logger.info(`Cache Zabbix sincronizado: ${items.length} itens atualizados.`);
  } catch (error) {
    logger.error("Erro no Motor de Cache do Zabbix:", error.message);
  } finally {
    isSyncing = false;
  }
}

module.exports = {
  syncZabbixCache,
  getCache: async () => JSON.parse(await redisClient.get('zabbix_cache') || '{}'),
  zabbixApiCall
};
