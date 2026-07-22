const mysql = require('mysql2/promise');
const logger = require('./logger');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

pool.on('acquire', (connection) => {
  logger.debug(`Conexão MySQL adquirida. Thread: ${connection.threadId}`);
});

pool.on('enqueue', () => {
  logger.warn('Conexão MySQL em fila de espera. Todas as conexões estão ocupadas.');
});

pool.on('release', (connection) => {
  logger.debug(`Conexão MySQL libertada. Thread: ${connection.threadId}`);
});

module.exports = pool;