// src/middleware/error.middleware.js
// Centralized error handler. Every thrown/forwarded error ends up here
// (thanks to asyncHandler + Express's error-handling contract) and gets
// turned into one consistent JSON shape.
//
// Must be registered LAST, after all routes, in app.js.

const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  // Normalize known third-party error types into ApiError so the
  // response shape is always consistent.
  if (!(error instanceof ApiError)) {
    if (error.code === 'ER_DUP_ENTRY') {
      error = ApiError.conflict('A record with these details already exists.');
    } else if (error.type === 'entity.parse.failed') {
      error = ApiError.badRequest('Malformed JSON in request body.');
    } else if (error.name === 'MulterError') {
      error = ApiError.badRequest(`File upload error: ${error.message}`);
    } else {
      error = ApiError.internal(
        env.isProduction ? 'Something went wrong. Please try again later.' : error.message
      );
    }
  }

  // Log unexpected (non-operational) errors with full stack; log
  // expected client errors at a lower level to avoid noise.
  if (!error.isOperational) {
    logger.error(err.stack || err.message);
  } else if (error.statusCode >= 500) {
    logger.error(error.message);
  } else {
    logger.debug(`${req.method} ${req.originalUrl} -> ${error.statusCode} ${error.message}`);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message,
    errors: error.errors && error.errors.length ? error.errors : undefined,
    stack: env.isProduction ? undefined : err.stack,
  });
}

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = { errorHandler, notFoundHandler };
