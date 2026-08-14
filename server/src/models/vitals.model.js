// src/models/vitals.model.js

const { pool } = require('../config/db');
const { sqlInt } = require('../utils/pagination');

const BASE_SELECT = `
  SELECT
    v.id, v.patient_id, v.appointment_id, v.recorded_by,
    v.temperature_celsius, v.heart_rate_bpm, v.blood_pressure_systolic, v.blood_pressure_diastolic,
    v.respiratory_rate, v.oxygen_saturation, v.weight_kg, v.height_cm, v.notes, v.recorded_at,
    ru.first_name AS recorded_by_first_name, ru.last_name AS recorded_by_last_name
  FROM patient_vitals v
  JOIN users ru ON ru.id = v.recorded_by
`;

async function listByPatient(patientId, { limit, offset } = {}) {
  const params = { patientId };
  let limitSql = '';
  if (limit !== undefined) {
    limitSql = `LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset || 0)}`;
  }

  const [rows] = await pool.execute(
    `${BASE_SELECT} WHERE v.patient_id = :patientId ORDER BY v.recorded_at DESC ${limitSql}`,
    params
  );

  const [countRows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM patient_vitals WHERE patient_id = :patientId',
    { patientId }
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE v.id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function create(data) {
  const [result] = await pool.execute(
    `INSERT INTO patient_vitals (
      patient_id, appointment_id, recorded_by, temperature_celsius, heart_rate_bpm,
      blood_pressure_systolic, blood_pressure_diastolic, respiratory_rate,
      oxygen_saturation, weight_kg, height_cm, notes
    ) VALUES (
      :patientId, :appointmentId, :recordedBy, :temperatureCelsius, :heartRateBpm,
      :bloodPressureSystolic, :bloodPressureDiastolic, :respiratoryRate,
      :oxygenSaturation, :weightKg, :heightCm, :notes
    )`,
    {
      patientId: data.patientId,
      appointmentId: data.appointmentId || null,
      recordedBy: data.recordedBy,
      temperatureCelsius: data.temperatureCelsius ?? null,
      heartRateBpm: data.heartRateBpm ?? null,
      bloodPressureSystolic: data.bloodPressureSystolic ?? null,
      bloodPressureDiastolic: data.bloodPressureDiastolic ?? null,
      respiratoryRate: data.respiratoryRate ?? null,
      oxygenSaturation: data.oxygenSaturation ?? null,
      weightKg: data.weightKg ?? null,
      heightCm: data.heightCm ?? null,
      notes: data.notes || null,
    }
  );
  return findById(result.insertId);
}

module.exports = { listByPatient, findById, create };
