const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API NOC MAPA',
      version: '1.0.0',
      description: 'API de monitoramento de rede NOC com integração Zabbix'
    },
    servers: [
      { url: `http://localhost:${process.env.PORT || 3000}`, description: 'Servidor local' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./routes/*.js', './controllers/*.js']
};

module.exports = swaggerJsdoc(options);
