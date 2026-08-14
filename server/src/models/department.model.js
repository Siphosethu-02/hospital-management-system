// src/models/department.model.js

const { pool } = require('../config/db');
const { sqlInt } = require('../utils/pagination');

const BASE_SELECT = `
  SELECT
    d.id, d.name, d.description, d.head_doctor_id, d.is_active,
    d.created_at, d.updated_at,
    hu.first_name AS head_doctor_first_name,
    hu.last_name AS head_doctor_last_name,
    (SELECT COUNT(*) FROM doctors doc WHERE doc.department_id = d.id) AS doctor_count
  FROM departments d
  LEFT JOIN doctors hd ON hd.id = d.head_doctor_id
  LEFT JOIN users hu ON hu.id = hd.user_id
`;

async function list({ search, isActive, sortBy, order, limit, offset }) {
  const where = [];
  const params = {};

  if (search) {
    where.push('(d.name LIKE :search OR d.description LIKE :search)');
    params.search = `%${search}%`;
  }
  if (isActive !== undefined) {
    where.push('d.is_active = :isActive');
    params.isActive = isActive ? 1 : 0;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `${BASE_SELECT} ${whereSql} ORDER BY d.${sortBy} ${order} LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM departments d ${whereSql}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE d.id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.execute(
    'SELECT id FROM departments WHERE name = :name LIMIT 1',
    { name }
  );
  return rows[0] || null;
}

async function create({ name, description, headDoctorId }) {
  const [result] = await pool.execute(
    `INSERT INTO departments (name, description, head_doctor_id)
     VALUES (:name, :description, :headDoctorId)`,
    { name, description: description || null, headDoctorId: headDoctorId || null }
  );
  return findById(result.insertId);
}

async function update(id, fields) {
  const allowed = ['name', 'description', 'head_doctor_id', 'is_active'];
  const setClauses = [];
  const params = { id };

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      setClauses.push(`${key} = :${key}`);
      params[key] = fields[key];
    }
  }

  if (setClauses.length === 0) return findById(id);

  await pool.execute(`UPDATE departments SET ${setClauses.join(', ')} WHERE id = :id`, params);
  return findById(id);
}

async function remove(id) {
  await pool.execute('DELETE FROM departments WHERE id = :id', { id });
}

/** Lightweight list for populating dropdowns (no pagination). */
async function listAllActive() {
  const [rows] = await pool.execute(
    'SELECT id, name FROM departments WHERE is_active = 1 ORDER BY name ASC'
  );
  return rows;
}

module.exports = { list, findById, findByName, create, update, remove, listAllActive };
