// src/models/medicineCategory.model.js

const { pool } = require('../config/db');

async function listAll() {
  const [rows] = await pool.execute(
    `SELECT c.id, c.name, (SELECT COUNT(*) FROM medicines m WHERE m.category_id = c.id) AS medicine_count
     FROM medicine_categories c ORDER BY c.name ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute('SELECT * FROM medicine_categories WHERE id = :id LIMIT 1', { id });
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.execute('SELECT id FROM medicine_categories WHERE name = :name LIMIT 1', { name });
  return rows[0] || null;
}

async function create(name) {
  const [result] = await pool.execute('INSERT INTO medicine_categories (name) VALUES (:name)', { name });
  return findById(result.insertId);
}

async function update(id, name) {
  await pool.execute('UPDATE medicine_categories SET name = :name WHERE id = :id', { id, name });
  return findById(id);
}

async function remove(id) {
  await pool.execute('DELETE FROM medicine_categories WHERE id = :id', { id });
}

module.exports = { listAll, findById, findByName, create, update, remove };
