// src/models/user.model.js
// Data-access layer for the `users` table. Kept as plain SQL (via
// mysql2/promise) rather than an ORM, so the queries and the schema in
// database/schema.sql stay easy to read side by side.

const { pool } = require('../config/db');
const { sqlInt } = require('../utils/pagination');

const BASE_SELECT = `
  SELECT
    u.id,
    u.role_id,
    r.name AS role_name,
    u.first_name,
    u.last_name,
    u.email,
    u.password_hash,
    u.phone,
    u.avatar_url,
    u.is_active,
    u.token_version,
    u.last_login_at,
    u.created_at,
    u.updated_at
  FROM users u
  JOIN roles r ON r.id = u.role_id
`;

async function findByEmail(email) {
  const [rows] = await pool.execute(
    `${BASE_SELECT} WHERE u.email = :email LIMIT 1`,
    { email }
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `${BASE_SELECT} WHERE u.id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function findByIdWithoutPassword(id) {
  const user = await findById(id);
  if (!user) return null;
  const { password_hash, token_version, ...safe } = user;
  return safe;
}

async function emailExists(email) {
  const [rows] = await pool.execute(
    'SELECT id FROM users WHERE email = :email LIMIT 1',
    { email }
  );
  return rows.length > 0;
}

async function create({
  roleId,
  firstName,
  lastName,
  email,
  passwordHash,
  phone = null,
}) {
  const [result] = await pool.execute(
    `INSERT INTO users (role_id, first_name, last_name, email, password_hash, phone)
     VALUES (:roleId, :firstName, :lastName, :email, :passwordHash, :phone)`,
    { roleId, firstName, lastName, email, passwordHash, phone }
  );
  return findById(result.insertId);
}

async function updatePasswordAndBumpTokenVersion(id, passwordHash) {
  await pool.execute(
    `UPDATE users
     SET password_hash = :passwordHash, token_version = token_version + 1
     WHERE id = :id`,
    { id, passwordHash }
  );
}

async function bumpTokenVersion(id) {
  await pool.execute(
    'UPDATE users SET token_version = token_version + 1 WHERE id = :id',
    { id }
  );
}

async function updateLastLogin(id) {
  await pool.execute(
    'UPDATE users SET last_login_at = NOW() WHERE id = :id',
    { id }
  );
}

async function findRoleByName(name) {
  const [rows] = await pool.execute(
    'SELECT id, name FROM roles WHERE name = :name LIMIT 1',
    { name }
  );
  return rows[0] || null;
}

async function findRoleById(id) {
  const [rows] = await pool.execute(
    'SELECT id, name FROM roles WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

/**
 * Paginated, searchable, filterable list of users for the admin
 * "Manage Users" screen.
 */
async function list({ search, role, isActive, sortBy, order, limit, offset }) {
  const where = [];
  const params = {};

  if (search) {
    where.push(
      '(u.first_name LIKE :search OR u.last_name LIKE :search OR u.email LIKE :search)'
    );
    params.search = `%${search}%`;
  }
  if (role) {
    where.push('r.name = :role');
    params.role = role;
  }
  if (isActive !== undefined) {
    where.push('u.is_active = :isActive');
    params.isActive = isActive ? 1 : 0;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // sortBy is column-name-validated by the caller (pagination util whitelist)
  const sortColumn = sortBy.startsWith('u.') ? sortBy : `u.${sortBy}`;

  const [rows] = await pool.execute(
    `${BASE_SELECT} ${whereSql} ORDER BY ${sortColumn} ${order} LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id ${whereSql}`,
    params
  );

  return {
    rows: rows.map(({ password_hash, token_version, ...safe }) => safe),
    total: countRows[0].total,
  };
}

/**
 * Updates a user's own editable profile fields (name, phone, avatar).
 * Role/status changes go through updateAsAdmin() instead, since those
 * are privileged actions.
 */
async function updateProfile(id, { firstName, lastName, phone, avatarUrl }) {
  const setClauses = [];
  const params = { id };

  if (firstName !== undefined) { setClauses.push('first_name = :firstName'); params.firstName = firstName; }
  if (lastName !== undefined) { setClauses.push('last_name = :lastName'); params.lastName = lastName; }
  if (phone !== undefined) { setClauses.push('phone = :phone'); params.phone = phone; }
  if (avatarUrl !== undefined) { setClauses.push('avatar_url = :avatarUrl'); params.avatarUrl = avatarUrl; }

  if (setClauses.length === 0) return findById(id);

  await pool.execute(`UPDATE users SET ${setClauses.join(', ')} WHERE id = :id`, params);
  return findById(id);
}

/** Admin-only: can also change role_id and is_active. */
async function updateAsAdmin(id, { firstName, lastName, phone, roleId, isActive }) {
  const setClauses = [];
  const params = { id };

  if (firstName !== undefined) { setClauses.push('first_name = :firstName'); params.firstName = firstName; }
  if (lastName !== undefined) { setClauses.push('last_name = :lastName'); params.lastName = lastName; }
  if (phone !== undefined) { setClauses.push('phone = :phone'); params.phone = phone; }
  if (roleId !== undefined) { setClauses.push('role_id = :roleId'); params.roleId = roleId; }
  if (isActive !== undefined) { setClauses.push('is_active = :isActive'); params.isActive = isActive ? 1 : 0; }

  if (setClauses.length === 0) return findById(id);

  await pool.execute(`UPDATE users SET ${setClauses.join(', ')} WHERE id = :id`, params);
  return findById(id);
}

async function setActive(id, isActive) {
  await pool.execute(
    'UPDATE users SET is_active = :isActive, token_version = token_version + 1 WHERE id = :id',
    { id, isActive: isActive ? 1 : 0 }
  );
  return findById(id);
}

async function remove(id) {
  await pool.execute('DELETE FROM users WHERE id = :id', { id });
}

module.exports = {
  findByEmail,
  findById,
  findByIdWithoutPassword,
  emailExists,
  create,
  updatePasswordAndBumpTokenVersion,
  bumpTokenVersion,
  updateLastLogin,
  findRoleByName,
  findRoleById,
  list,
  updateProfile,
  updateAsAdmin,
  setActive,
  remove,
};
