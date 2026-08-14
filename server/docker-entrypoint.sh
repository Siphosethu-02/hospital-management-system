#!/bin/sh
# docker-entrypoint.sh
# Runs once every time the backend container starts:
#   1. Wait until MySQL is genuinely accepting connections (extra
#      safety net on top of the compose-level healthcheck).
#   2. Apply any pending schema migrations (see database/migrate.js).
#      Safe on every boot - each migration checks whether it's already
#      applied before doing anything. UNLIKE seeding below, a migration
#      failure is FATAL and stops the container: the rest of the app
#      cannot function correctly against a schema it doesn't match, so
#      a loud startup failure here is far better than the app limping
#      along and throwing confusing "Unknown column" errors at runtime
#      whenever that column happens to get touched.
#   3. Ensure reference data + the default admin account exist. This is
#      safe to run on every boot: seed.sql uses INSERT IGNORE and
#      seed.js checks for existing accounts/data before creating
#      anything, so restarting the stack never duplicates data or wipes
#      anything.
#      (The destructive `db:init` / schema.sql step is intentionally
#      NOT run here - the schema is created exactly once by MySQL's own
#      docker-entrypoint-initdb.d mechanism, see docker-compose.yml.)
#   4. Hand off to the real server process with `exec`, so it becomes
#      PID 1 and receives SIGTERM directly for graceful shutdown.

set -e

echo "[entrypoint] Waiting for MySQL..."
node scripts/wait-for-mysql.js

echo "[entrypoint] Applying database migrations..."
node database/migrate.js

echo "[entrypoint] Ensuring reference data and default admin account exist..."
node database/seed.js || echo "[entrypoint] Seed step reported an issue - continuing startup anyway."

echo "[entrypoint] Starting Hospital Management System API..."
exec node src/server.js
