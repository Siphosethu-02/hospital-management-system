// src/config/db.js
// MySQL connection pool (mysql2/promise). We use a pool rather than a
// single connection so concurrent requests don't block on each other,
// and export a couple of small helpers used throughout the models layer.

const mysql = require('mysql2/promise');
const env = require('./env');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0,
  namedPlaceholders: true,
  dateStrings: true,
});

/**
 * Quick connectivity check, called once at server startup so we fail
 * fast with a clear error instead of surfacing confusing errors on the
 * first incoming request.
 */
async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    logger.info(`[db] Connected to MySQL database "${env.db.name}" at ${env.db.host}:${env.db.port}`);
  } finally {
    connection.release();
  }
}

/**
 * Run a set of queries inside a single transaction.
 * `work` receives a connection - use connection.execute(...) inside it.
 *
 * Example:
 *   await withTransaction(async (conn) => {
 *     await conn.execute('INSERT INTO a ...');
 *     await conn.execute('INSERT INTO b ...');
 *   });
 */
async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  testConnection,
  withTransaction,
};
