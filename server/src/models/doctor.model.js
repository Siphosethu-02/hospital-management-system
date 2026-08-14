// src/models/doctor.model.js
// Data-access layer for the `doctors` table, which is a 1:1 profile
// extension of `users` for anyone with role = 'doctor'.

const { pool } = require('../config/db');
const { sqlInt } = require('../utils/pagination');

const DIRECTORY_SELECT = `
  SELECT
    doc.id, doc.user_id, doc.department_id, doc.specialization, doc.qualification,
    doc.license_number, doc.years_of_experience, doc.consultation_fee, doc.bio,
    doc.room_number, doc.created_at, doc.updated_at,
    u.first_name, u.last_name, u.email, u.phone, u.avatar_url, u.is_active,
    dep.name AS department_name
  FROM doctors doc
  JOIN users u ON u.id = doc.user_id
  LEFT JOIN departments dep ON dep.id = doc.department_id
`;

async function findByUserId(userId) {
  const [rows] = await pool.execute(
    'SELECT * FROM doctors WHERE user_id = :userId LIMIT 1',
    { userId }
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT * FROM doctors WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

/** Full directory profile (joined with user + department), for the public/staff doctor directory. */
async function findDirectoryProfileById(id) {
  const [rows] = await pool.execute(`${DIRECTORY_SELECT} WHERE doc.id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

/**
 * Paginated, searchable doctor directory - used by the public "Doctors"
 * page, the receptionist's appointment-booking screen, and admin's
 * "Manage Doctors" view.
 */
async function list({ search, departmentId, isActive, sortBy, order, limit, offset }) {
  const where = [];
  const params = {};

  if (search) {
    where.push(
      '(u.first_name LIKE :search OR u.last_name LIKE :search OR doc.specialization LIKE :search)'
    );
    params.search = `%${search}%`;
  }
  if (departmentId) {
    where.push('doc.department_id = :departmentId');
    params.departmentId = departmentId;
  }
  if (isActive !== undefined) {
    where.push('u.is_active = :isActive');
    params.isActive = isActive ? 1 : 0;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortColumn = sortBy.startsWith('u.') || sortBy.startsWith('doc.') ? sortBy : `u.${sortBy}`;

  const [rows] = await pool.execute(
    `${DIRECTORY_SELECT} ${whereSql} ORDER BY ${sortColumn} ${order} LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM doctors doc JOIN users u ON u.id = doc.user_id ${whereSql}`,
    params
  );

  return { rows, total: countRows[0].total };
}

/**
 * Creates a minimal doctor profile row, called automatically whenever a
 * user is created/promoted to the doctor role. Detailed fields
 * (specialization, license number, fee, etc.) can be filled in later
 * via updateProfile().
 */
async function createMinimal(userId, departmentId = null) {
  const [result] = await pool.execute(
    'INSERT INTO doctors (user_id, department_id) VALUES (:userId, :departmentId)',
    { userId, departmentId }
  );
  return findById(result.insertId);
}

async function updateProfile(userId, fields) {
  const allowed = [
    'department_id',
    'specialization',
    'qualification',
    'license_number',
    'years_of_experience',
    'consultation_fee',
    'bio',
    'room_number',
  ];

  const setClauses = [];
  const params = { userId };

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      setClauses.push(`${key} = :${key}`);
      params[key] = fields[key];
    }
  }

  if (setClauses.length === 0) return findByUserId(userId);

  await pool.execute(
    `UPDATE doctors SET ${setClauses.join(', ')} WHERE user_id = :userId`,
    params
  );

  return findByUserId(userId);
}

async function deleteByUserId(userId) {
  await pool.execute('DELETE FROM doctors WHERE user_id = :userId', { userId });
}

/** Directly reassigns a doctor (by doctors.id) to a different department - used by department management, where the department is the "owner" of the action rather than the doctor's own profile edit. */
async function setDepartment(doctorId, departmentId) {
  await pool.execute('UPDATE doctors SET department_id = :departmentId WHERE id = :doctorId', {
    doctorId,
    departmentId,
  });
  return findById(doctorId);
}

module.exports = {
  findByUserId,
  findById,
  findDirectoryProfileById,
  list,
  createMinimal,
  updateProfile,
  deleteByUserId,
  setDepartment,
};
