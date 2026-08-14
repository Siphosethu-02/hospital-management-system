// src/models/labTest.model.js

const { pool } = require('../config/db');
const { sqlInt } = require('../utils/pagination');

const BASE_SELECT = `
  SELECT
    lt.id, lt.patient_id, lt.doctor_id, lt.medical_record_id, lt.test_name, lt.test_type,
    lt.priority, lt.status, lt.requested_at, lt.notes,
    p.patient_code, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
    du.first_name AS doctor_first_name, du.last_name AS doctor_last_name
  FROM laboratory_tests lt
  JOIN patients p ON p.id = lt.patient_id
  JOIN doctors doc ON doc.id = lt.doctor_id
  JOIN users du ON du.id = doc.user_id
`;

async function list({ patientId, doctorId, status, priority, sortBy, order, limit, offset }) {
  const where = [];
  const params = {};

  if (patientId) { where.push('lt.patient_id = :patientId'); params.patientId = patientId; }
  if (doctorId) { where.push('lt.doctor_id = :doctorId'); params.doctorId = doctorId; }
  if (status) { where.push('lt.status = :status'); params.status = status; }
  if (priority) { where.push('lt.priority = :priority'); params.priority = priority; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortColumn = sortBy.startsWith('lt.') ? sortBy : `lt.${sortBy}`;

  const [rows] = await pool.execute(
    `${BASE_SELECT} ${whereSql} ORDER BY ${sortColumn} ${order} LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM laboratory_tests lt ${whereSql}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE lt.id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function create({ patientId, doctorId, medicalRecordId, testName, testType, priority, notes }) {
  const [result] = await pool.execute(
    `INSERT INTO laboratory_tests (patient_id, doctor_id, medical_record_id, test_name, test_type, priority, notes)
     VALUES (:patientId, :doctorId, :medicalRecordId, :testName, :testType, :priority, :notes)`,
    {
      patientId, doctorId,
      medicalRecordId: medicalRecordId || null,
      testName,
      testType: testType || null,
      priority: priority || 'routine',
      notes: notes || null,
    }
  );
  return findById(result.insertId);
}

async function updateStatus(id, status) {
  await pool.execute('UPDATE laboratory_tests SET status = :status WHERE id = :id', { id, status });
  return findById(id);
}

async function remove(id) {
  await pool.execute('DELETE FROM laboratory_tests WHERE id = :id', { id });
}

module.exports = { list, findById, create, updateStatus, remove };
