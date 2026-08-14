// src/models/appointment.model.js

const { pool } = require('../config/db');
const doctorAvailabilityModel = require('./doctorAvailability.model');
const { sqlInt } = require('../utils/pagination');

const BASE_SELECT = `
  SELECT
    a.id, a.patient_id, a.doctor_id, a.department_id, a.scheduled_at, a.duration_minutes,
    a.reason, a.status, a.cancellation_reason, a.booked_by, a.created_at, a.updated_at,
    p.patient_code, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
    p.phone AS patient_phone,
    du.first_name AS doctor_first_name, du.last_name AS doctor_last_name,
    doc.specialization AS doctor_specialization,
    dep.name AS department_name
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  JOIN doctors doc ON doc.id = a.doctor_id
  JOIN users du ON du.id = doc.user_id
  LEFT JOIN departments dep ON dep.id = a.department_id
`;

// A completed or no-show appointment still occupied that time slot -
// only a cancelled appointment actually frees it back up. This single
// list is the source of truth for "does this appointment block the
// slot", used by both hasConflict() (booking/reschedule validation)
// and getAvailableSlots() (the slot generator) - previously each of
// those hardcoded its own separate, out-of-sync copy of this list
// (missing 'completed'/'no_show'), which let a slot that was actually
// used reappear as bookable.
const BLOCKING_STATUSES = ['scheduled', 'confirmed', 'checked_in', 'completed', 'no_show'];
const BLOCKING_STATUS_LIST_SQL = BLOCKING_STATUSES.map((s) => `'${s}'`).join(',');

/**
 * True if the doctor already has a non-cancelled appointment whose time
 * range overlaps [scheduledAt, scheduledAt + durationMinutes).
 * Pass excludeAppointmentId when rescheduling an existing appointment
 * so it doesn't conflict with itself.
 */
async function hasConflict(doctorId, scheduledAt, durationMinutes, excludeAppointmentId = null) {
  const params = {
    doctorId,
    scheduledAt,
    durationMinutes,
  };

  let exclude = '';
  if (excludeAppointmentId) {
    exclude = 'AND a.id != :excludeId';
    params.excludeId = excludeAppointmentId;
  }

  const [rows] = await pool.execute(
    `SELECT a.id FROM appointments a
     WHERE a.doctor_id = :doctorId
       AND a.status IN (${BLOCKING_STATUS_LIST_SQL})
       ${exclude}
       AND a.scheduled_at < DATE_ADD(:scheduledAt, INTERVAL :durationMinutes MINUTE)
       AND DATE_ADD(a.scheduled_at, INTERVAL a.duration_minutes MINUTE) > :scheduledAt
     LIMIT 1`,
    params
  );

  return rows.length > 0;
}

