// src/models/prescription.model.js

const { pool, withTransaction } = require('../config/db');
const { sqlInt } = require('../utils/pagination');
const medicineStockModel = require('./medicineStock.model');

const BASE_SELECT = `
  SELECT
    pr.id, pr.patient_id, pr.doctor_id, pr.medical_record_id, pr.status, pr.notes,
    pr.created_at, pr.updated_at,
    p.patient_code, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
    du.first_name AS doctor_first_name, du.last_name AS doctor_last_name
  FROM prescriptions pr
  JOIN patients p ON p.id = pr.patient_id
  JOIN doctors doc ON doc.id = pr.doctor_id
  JOIN users du ON du.id = doc.user_id
`;

const ITEMS_SELECT = `
  SELECT
    pi.id, pi.prescription_id, pi.medicine_id, pi.dosage, pi.frequency, pi.duration_days,
    pi.quantity, pi.instructions, pi.is_dispensed, pi.dispensed_by, pi.dispensed_at,
    m.name AS medicine_name, m.unit AS medicine_unit, m.unit_price
  FROM prescription_items pi
  JOIN medicines m ON m.id = pi.medicine_id
  WHERE pi.prescription_id = :prescriptionId
`;

async function list({ patientId, doctorId, status, sortBy, order, limit, offset }) {
  const where = [];
  const params = {};

  if (patientId) { where.push('pr.patient_id = :patientId'); params.patientId = patientId; }
  if (doctorId) { where.push('pr.doctor_id = :doctorId'); params.doctorId = doctorId; }
  if (status) { where.push('pr.status = :status'); params.status = status; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortColumn = sortBy.startsWith('pr.') ? sortBy : `pr.${sortBy}`;

  const [rows] = await pool.execute(
    `${BASE_SELECT} ${whereSql} ORDER BY ${sortColumn} ${order} LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM prescriptions pr ${whereSql}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE pr.id = :id LIMIT 1`, { id });
  if (!rows[0]) return null;

  const [items] = await pool.execute(ITEMS_SELECT, { prescriptionId: id });
  return { ...rows[0], items };
}

/**
 * @param {object} data
 * @param {Array<{medicineId:number, dosage:string, frequency:string, durationDays?:number, quantity:number, instructions?:string}>} data.items
 */
async function create(data) {
  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `INSERT INTO prescriptions (patient_id, doctor_id, medical_record_id, notes)
       VALUES (:patientId, :doctorId, :medicalRecordId, :notes)`,
      {
        patientId: data.patientId,
        doctorId: data.doctorId,
        medicalRecordId: data.medicalRecordId || null,
        notes: data.notes || null,
      }
    );
    const prescriptionId = result.insertId;

    for (const item of data.items) {
      await connection.execute(
        `INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, duration_days, quantity, instructions)
         VALUES (:prescriptionId, :medicineId, :dosage, :frequency, :durationDays, :quantity, :instructions)`,
        {
          prescriptionId,
          medicineId: item.medicineId,
          dosage: item.dosage,
          frequency: item.frequency,
          durationDays: item.durationDays || null,
          quantity: item.quantity,
          instructions: item.instructions || null,
        }
      );
    }

    const [rows] = await connection.execute(`${BASE_SELECT} WHERE pr.id = :id LIMIT 1`, { id: prescriptionId });
    const [items] = await connection.execute(ITEMS_SELECT, { prescriptionId });
    return { ...rows[0], items };
  });
}

async function updateStatus(id, status) {
  await pool.execute('UPDATE prescriptions SET status = :status WHERE id = :id', { id, status });
  return findById(id);
}

async function findItemById(itemId) {
  const [rows] = await pool.execute(
    `SELECT pi.*, m.name AS medicine_name FROM prescription_items pi
     JOIN medicines m ON m.id = pi.medicine_id WHERE pi.id = :itemId LIMIT 1`,
    { itemId }
  );
  return rows[0] || null;
}

