const historicoController = require('../controllers/historicoController');

module.exports = (app) => {
  app.get('/api/rotas/:id/historico', historicoController.getHistorico);
};
