const slaController = require('../controllers/slaController');

module.exports = (app) => {
  app.get('/api/sla', slaController.getSLA);
};
