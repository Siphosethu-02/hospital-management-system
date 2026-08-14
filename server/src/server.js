// src/server.js
// Entry point. Verifies the database connection before accepting
// traffic, and wires up graceful shutdown for SIGTERM/SIGINT and
// unhandled errors - important on hosts like Render/Railway that send
// SIGTERM on redeploy.

const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { testConnection, pool } = require('./config/db');

let server;

async function start() {
  try {
    await testConnection();

    server = app.listen(env.port, () => {
      logger.info(`[server] Hospital Management System API running in ${env.nodeEnv} mode on port ${env.port}`);
      logger.info(`[server] Health check: http://localhost:${env.port}${env.apiPrefix}/health`);
    });
  } catch (err) {
    logger.error(`[server] Failed to start: ${err.message}`);
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`[server] Received ${signal}. Shutting down gracefully...`);
  if (server) {
    server.close(async () => {
      await pool.end();
      logger.info('[server] Closed out remaining connections. Bye.');
      process.exit(0);
    });

    // Force-exit if it hangs for too long.
    setTimeout(() => {
      logger.error('[server] Forcing shutdown after timeout.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error(`[server] Unhandled Promise Rejection: ${reason}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`[server] Uncaught Exception: ${err.stack || err.message}`);
  process.exit(1);
});

start();
