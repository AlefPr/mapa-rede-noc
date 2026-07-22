/**
 * @openapi
 * components:
 *   schemas:
 *     Rota:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         nome_rota: { type: string }
 *         cor: { type: string }
 *         espessura: { type: integer }
 *         coordenadas: { type: array, items: { type: object, properties: { lat: { type: number }, lng: { type: number } } } }
 *         tipo_rota: { type: string, enum: [agregado, backup, cliente, backbone] }
 *         capacidade: { type: integer }
 *         unidade: { type: string }
 *         estilo: { type: string, enum: [solida, tracejada, setas, neon, particulas] }
 *         zabbix_items: { type: object }
 */

const rotasController = require('../controllers/rotasController');
const { validarCriacaoRota, validarAtualizacaoRota } = require('../middleware/validate');
const { autenticarToken, autenticarTokenOpcional } = require('../middleware/auth');

module.exports = (app, io) => {
  /**
   * @openapi
   * /api/rotas:
   *   get:
   *     tags: [Rotas]
   *     summary: Listar todas as rotas
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200:
   *         description: Lista de rotas
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Rota'
   */
  app.get('/api/rotas', autenticarTokenOpcional, rotasController.listarRotas);

  /**
   * @openapi
   * /api/rotas:
   *   post:
   *     tags: [Rotas]
   *     summary: Criar nova rota
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/Rota'
   *     responses:
   *       201: { description: Rota criada }
   *       400: { description: Dados inválidos }
   */
  app.post('/api/rotas', autenticarToken, validarCriacaoRota, (req, res) => rotasController.criarRota(req, res, io));

  /**
   * @openapi
   * /api/rotas/{id}:
   *   put:
   *     tags: [Rotas]
   *     summary: Atualizar rota existente
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: integer } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/Rota'
   *     responses:
   *       200: { description: Rota atualizada }
   *       400: { description: Dados inválidos }
   */
  app.put('/api/rotas/:id', autenticarToken, validarAtualizacaoRota, (req, res) => rotasController.atualizarRota(req, res, io));

  /**
   * @openapi
   * /api/rotas/{id}:
   *   delete:
   *     tags: [Rotas]
   *     summary: Excluir rota
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: integer } }
   *     responses:
   *       200: { description: Rota excluída }
   *       404: { description: Rota não encontrada }
   */
  app.delete('/api/rotas/:id', autenticarToken, (req, res) => rotasController.excluirRota(req, res, io));
};
