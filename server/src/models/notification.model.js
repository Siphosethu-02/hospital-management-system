// src/models/notification.model.js

const { pool } = require('../config/db');
const { sqlInt } = require('../utils/pagination');

async function listByUser(userId, { unreadOnly, limit, offset }) {
  const where = ['user_id = :userId'];
  const params = { userId };
  if (unreadOnly) where.push('is_read = 0');
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [rows] = await pool.execute(
    `SELECT * FROM notifications ${whereSql} ORDER BY created_at DESC LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM notifications ${whereSql}`,
    params
  );
  return { rows, total: countRows[0].total };
}

async function getUnreadCount(userId) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = :userId AND is_read = 0',
    { userId }
  );
  return Number(rows[0].total);
}

async function findById(id) {
  const [rows] = await pool.execute('SELECT * FROM notifications WHERE id = :id LIMIT 1', { id });
  return rows[0] || null;
}

async function create({ userId, type, title, message, referenceType, referenceId }) {
  const [result] = await pool.execute(
    `INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
     VALUES (:userId, :type, :title, :message, :referenceType, :referenceId)`,
    { userId, type, title, message, referenceType: referenceType || null, referenceId: referenceId || null }
  );
  return findById(result.insertId);
}

async function markRead(id) {
  await pool.execute('UPDATE notifications SET is_read = 1 WHERE id = :id', { id });
  return findById(id);
}

async function markAllRead(userId) {
  await pool.execute('UPDATE notifications SET is_read = 1 WHERE user_id = :userId AND is_read = 0', { userId });
}

async function remove(id) {
  await pool.execute('DELETE FROM notifications WHERE id = :id', { id });
}

module.exports = { listByUser, getUnreadCount, findById, create, markRead, markAllRead, remove };
