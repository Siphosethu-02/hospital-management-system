// src/models/medicalRecord.model.js

const { pool } = require('../config/db');
const { sqlInt } = require('../utils/pagination');

const BASE_SELECT = `
  SELECT
    mr.id, mr.patient_id, mr.doctor_id, mr.appointment_id, mr.diagnosis, mr.symptoms,
    mr.treatment_plan, mr.doctor_notes, mr.follow_up_date, mr.created_at, mr.updated_at,
    p.patient_code, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
    du.first_name AS doctor_first_name, du.last_name AS doctor_last_name
  FROM medical_records mr
  JOIN patients p ON p.id = mr.patient_id
  JOIN doctors doc ON doc.id = mr.doctor_id
  JOIN users du ON du.id = doc.user_id
`;

async function list({ patientId, doctorId, sortBy, order, limit, offset }) {
  const where = [];
  const params = {};

  if (patientId) { where.push('mr.patient_id = :patientId'); params.patientId = patientId; }
  if (doctorId) { where.push('mr.doctor_id = :doctorId'); params.doctorId = doctorId; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortColumn = sortBy.startsWith('mr.') ? sortBy : `mr.${sortBy}`;

  const [rows] = await pool.execute(
    `${BASE_SELECT} ${whereSql} ORDER BY ${sortColumn} ${order} LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM medical_records mr ${whereSql}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE mr.id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function create({ patientId, doctorId, appointmentId, diagnosis, symptoms, treatmentPlan, doctorNotes, followUpDate }) {
  const [result] = await pool.execute(
    `INSERT INTO medical_records
       (patient_id, doctor_id, appointment_id, diagnosis, symptoms, treatment_plan, doctor_notes, follow_up_date)
     VALUES
       (:patientId, :doctorId, :appointmentId, :diagnosis, :symptoms, :treatmentPlan, :doctorNotes, :followUpDate)`,
    {
      patientId,
      doctorId,
      appointmentId: appointmentId || null,
      diagnosis,
      symptoms: symptoms || null,
      treatmentPlan: treatmentPlan || null,
      doctorNotes: doctorNotes || null,
      followUpDate: followUpDate || null,
    }
  );
  return findById(result.insertId);
}

const UPDATABLE_FIELDS = ['diagnosis', 'symptoms', 'treatment_plan', 'doctor_notes', 'follow_up_date'];

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

  await pool.execute(`UPDATE medical_records SET ${setClauses.join(', ')} WHERE id = :id`, params);
  return findById(id);
}

async function remove(id) {
  await pool.execute('DELETE FROM medical_records WHERE id = :id', { id });
}

// --- Attachments ------------------------------------------------------

async function listAttachments(medicalRecordId) {
  const [rows] = await pool.execute(
    `SELECT id, medical_record_id, file_name, file_url, file_type, uploaded_by, uploaded_at
     FROM medical_record_attachments WHERE medical_record_id = :medicalRecordId
     ORDER BY uploaded_at DESC`,
    { medicalRecordId }
  );
  return rows;
}

async function addAttachment({ medicalRecordId, fileName, fileUrl, fileType, uploadedBy }) {
  const [result] = await pool.execute(
    `INSERT INTO medical_record_attachments (medical_record_id, file_name, file_url, file_type, uploaded_by)
     VALUES (:medicalRecordId, :fileName, :fileUrl, :fileType, :uploadedBy)`,
    { medicalRecordId, fileName, fileUrl, fileType: fileType || null, uploadedBy }
  );
  const [rows] = await pool.execute(
    'SELECT * FROM medical_record_attachments WHERE id = :id',
    { id: result.insertId }
  );
  return rows[0];
}

async function findAttachmentById(id) {
  const [rows] = await pool.execute(
    'SELECT * FROM medical_record_attachments WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

async function removeAttachment(id) {
  await pool.execute('DELETE FROM medical_record_attachments WHERE id = :id', { id });
}

module.exports = {
  list,
  findById,
  create,
  update,
  remove,
  listAttachments,
  addAttachment,
  findAttachmentById,
  removeAttachment,
};