async function list({
  patientId, doctorId, departmentId, status, dateFrom, dateTo, search,
  sortBy, order, limit, offset,
}) {
  const where = [];
  const params = {};

  if (patientId) { where.push('a.patient_id = :patientId'); params.patientId = patientId; }
  if (doctorId) { where.push('a.doctor_id = :doctorId'); params.doctorId = doctorId; }
  if (departmentId) { where.push('a.department_id = :departmentId'); params.departmentId = departmentId; }
  if (status) { where.push('a.status = :status'); params.status = status; }
  if (dateFrom) { where.push('a.scheduled_at >= :dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo) { where.push('a.scheduled_at <= :dateTo'); params.dateTo = dateTo; }
  if (search) {
    where.push(
      `(p.first_name LIKE :search OR p.last_name LIKE :search OR p.patient_code LIKE :search
        OR du.first_name LIKE :search OR du.last_name LIKE :search)`
    );
    params.search = `%${search}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortColumn = sortBy.startsWith('a.') ? sortBy : `a.${sortBy}`;

  const [rows] = await pool.execute(
    `${BASE_SELECT} ${whereSql} ORDER BY ${sortColumn} ${order} LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN doctors doc ON doc.id = a.doctor_id
     JOIN users du ON du.id = doc.user_id
     ${whereSql}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE a.id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function create({ patientId, doctorId, departmentId, scheduledAt, durationMinutes, reason, bookedBy }) {
  const [result] = await pool.execute(
    `INSERT INTO appointments (patient_id, doctor_id, department_id, scheduled_at, duration_minutes, reason, booked_by)
     VALUES (:patientId, :doctorId, :departmentId, :scheduledAt, :durationMinutes, :reason, :bookedBy)`,
    {
      patientId,
      doctorId,
      departmentId: departmentId || null,
      scheduledAt,
      durationMinutes: durationMinutes || 30,
      reason: reason || null,
      bookedBy: bookedBy || null,
    }
  );
  return findById(result.insertId);
}

async function reschedule(id, { scheduledAt, durationMinutes }) {
  const setClauses = ['status = :status'];
  const params = { id, status: 'scheduled' };

  if (scheduledAt !== undefined) { setClauses.push('scheduled_at = :scheduledAt'); params.scheduledAt = scheduledAt; }
  if (durationMinutes !== undefined) { setClauses.push('duration_minutes = :durationMinutes'); params.durationMinutes = durationMinutes; }

  await pool.execute(`UPDATE appointments SET ${setClauses.join(', ')} WHERE id = :id`, params);
  return findById(id);
}

async function updateStatus(id, status, cancellationReason = null) {
  await pool.execute(
    `UPDATE appointments SET status = :status, cancellation_reason = :cancellationReason WHERE id = :id`,
    { id, status, cancellationReason }
  );
  return findById(id);
}

async function remove(id) {
  await pool.execute('DELETE FROM appointments WHERE id = :id', { id });
}

/**
 * Computes open slots for a doctor on a given calendar date, based on
 * their weekly `doctor_availability` windows (active windows only)
 * minus any already-booked appointment on that day - using the same
 * BLOCKING_STATUSES as hasConflict(), so a completed or no-show visit
 * correctly keeps its slot from being offered again, while a cancelled
 * one correctly frees it. If the date is today, slots that have already
 * passed are excluded too.
 *
 * @param {number} doctorId
 * @param {string} dateStr  'YYYY-MM-DD'
 */
async function getAvailableSlots(doctorId, dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = date.getDay(); // 0=Sunday..6=Saturday

  const windows = await doctorAvailabilityModel.listByDoctorAndDay(doctorId, dayOfWeek);
  if (windows.length === 0) return [];

  const [bookedRows] = await pool.execute(
    `SELECT scheduled_at, duration_minutes FROM appointments
     WHERE doctor_id = :doctorId
       AND status IN (${BLOCKING_STATUS_LIST_SQL})
       AND DATE(scheduled_at) = :dateStr`,
    { doctorId, dateStr }
  );

  const booked = bookedRows.map((b) => {
    const start = new Date(b.scheduled_at).getTime();
    return { start, end: start + b.duration_minutes * 60000 };
  });

  // Never offer a slot that's already in the past when booking for today.
  const now = Date.now();
  const isToday = dateStr === new Date().toISOString().slice(0, 10);

  const slots = [];

  for (const win of windows) {
    const slotMs = win.slot_minutes * 60000;
    let cursor = new Date(`${dateStr}T${win.start_time}`).getTime();
    const windowEnd = new Date(`${dateStr}T${win.end_time}`).getTime();

    while (cursor + slotMs <= windowEnd) {
      const slotEnd = cursor + slotMs;
      const overlaps = booked.some((b) => cursor < b.end && slotEnd > b.start);
      const isPast = isToday && cursor <= now;
      if (!overlaps && !isPast) {
        slots.push({
          startsAt: new Date(cursor).toISOString(),
          durationMinutes: win.slot_minutes,
        });
      }
      cursor = slotEnd;
    }
  }

  return slots;
}

module.exports = {
  hasConflict,
  list,
  findById,
  create,
  reschedule,
  updateStatus,
  remove,
  getAvailableSlots,
  BLOCKING_STATUSES,
};
