const zabbixService = require('../services/zabbixService');
const logger = require('../logger');

exports.getHostGroups = async (req, res) => {
  try {
    const result = await zabbixService.zabbixApiCall('hostgroup.get', { output: ['groupid', 'name'], sortfield: 'name' });
    res.json(result);
  } catch (error) { logger.error('Erro ao buscar hostgroups:', error); res.status(500).json({ error: 'Erro ao buscar hostgroups' }); }
};

exports.getHosts = async (req, res) => {
  try {
    const params = { output: ["hostid", "name"], selectInterfaces: ["ip"] };
    if (req.query.groupid) params.groupids = req.query.groupid; 
    
    const result = await zabbixService.zabbixApiCall('host.get', params);
    res.json(result);
  } catch (error) { logger.error('Erro ao buscar hosts:', error); res.status(500).json({ error: 'Erro ao buscar hosts no Zabbix' }); }
};

exports.getHostItems = async (req, res) => {
  try {
    const result = await zabbixService.zabbixApiCall('item.get', { 
        output: ['itemid', 'name', 'key_', 'value_type'], 
        hostids: req.params.hostId, 
        sortfield: "name" 
    });
    res.json(result);
  } catch (error) { logger.error('Erro ao buscar itens:', error); res.status(500).json({ error: 'Erro ao buscar itens.' }); }
};

exports.getItemLinks = async (req, res) => {
  try {
    const items = await zabbixService.zabbixApiCall('item.get', { output: ['itemid'], itemids: req.params.itemId, selectHosts: ['hostid'] });
    if (!items || items.length === 0) return res.status(404).json({ error: 'Item não encontrado no Zabbix' });
    const hostId = items[0].hosts?.[0]?.hostid;
    if (!hostId) return res.status(404).json({ error: 'Host não encontrado para este item' });
    const hosts = await zabbixService.zabbixApiCall('host.get', { output: ['hostid'], hostids: hostId, selectGroups: ['groupid'] });
    res.json({ itemid: items[0].itemid, hosts: [{ hostid: hostId }], groups: hosts[0]?.groups || [] });
  } catch (error) { logger.error('Erro ao obter vinculos do item:', error); res.status(500).json({ error: 'Erro ao obter vinculos do item' }); }
};

exports.getItemHistory = async (req, res) => {
  const raw = req.query.itemids;
  const itemIds = raw ? (Array.isArray(raw) ? raw : raw.split(',')) : [];
  if (!itemIds.length) return res.json({ value: 0 });
  try {
    const result = await zabbixService.zabbixApiCall('history.get', { output: ['value'], history: 3, itemids: itemIds, sortfield: 'clock', sortorder: 'DESC', limit: itemIds.length });
    res.json({ value: result.reduce((sum, item) => sum + parseFloat(item.value), 0) });
  } catch (error) { logger.error('Erro ao buscar somatorio de historico:', error); res.status(500).json({ error: 'Erro ao buscar somatorio de historico' }); }
};

exports.getItemHistoryDetailed = async (req, res) => {
  const period = req.query.period || '1h';
  const valueType = req.query.value_type;
  const historyType = valueType !== undefined ? parseInt(valueType) : 3;

  const raw = req.query.itemids || req.params.itemId;
  const itemIds = raw ? (Array.isArray(raw) ? raw : raw.split(',')) : [];
  if (!itemIds.length) return res.json([]);

  try {
    const now = Math.floor(Date.now() / 1000);
    const times = { '30m': 1800, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };
    const time_from = now - (times[period] || 3600);

    const result = await zabbixService.zabbixApiCall('history.get', {
        output: ['clock', 'value'],
        history: historyType,
        itemids: itemIds,
        sortfield: 'clock',
        sortorder: 'ASC',
        time_from
    });
    res.json(result);
  } catch (error) { logger.error('Erro ao buscar historico:', error); res.status(500).json({ error: 'Erro ao buscar historico' }); }
};

exports.getCache = async (req, res) => {
  try {
    res.json(await zabbixService.getCache());
  } catch (error) {
    logger.error('Erro ao buscar cache:', error);
    res.status(500).json({ error: 'Erro ao buscar cache' });
  }
};
