// src/models/invoice.model.js

const { pool, withTransaction } = require('../config/db');
const { sqlInt } = require('../utils/pagination');

const BASE_SELECT = `
  SELECT
    i.id, i.invoice_number, i.patient_id, i.appointment_id, i.subtotal, i.discount, i.tax,
    i.total, i.amount_paid, i.status, i.due_date, i.created_by, i.created_at, i.updated_at,
    p.patient_code, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
    (i.total - i.amount_paid) AS balance_due
  FROM invoices i
  JOIN patients p ON p.id = i.patient_id
`;

const ITEMS_SELECT = `SELECT * FROM invoice_items WHERE invoice_id = :invoiceId ORDER BY id ASC`;

async function list({ patientId, status, dateFrom, dateTo, search, sortBy, order, limit, offset }) {
  const where = [];
  const params = {};

  if (patientId) { where.push('i.patient_id = :patientId'); params.patientId = patientId; }
  if (status) { where.push('i.status = :status'); params.status = status; }
  if (dateFrom) { where.push('i.created_at >= :dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo) { where.push('i.created_at <= :dateTo'); params.dateTo = dateTo; }
  if (search) {
    where.push('(i.invoice_number LIKE :search OR p.first_name LIKE :search OR p.last_name LIKE :search OR p.patient_code LIKE :search)');
    params.search = `%${search}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortColumn = sortBy.startsWith('i.') ? sortBy : `i.${sortBy}`;

  const [rows] = await pool.execute(
    `${BASE_SELECT} ${whereSql} ORDER BY ${sortColumn} ${order} LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM invoices i JOIN patients p ON p.id = i.patient_id ${whereSql}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE i.id = :id LIMIT 1`, { id });
  if (!rows[0]) return null;
  const [items] = await pool.execute(ITEMS_SELECT, { invoiceId: id });
  const [payments] = await pool.execute(
    `SELECT p.*, ru.first_name AS received_by_first_name, ru.last_name AS received_by_last_name
     FROM payments p LEFT JOIN users ru ON ru.id = p.received_by
     WHERE p.invoice_id = :invoiceId ORDER BY p.paid_at DESC`,
    { invoiceId: id }
  );
  return { ...rows[0], items, payments };
}

async function generateInvoiceNumber(connection) {
  const year = new Date().getFullYear();
  const [rows] = await connection.execute(
    'SELECT COUNT(*) AS count FROM invoices WHERE invoice_number LIKE :prefix FOR UPDATE',
    { prefix: `INV-${year}-%` }
  );
  const nextSeq = rows[0].count + 1;
  return `INV-${year}-${String(nextSeq).padStart(6, '0')}`;
}

/**
 * @param {Array<{description:string, itemType:string, referenceId?:number, quantity:number, unitPrice:number}>} data.items
 */
async function create(data) {
  return withTransaction(async (connection) => {
    const invoiceNumber = await generateInvoiceNumber(connection);

    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discount = data.discount || 0;
    const tax = data.tax || 0;
    const total = subtotal - discount + tax;

    const [result] = await connection.execute(
      `INSERT INTO invoices (invoice_number, patient_id, appointment_id, subtotal, discount, tax, total, due_date, created_by)
       VALUES (:invoiceNumber, :patientId, :appointmentId, :subtotal, :discount, :tax, :total, :dueDate, :createdBy)`,
      {
        invoiceNumber,
        patientId: data.patientId,
        appointmentId: data.appointmentId || null,
        subtotal, discount, tax, total,
        dueDate: data.dueDate || null,
        createdBy: data.createdBy || null,
      }
    );
    const invoiceId = result.insertId;

    for (const item of data.items) {
      const lineTotal = item.quantity * item.unitPrice;
      await connection.execute(
        `INSERT INTO invoice_items (invoice_id, description, item_type, reference_id, quantity, unit_price, line_total)
         VALUES (:invoiceId, :description, :itemType, :referenceId, :quantity, :unitPrice, :lineTotal)`,
        {
          invoiceId,
          description: item.description,
          itemType: item.itemType || 'other',
          referenceId: item.referenceId || null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal,
        }
      );
    }

    const [rows] = await connection.execute(`${BASE_SELECT} WHERE i.id = :id LIMIT 1`, { id: invoiceId });
    const [items] = await connection.execute(ITEMS_SELECT, { invoiceId });
    return { ...rows[0], items, payments: [] };
  });
}

/** Records a payment and rolls the invoice status up to partially_paid / paid. */
async function recordPayment(invoiceId, { amount, paymentMethod, referenceNumber, receivedBy }) {
  return withTransaction(async (connection) => {
    const [invRows] = await connection.execute(
      'SELECT * FROM invoices WHERE id = :id LIMIT 1 FOR UPDATE',
      { id: invoiceId }
    );
    const invoice = invRows[0];
    if (!invoice) {
      const err = new Error('Invoice not found.');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (invoice.status === 'void') {
      const err = new Error('Cannot record a payment against a void invoice.');
      err.code = 'INVALID_STATE';
      throw err;
    }

    await connection.execute(
      `INSERT INTO payments (invoice_id, amount, payment_method, reference_number, received_by)
       VALUES (:invoiceId, :amount, :paymentMethod, :referenceNumber, :receivedBy)`,
      { invoiceId, amount, paymentMethod: paymentMethod || 'cash', referenceNumber: referenceNumber || null, receivedBy: receivedBy || null }
    );

    const newAmountPaid = Number(invoice.amount_paid) + Number(amount);
    const newStatus = newAmountPaid >= Number(invoice.total) ? 'paid' : 'partially_paid';

    await connection.execute(
      'UPDATE invoices SET amount_paid = :amountPaid, status = :status WHERE id = :id',
      { amountPaid: newAmountPaid, status: newStatus, id: invoiceId }
    );

    const [rows] = await connection.execute(`${BASE_SELECT} WHERE i.id = :id LIMIT 1`, { id: invoiceId });
    const [items] = await connection.execute(ITEMS_SELECT, { invoiceId });
    const [payments] = await connection.execute(
      'SELECT * FROM payments WHERE invoice_id = :invoiceId ORDER BY paid_at DESC',
      { invoiceId }
    );
    return { ...rows[0], items, payments };
  });
}

async function voidInvoice(id) {
  await pool.execute("UPDATE invoices SET status = 'void' WHERE id = :id", { id });
  return findById(id);
}

module.exports = { list, findById, create, recordPayment, voidInvoice };
