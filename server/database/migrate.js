// database/migrate.js
// Applies pending schema migrations. Each migration is explicit: it
// checks (via information_schema, not "IF NOT EXISTS") whether it's
// already applied, logs clearly either way, and only runs the ALTER if
// genuinely needed. This is deliberately more verbose than a single
// "IF NOT EXISTS" statement so that a failure here is loud and
// unambiguous - a silent/half-applied migration is exactly what causes
// confusing "Unknown column" errors at runtime instead of a clear
// failure at startup.
//
// Usage: npm run db:migrate (also run automatically by
// docker-entrypoint.sh on every backend boot, BEFORE seeding - and
// unlike seeding, a failure here is fatal: the rest of the app cannot
// function correctly against a schema it doesn't match, so we'd rather
// the container fail to start than start broken.)

require('dotenv').config();
const mysql = require('mysql2/promise');

const MIGRATIONS = [
  {
    name: 'doctor_availability.is_active',
    async isApplied(conn) {
      const [rows] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'doctor_availability' AND COLUMN_NAME = 'is_active'`
      );
      return rows[0].cnt > 0;
    },
    async apply(conn) {
      await conn.query(
        `ALTER TABLE doctor_availability ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER slot_minutes`
      );
    },
  },
];

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hospital_management_system',
  });

  try {
    for (const migration of MIGRATIONS) {
      const applied = await migration.isApplied(connection);
      if (applied) {
        console.log(`[db:migrate] "${migration.name}" already applied - skipping.`);
        continue;
      }
      console.log(`[db:migrate] Applying "${migration.name}"...`);
      await migration.apply(connection);
      console.log(`[db:migrate] Applied "${migration.name}".`);
    }
    console.log('[db:migrate] Done.');
  } finally {
    await connection.end();
  }
}

run().catch((err) => {
  console.error('[db:migrate] FAILED:', err.message);
  process.exit(1);
});
