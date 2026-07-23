/**
 * @openapi
 * /api/zabbix/hostgroups:
 *   get:
 *     tags: [Zabbix]
 *     summary: Listar grupos de hosts do Zabbix
 *     responses:
 *       200: { description: Lista de grupos }
 * /api/zabbix/hosts:
 *   get:
 *     tags: [Zabbix]
 *     summary: Listar hosts do Zabbix
 *     parameters:
 *       - { in: query, name: groupid, schema: { type: string } }
 *     responses:
 *       200: { description: Lista de hosts }
 * /api/zabbix/hosts/{hostId}/items:
 *   get:
 *     tags: [Zabbix]
 *     summary: Listar itens de um host
 *     parameters:
 *       - { in: path, name: hostId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Lista de itens }
 * /api/zabbix/cache:
 *   get:
 *     tags: [Zabbix]
 *     summary: Obter cache Zabbix do Redis
 *     responses:
 *       200: { description: Cache Zabbix }
 */

const zabbixController = require('../controllers/zabbixController');

module.exports = (app) => {
  app.get('/api/zabbix/hostgroups', zabbixController.getHostGroups);
  app.get('/api/zabbix/hosts', zabbixController.getHosts);
  app.get('/api/zabbix/hosts/:hostId/items', zabbixController.getHostItems);
  app.get('/api/zabbix/items/history', zabbixController.getItemHistoryDetailed);
  app.get('/api/zabbix/items/:itemId', zabbixController.getItemLinks);
  app.get('/api/zabbix/item/history', zabbixController.getItemHistory);
  app.get('/api/zabbix/item/:itemId/history', zabbixController.getItemHistoryDetailed);
  app.get('/api/zabbix/cache', zabbixController.getCache);
};
