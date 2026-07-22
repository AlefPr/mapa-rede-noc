const redis = require('redis');
const logger = require('./logger');

const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    connectTimeout: 10000,
    reconnectStrategy: (retries) => {
      if (retries > 20) {
        logger.error('Redis: Número máximo de tentativas de reconexão excedido.');
        return new Error('Máximo de retentativas excedido');
      }
      return Math.min(retries * 500, 5000);
    }
  },
  password: process.env.REDIS_PASSWORD || undefined
});

client.on('error', (err) => {
  logger.error('Redis Client Error (tratado):', err.message);
});

client.connect().catch((err) => {
  logger.error('Falha inicial ao conectar no Redis:', err.message);
});

module.exports = client;
