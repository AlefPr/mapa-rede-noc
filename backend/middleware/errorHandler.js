const logger = require('../logger');

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.expose || statusCode < 500
    ? err.message
    : 'Erro interno no servidor.';

  const logData = {
    statusCode,
    message: err.message,
    ...(statusCode >= 500 && { stack: err.stack })
  };
  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl}`, logData);
  } else {
    logger.warn(`${req.method} ${req.originalUrl}`, logData);
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { detalhes: err.message })
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, asyncHandler };
