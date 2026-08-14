// src/models/medicineStock.model.js
// Batch-level stock: receiving new batches, listing batches per medicine,
// expiry alerts, and the FIFO decrement logic that prescription
// dispensing depends on.

const { pool } = require('../config/db');

async function getTotalAvailable(connection, medicineId) {
  const [rows] = await connection.execute(
    `SELECT COALESCE(SUM(quantity), 0) AS total
     FROM medicine_stock
     WHERE medicine_id = :medicineId AND expiry_date >= CURDATE()`,
    { medicineId }
  );
  return Number(rows[0].total);
}

/** All batches for a medicine, soonest-expiring first. */
async function listByMedicine(medicineId) {
  const [rows] = await pool.execute(
    `SELECT id, medicine_id, batch_number, quantity, expiry_date, received_at, supplier, created_at
     FROM medicine_stock WHERE medicine_id = :medicineId ORDER BY expiry_date ASC`,
    { medicineId }
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute('SELECT * FROM medicine_stock WHERE id = :id LIMIT 1', { id });
  return rows[0] || null;
}

/** Receive a new stock batch (e.g. a delivery from a supplier). */
async function receiveBatch({ medicineId, batchNumber, quantity, expiryDate, supplier, receivedAt }) {
  const [result] = await pool.execute(
    `INSERT INTO medicine_stock (medicine_id, batch_number, quantity, expiry_date, supplier, received_at)
     VALUES (:medicineId, :batchNumber, :quantity, :expiryDate, :supplier, COALESCE(:receivedAt, CURDATE()))`,
    {
      medicineId,
      batchNumber: batchNumber || null,
      quantity,
      expiryDate,
      supplier: supplier || null,
      receivedAt: receivedAt || null,
    }
  );
  return findById(result.insertId);
}

/**
 * Batches expiring within `withinDays` (default 30) that still have
 * stock remaining - feeds the "Expiry alerts" pharmacy dashboard widget.
 */
async function listExpiringSoon(withinDays = 30) {
  const [rows] = await pool.execute(
    `SELECT ms.id, ms.medicine_id, ms.batch_number, ms.quantity, ms.expiry_date, ms.supplier,
            m.name AS medicine_name, m.unit AS medicine_unit
     FROM medicine_stock ms
     JOIN medicines m ON m.id = ms.medicine_id
     WHERE ms.quantity > 0
       AND ms.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL :withinDays DAY)
     ORDER BY ms.expiry_date ASC`,
    { withinDays }
  );
  return rows;
}

/** Already-expired batches that still show remaining quantity (should be written off). */
async function listExpired() {
  const [rows] = await pool.execute(
    `SELECT ms.id, ms.medicine_id, ms.batch_number, ms.quantity, ms.expiry_date,
            m.name AS medicine_name, m.unit AS medicine_unit
     FROM medicine_stock ms
     JOIN medicines m ON m.id = ms.medicine_id
     WHERE ms.quantity > 0 AND ms.expiry_date < CURDATE()
     ORDER BY ms.expiry_date ASC`
  );
  return rows;
}

/**
 * Decrements `quantity` units from the medicine's stock batches, oldest
 * (soonest-to-expire, non-expired) batch first. Must be called inside a
 * transaction with `connection.execute` locking the rows via FOR UPDATE
 * to avoid a race between two pharmacists dispensing at once.
 *
 * Throws if there isn't enough total stock across all batches.
 */
async function decrementFifo(connection, medicineId, quantity) {
  const [batches] = await connection.execute(
    `SELECT id, quantity FROM medicine_stock
     WHERE medicine_id = :medicineId AND quantity > 0 AND expiry_date >= CURDATE()
     ORDER BY expiry_date ASC
     FOR UPDATE`,
    { medicineId }
  );

  let remaining = quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    await connection.execute(
      'UPDATE medicine_stock SET quantity = quantity - :take WHERE id = :id',
      { take, id: batch.id }
    );
    remaining -= take;
  }

  if (remaining > 0) {
    const err = new Error('Insufficient stock to dispense the requested quantity.');
    err.code = 'INSUFFICIENT_STOCK';
    throw err;
  }
}

module.exports = {
  getTotalAvailable,
  listByMedicine,
  findById,
  receiveBatch,
  listExpiringSoon,
  listExpired,
  decrementFifo,
};
