/**
 * @openapi
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required: [username, password]
 *       properties:
 *         username: { type: string, example: admin }
 *         password: { type: string, example: "123456" }
 *     TokenResponse:
 *       type: object
 *       properties:
 *         token: { type: string }
 *         usuario: { type: object, properties: { id: { type: integer }, username: { type: string } } }
 */

const authController = require('../controllers/authController');
const { autenticarToken } = require('../middleware/auth');

module.exports = (app) => {
  /**
   * @openapi
   * /api/auth/registar:
   *   post:
   *     tags: [Autenticação]
   *     summary: Registar novo utilizador
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LoginRequest'
   *     responses:
   *       201: { description: Utilizador registado }
   *       409: { description: Username já existe }
   */
  app.post('/api/auth/registar', authController.registrar);

  /**
   * @openapi
   * /api/auth/login:
   *   post:
   *     tags: [Autenticação]
   *     summary: Autenticar e obter token JWT
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LoginRequest'
   *     responses:
   *       200:
   *         description: Login bem-sucedido
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/TokenResponse'
   *       401: { description: Credenciais inválidas }
   */
  app.post('/api/auth/login', authController.login);

  /**
   * @openapi
   * /api/auth/verificar:
   *   get:
   *     tags: [Autenticação]
   *     summary: Verificar se o token é válido
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: Token válido }
   *       401: { description: Token não fornecido }
   *       403: { description: Token inválido ou expirado }
   */
  app.get('/api/auth/verificar', autenticarToken, authController.verificarToken);

  /**
   * @openapi
   * /api/auth/logout:
   *   post:
   *     tags: [Autenticação]
   *     summary: Invalidar token atual (logout)
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: Sessão encerrada }
   *       400: { description: Token não fornecido }
   */
  app.post('/api/auth/logout', autenticarToken, authController.logout);
};
