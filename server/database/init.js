// database/init.js
// Runs schema.sql against the configured MySQL server to (re)create the
// database and all tables from scratch.
//
// Usage: npm run db:init

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('[db:init] Applying schema.sql ...');
    await connection.query(schemaSql);
    console.log('[db:init] Schema created successfully.');
  } catch (err) {
    console.error('[db:init] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

run();
