const templatesController = require('../controllers/templatesController');
const { autenticarToken } = require('../middleware/auth');

module.exports = (app) => {
  app.get('/api/templates', templatesController.listarTemplates);
  app.post('/api/templates', autenticarToken, templatesController.criarTemplate);
  app.delete('/api/templates/:id', autenticarToken, templatesController.excluirTemplate);
};
