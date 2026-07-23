const axios = require('axios');
const logger = require('../logger');

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

const weatherCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

const WEATHER_CODES = {
  0: 'Céu limpo', 1: 'Predominantemente limpo', 2: 'Parcialmente nublado', 3: 'Encoberto',
  45: 'Nevoeiro', 48: 'Nevoeiro com geada',
  51: 'Chuvisco leve', 53: 'Chuvisco moderado', 55: 'Chuvisco intenso',
  56: 'Chuvisco congelante leve', 57: 'Chuvisco congelante intenso',
  61: 'Chuva leve', 63: 'Chuva moderada', 65: 'Chuva intensa',
  66: 'Chuva congelante leve', 67: 'Chuva congelante intensa',
  71: 'Neve leve', 73: 'Neve moderada', 75: 'Neve intensa',
  77: 'Grãos de neve',
  80: 'Pancadas de chuva leve', 81: 'Pancadas de chuva moderada', 82: 'Pancadas de chuva intensas',
  85: 'Pancadas de neve leves', 86: 'Pancadas de neve intensas',
  95: 'Trovoada', 96: 'Trovoada com granizo leve', 99: 'Trovoada com granizo intenso'
};

exports.getWeather = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat e lng são obrigatórios' });

    const cacheKey = `${parseFloat(lat).toFixed(2)}_${parseFloat(lng).toFixed(2)}`;
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    const response = await axios.get(OPEN_METEO_URL, {
      params: {
        latitude: lat,
        longitude: lng,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation',
        timezone: 'auto'
      },
      timeout: 5000
    });

    const current = response.data.current;
    const result = {
      temperature: current.temperature_2m,
      feels_like: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      wind_speed: current.wind_speed_10m,
      precipitation: current.precipitation,
      condition: WEATHER_CODES[current.weather_code] || 'Desconhecido',
      weather_code: current.weather_code,
      location: `${parseFloat(lat).toFixed(2)}, ${parseFloat(lng).toFixed(2)}`
    };

    weatherCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (error) {
    logger.error('Erro ao buscar clima:', error.message);
    res.status(502).json({ error: 'Falha ao obter dados climáticos' });
  }
};
