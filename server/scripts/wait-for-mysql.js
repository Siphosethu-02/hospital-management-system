// scripts/wait-for-mysql.js
// Polls MySQL until it accepts connections, then exits. Used by the
// backend container's entrypoint so `npm start` never races against a
// MySQL container that's still initializing - the docker-compose
// healthcheck already gates container startup, but this gives a second,
// application-level guarantee (and works the same way outside Docker).

const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMysql() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const connection = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        connectTimeout: 5000,
      });
      await connection.ping();
      await connection.end();
      console.log(`[wait-for-mysql] MySQL is ready at ${DB_HOST}:${DB_PORT} (attempt ${attempt}/${MAX_RETRIES}).`);
      return;
    } catch (err) {
      console.log(
        `[wait-for-mysql] Attempt ${attempt}/${MAX_RETRIES} - MySQL not ready yet (${err.code || err.message}). ` +
        `Retrying in ${RETRY_DELAY_MS / 1000}s...`
      );
      await sleep(RETRY_DELAY_MS);
    }
  }

  console.error(`[wait-for-mysql] MySQL did not become ready within ${(MAX_RETRIES * RETRY_DELAY_MS) / 1000}s. Exiting.`);
  process.exit(1);
}

waitForMysql();
