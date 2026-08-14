// src/models/medicine.model.js
// Full medicine inventory model. Stage 4 only needed findById() to
// validate prescriptions against real medicines - this replaces that
// stub with the full CRUD + stock-aware queries the Pharmacy module needs.

const { pool } = require('../config/db');
const { sqlInt } = require('../utils/pagination');

const BASE_SELECT = `
  SELECT
    m.id, m.category_id, m.name, m.generic_name, m.manufacturer, m.unit,
    m.unit_price, m.reorder_level, m.is_active, m.created_at, m.updated_at,
    c.name AS category_name,
    COALESCE((
      SELECT SUM(ms.quantity) FROM medicine_stock ms
      WHERE ms.medicine_id = m.id AND ms.expiry_date >= CURDATE()
    ), 0) AS current_stock
  FROM medicines m
  LEFT JOIN medicine_categories c ON c.id = m.category_id
`;

async function list({ search, categoryId, isActive, lowStockOnly, sortBy, order, limit, offset }) {
  const where = [];
  const params = {};

  if (search) {
    where.push('(m.name LIKE :search OR m.generic_name LIKE :search OR m.manufacturer LIKE :search)');
    params.search = `%${search}%`;
  }
  if (categoryId) {
    where.push('m.category_id = :categoryId');
    params.categoryId = categoryId;
  }
  if (isActive !== undefined) {
    where.push('m.is_active = :isActive');
    params.isActive = isActive ? 1 : 0;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const havingSql = lowStockOnly ? 'HAVING current_stock <= m.reorder_level' : '';
  const sortColumn = sortBy.startsWith('m.') ? sortBy : `m.${sortBy}`;

  const [rows] = await pool.execute(
    `${BASE_SELECT} ${whereSql} ${havingSql} ORDER BY ${sortColumn} ${order} LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  // Count with the same HAVING semantics via a subquery, since MySQL
  // can't COUNT(*) directly over a HAVING on an aggregate alias cleanly
  // alongside pagination.
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM (
       ${BASE_SELECT} ${whereSql} ${havingSql}
     ) AS filtered`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE m.id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

/** Lightweight lookup used by the Prescriptions module (avoids the stock subquery). */
async function findBasicById(id) {
  const [rows] = await pool.execute(
    'SELECT id, name, generic_name, unit, unit_price, is_active FROM medicines WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.execute('SELECT id FROM medicines WHERE name = :name LIMIT 1', { name });
  return rows[0] || null;
}

async function create(data) {
  const [result] = await pool.execute(
    `INSERT INTO medicines (category_id, name, generic_name, manufacturer, unit, unit_price, reorder_level)
     VALUES (:categoryId, :name, :genericName, :manufacturer, :unit, :unitPrice, :reorderLevel)`,
    {
      categoryId: data.categoryId || null,
      name: data.name,
      genericName: data.genericName || null,
      manufacturer: data.manufacturer || null,
      unit: data.unit || 'tablet',
      unitPrice: data.unitPrice || 0,
      reorderLevel: data.reorderLevel ?? 20,
    }
  );
  return findById(result.insertId);
}

const UPDATABLE_FIELDS = [
  'category_id', 'name', 'generic_name', 'manufacturer', 'unit', 'unit_price', 'reorder_level', 'is_active',
];

async function update(id, fields) {
  const setClauses = [];
  const params = { id };

  for (const key of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      setClauses.push(`${key} = :${key}`);
      params[key] = fields[key];
    }
  }

  if (setClauses.length === 0) return findById(id);

  await pool.execute(`UPDATE medicines SET ${setClauses.join(', ')} WHERE id = :id`, params);
  return findById(id);
}

async function remove(id) {
  await pool.execute('DELETE FROM medicines WHERE id = :id', { id });
}

/** Medicines whose non-expired stock total is at or below their reorder level. */
async function listLowStock() {
  const [rows] = await pool.execute(
    `${BASE_SELECT} HAVING current_stock <= m.reorder_level ORDER BY current_stock ASC`
  );
  return rows;
}

module.exports = {
  list,
  findById,
  findBasicById,
  findByName,
  create,
  update,
  remove,
  listLowStock,
};
