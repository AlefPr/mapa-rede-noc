/**
 * @openapi
 * components:
 *   schemas:
 *     Problema:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         rota_id: { type: integer }
 *         descricao: { type: string }
 *         severidade: { type: string, enum: [Crítico, Erro, Aviso] }
 *         status: { type: string, enum: [Ativo, Resolvido] }
 *         data_inicio: { type: string, format: date-time }
 *         data_fim: { type: string, format: date-time, nullable: true }
 *         nome_rota: { type: string }
 *         cor: { type: string }
 */

const problemasController = require('../controllers/problemasController');
const { validarWebhook } = require('../middleware/validate');
const { autenticarToken } = require('../middleware/auth');

module.exports = (app, io) => {
  /**
   * @openapi
   * /api/zabbix/webhook:
   *   post:
   *     tags: [Zabbix]
   *     summary: Webhook para receber eventos do Zabbix
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               itemid: { type: string }
   *               trigger_status: { type: string, enum: [PROBLEM, OK] }
   *               trigger_id: { type: string }
   *               trigger_name: { type: string }
   *               trigger_severity: { type: string }
   *     responses:
   *       200: { description: Processado }
   *       400: { description: Dados incompletos }
   *       401: { description: Não autorizado }
   */
  app.post('/api/zabbix/webhook', validarWebhook, (req, res) => problemasController.webhook(req, res, io));

  /**
   * @openapi
   * /api/problemas:
   *   get:
   *     tags: [Problemas]
   *     summary: Listar problemas/incidentes
   *     parameters:
   *       - { in: query, name: severidade, schema: { type: string, enum: [Crítico, Erro, Aviso] } }
   *     responses:
   *       200:
   *         description: Lista de problemas
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Problema'
   */
  app.get('/api/problemas', problemasController.listarProblemas);

  /**
   * @openapi
   * /api/problemas/limpar:
   *   post:
   *     tags: [Problemas]
   *     summary: Limpar problemas resolvidos
   *     responses:
   *       200: { description: Problemas limpos }
   */
  app.post('/api/problemas/limpar', autenticarToken, (req, res) => problemasController.limparProblemas(req, res, io));
};