/**
 * Dispenses a single prescription item: decrements stock (FIFO by
 * soonest expiry), marks the item dispensed, and rolls the parent
 * prescription's status up to `dispensed` or `partially_dispensed`.
 */
async function dispenseItem(itemId, dispensedBy) {
  return withTransaction(async (connection) => {
    const [itemRows] = await connection.execute(
      'SELECT * FROM prescription_items WHERE id = :itemId LIMIT 1 FOR UPDATE',
      { itemId }
    );
    const item = itemRows[0];
    if (!item) {
      const err = new Error('Prescription item not found.');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (item.is_dispensed) {
      const err = new Error('This item has already been dispensed.');
      err.code = 'ALREADY_DISPENSED';
      throw err;
    }

    await medicineStockModel.decrementFifo(connection, item.medicine_id, item.quantity);

    await connection.execute(
      `UPDATE prescription_items
       SET is_dispensed = 1, dispensed_by = :dispensedBy, dispensed_at = NOW()
       WHERE id = :itemId`,
      { dispensedBy, itemId }
    );

    const [allItems] = await connection.execute(
      'SELECT is_dispensed FROM prescription_items WHERE prescription_id = :prescriptionId',
      { prescriptionId: item.prescription_id }
    );
    const allDispensed = allItems.every((i) => i.is_dispensed);
    const newStatus = allDispensed ? 'dispensed' : 'partially_dispensed';

    await connection.execute('UPDATE prescriptions SET status = :status WHERE id = :id', {
      status: newStatus,
      id: item.prescription_id,
    });

    const [prescriptionRows] = await connection.execute(`${BASE_SELECT} WHERE pr.id = :id LIMIT 1`, {
      id: item.prescription_id,
    });
    const [items] = await connection.execute(ITEMS_SELECT, { prescriptionId: item.prescription_id });
    return { ...prescriptionRows[0], items };
  });
}

/**
 * Dispensing history for the Pharmacy dashboard: every dispensed
 * prescription item, joined with medicine, patient, and dispensing
 * pharmacist. Supports ?medicineId=&dispensedBy=&dateFrom=&dateTo=
 */
async function listDispensingHistory({ medicineId, dispensedBy, patientId, dateFrom, dateTo, limit, offset }) {
  const where = ['pi.is_dispensed = 1'];
  const params = {};

  if (medicineId) { where.push('pi.medicine_id = :medicineId'); params.medicineId = medicineId; }
  if (dispensedBy) { where.push('pi.dispensed_by = :dispensedBy'); params.dispensedBy = dispensedBy; }
  if (patientId) { where.push('pr.patient_id = :patientId'); params.patientId = patientId; }
  if (dateFrom) { where.push('pi.dispensed_at >= :dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo) { where.push('pi.dispensed_at <= :dateTo'); params.dateTo = dateTo; }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [rows] = await pool.execute(
    `SELECT
       pi.id AS item_id, pi.prescription_id, pi.quantity, pi.dosage, pi.frequency, pi.dispensed_at,
       m.id AS medicine_id, m.name AS medicine_name, m.unit AS medicine_unit, m.unit_price,
       p.id AS patient_id, p.patient_code, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
       du.first_name AS dispensed_by_first_name, du.last_name AS dispensed_by_last_name
     FROM prescription_items pi
     JOIN prescriptions pr ON pr.id = pi.prescription_id
     JOIN patients p ON p.id = pr.patient_id
     JOIN medicines m ON m.id = pi.medicine_id
     LEFT JOIN users du ON du.id = pi.dispensed_by
     ${whereSql}
     ORDER BY pi.dispensed_at DESC
     LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM prescription_items pi
     JOIN prescriptions pr ON pr.id = pi.prescription_id
     ${whereSql}`,
    params
  );

  return { rows, total: countRows[0].total };
}

module.exports = { list, findById, create, updateStatus, findItemById, dispenseItem, listDispensingHistory };
