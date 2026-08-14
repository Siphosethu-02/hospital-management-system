// src/models/doctorAvailability.model.js
// Manages each doctor's weekly recurring availability windows, used by
// the appointment scheduler to compute open slots for a given date.

const { pool } = require('../config/db');

const COLUMNS = 'id, doctor_id, day_of_week, start_time, end_time, slot_minutes, is_active';

/** Every window for a doctor, active and inactive - used by the management UI. */
async function listByDoctor(doctorId) {
  const [rows] = await pool.execute(
    `SELECT ${COLUMNS} FROM doctor_availability
     WHERE doctor_id = :doctorId
     ORDER BY day_of_week ASC, start_time ASC`,
    { doctorId }
  );
  return rows;
}

/** Only ACTIVE windows for one day - used by the slot generator. */
async function listByDoctorAndDay(doctorId, dayOfWeek) {
  const [rows] = await pool.execute(
    `SELECT ${COLUMNS} FROM doctor_availability
     WHERE doctor_id = :doctorId AND day_of_week = :dayOfWeek AND is_active = 1
     ORDER BY start_time ASC`,
    { doctorId, dayOfWeek }
  );
  return rows;
}

async function create({ doctorId, dayOfWeek, startTime, endTime, slotMinutes, isActive }) {
  const [result] = await pool.execute(
    `INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_minutes, is_active)
     VALUES (:doctorId, :dayOfWeek, :startTime, :endTime, :slotMinutes, :isActive)`,
    {
      doctorId,
      dayOfWeek,
      startTime,
      endTime,
      slotMinutes: slotMinutes || 30,
      isActive: isActive === undefined || isActive ? 1 : 0,
    }
  );
  return findById(result.insertId);
}

const UPDATABLE_FIELDS = ['day_of_week', 'start_time', 'end_time', 'slot_minutes', 'is_active'];

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

  await pool.execute(`UPDATE doctor_availability SET ${setClauses.join(', ')} WHERE id = :id`, params);
  return findById(id);
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${COLUMNS} FROM doctor_availability WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

/**
 * True if the doctor already has another window on the same day whose
 * time range overlaps [startTime, endTime). Pass excludeId when editing
 * an existing window so it doesn't conflict with itself. Only compares
 * against OTHER active windows - an inactive window can't collide with
 * anything since it doesn't generate slots.
 */
async function hasOverlap(doctorId, dayOfWeek, startTime, endTime, excludeId = null) {
  const params = { doctorId, dayOfWeek, startTime, endTime };
  let exclude = '';
  if (excludeId) {
    exclude = 'AND id != :excludeId';
    params.excludeId = excludeId;
  }

  const [rows] = await pool.execute(
    `SELECT id FROM doctor_availability
     WHERE doctor_id = :doctorId AND day_of_week = :dayOfWeek AND is_active = 1
       ${exclude}
       AND start_time < :endTime AND end_time > :startTime
     LIMIT 1`,
    params
  );
  return rows.length > 0;
}

async function remove(id) {
  await pool.execute('DELETE FROM doctor_availability WHERE id = :id', { id });
}

module.exports = { listByDoctor, listByDoctorAndDay, create, update, findById, hasOverlap, remove };
