const weatherController = require('../controllers/weatherController');

module.exports = (app) => {
  app.get('/api/weather', weatherController.getWeather);
};
