// src/models/auditLog.model.js

const { pool } = require('../config/db');
const { sqlInt } = require('../utils/pagination');

async function list({ userId, action, entityType, dateFrom, dateTo, limit, offset }) {
  const where = [];
  const params = {};

  if (userId) { where.push('a.user_id = :userId'); params.userId = userId; }
  if (action) { where.push('a.action = :action'); params.action = action; }
  if (entityType) { where.push('a.entity_type = :entityType'); params.entityType = entityType; }
  if (dateFrom) { where.push('a.created_at >= :dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo) { where.push('a.created_at <= :dateTo'); params.dateTo = dateTo; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.ip_address, a.user_agent,
            a.metadata, a.created_at, u.first_name, u.last_name, u.email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereSql}
     ORDER BY a.created_at DESC
     LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`,
    params
  );

  return { rows, total: countRows[0].total };
}

module.exports = { list };
