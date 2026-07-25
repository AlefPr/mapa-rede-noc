require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../db');
const logger = require('../logger');

async function zabbixApiCall(method, params) {
  const axios = require('axios');
  const URL = process.env.ZABBIX_API_URL || 'http://127.0.0.1/zabbix/api_jsonrpc.php';
  const TOKEN = process.env.ZABBIX_API_TOKEN;
  const res = await axios.post(URL, {
    jsonrpc: '2.0', method, params, auth: TOKEN, id: 1
  }, { timeout: 15000 });
  if (res.data.error) throw new Error(res.data.error.data);
  return res.data.result;
}

async function migrar() {
  logger.info('=== Migracao automatica de latency ===');

  const [rotas] = await db.execute('SELECT id, nome_rota FROM rotas');
  const [items] = await db.execute('SELECT rota_id, zabbix_itemid, tipo_item FROM rota_zabbix_items');
  const existingLatency = new Set(
    items.filter(i => i.tipo_item === 'latency').map(i => `${i.rota_id}:${i.zabbix_itemid}`)
  );

  for (const rota of rotas) {
    const rotaItems = items.filter(i => i.rota_id === rota.id);
    const trafficIds = rotaItems
      .filter(i => ['download', 'upload', 'status', 'rx'].includes(i.tipo_item))
      .map(i => i.zabbix_itemid);

    if (trafficIds.length === 0) continue;

    try {
      const zabbixItems = await zabbixApiCall('item.get', {
        output: ['itemid'], itemids: trafficIds, selectHosts: ['hostid']
      });
      const hostIds = [...new Set(zabbixItems.map(i => i.hosts?.[0]?.hostid).filter(Boolean))];
      if (hostIds.length === 0) continue;

      const latencyItems = await zabbixApiCall('item.get', {
        output: ['itemid', 'name'], hostids: hostIds, filter: { key_: 'icmppingsec' }
      });

      const novos = latencyItems
        .map(i => i.itemid)
        .filter(id => !existingLatency.has(`${rota.id}:${id}`));

      if (novos.length > 0) {
        const vals = novos.map(id => [rota.id, id, 'latency']);
        await db.query('INSERT IGNORE INTO rota_zabbix_items (rota_id, zabbix_itemid, tipo_item) VALUES ?', [vals]);
        logger.info(`Rota #${rota.id} (${rota.nome_rota}): ${novos.length} itens de latency vinculados`);
      }
    } catch (err) {
      logger.warn(`Rota #${rota.id} (${rota.nome_rota}) erro: ${err.message}`);
    }
  }

  logger.info('=== Migracao concluida ===');
  process.exit(0);
}

migrar();
