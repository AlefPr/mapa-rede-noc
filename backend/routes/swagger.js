const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');

module.exports = (app) => {
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'API NOC MAPA - Documentação'
  }));
};
