// src/models/report.model.js
// Aggregate queries backing the admin dashboard analytics widgets and
// the exportable PDF reports. Every function returns plain rows/objects
// ready to hand to Chart.js on the frontend or a PDF table on the backend.

const { pool } = require('../config/db');

/** High-level counts for the top-of-dashboard summary cards. */
async function getDashboardSummary() {
  const [[patients]] = await pool.query(
    "SELECT COUNT(*) AS total FROM patients WHERE is_active = 1"
  );
  const [[doctors]] = await pool.query(
    "SELECT COUNT(*) AS total FROM doctors doc JOIN users u ON u.id = doc.user_id WHERE u.is_active = 1"
  );
  const [[appointmentsToday]] = await pool.query(
    "SELECT COUNT(*) AS total FROM appointments WHERE DATE(scheduled_at) = CURDATE() AND status != 'cancelled'"
  );
  const [[revenueThisMonth]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
     WHERE YEAR(paid_at) = YEAR(CURDATE()) AND MONTH(paid_at) = MONTH(CURDATE())`
  );
  const [[pendingLabTests]] = await pool.query(
    "SELECT COUNT(*) AS total FROM laboratory_tests WHERE status IN ('requested','sample_collected','in_progress')"
  );
  const [[lowStockMedicines]] = await pool.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT m.id, m.reorder_level,
         COALESCE((SELECT SUM(ms.quantity) FROM medicine_stock ms WHERE ms.medicine_id = m.id AND ms.expiry_date >= CURDATE()), 0) AS stock
       FROM medicines m WHERE m.is_active = 1
     ) t WHERE t.stock <= t.reorder_level`
  );
  const [[outstandingInvoices]] = await pool.query(
    "SELECT COALESCE(SUM(total - amount_paid), 0) AS total FROM invoices WHERE status IN ('unpaid','partially_paid')"
  );

  return {
    totalActivePatients: Number(patients.total),
    totalActiveDoctors: Number(doctors.total),
    appointmentsToday: Number(appointmentsToday.total),
    revenueThisMonth: Number(revenueThisMonth.total),
    pendingLabTests: Number(pendingLabTests.total),
    lowStockMedicines: Number(lowStockMedicines.total),
    outstandingBalance: Number(outstandingInvoices.total),
  };
}

/** New patient registrations grouped by day or month, for a line/bar chart. */
async function getPatientsOverTime({ groupBy = 'day', dateFrom, dateTo }) {
  const dateExpr = groupBy === 'month' ? "DATE_FORMAT(created_at, '%Y-%m')" : 'DATE(created_at)';
  const where = [];
  const params = {};
  if (dateFrom) { where.push('created_at >= :dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo) { where.push('created_at <= :dateTo'); params.dateTo = dateTo; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT ${dateExpr} AS period, COUNT(*) AS count FROM patients ${whereSql}
     GROUP BY period ORDER BY period ASC`,
    params
  );
  return rows;
}

/** Appointment counts grouped by status within a date range. */
async function getAppointmentStats({ dateFrom, dateTo }) {
  const where = [];
  const params = {};
  if (dateFrom) { where.push('scheduled_at >= :dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo) { where.push('scheduled_at <= :dateTo'); params.dateTo = dateTo; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [byStatus] = await pool.execute(
    `SELECT status, COUNT(*) AS count FROM appointments ${whereSql} GROUP BY status`,
    params
  );
  const [byDay] = await pool.execute(
    `SELECT DATE(scheduled_at) AS day, COUNT(*) AS count FROM appointments ${whereSql}
     GROUP BY day ORDER BY day ASC`,
    params
  );
  return { byStatus, byDay };
}

/** Revenue collected (from `payments`), grouped by day or month. */
async function getRevenueStats({ groupBy = 'day', dateFrom, dateTo }) {
  const dateExpr = groupBy === 'month' ? "DATE_FORMAT(paid_at, '%Y-%m')" : 'DATE(paid_at)';
  const where = [];
  const params = {};
  if (dateFrom) { where.push('paid_at >= :dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo) { where.push('paid_at <= :dateTo'); params.dateTo = dateTo; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT ${dateExpr} AS period, COALESCE(SUM(amount), 0) AS total FROM payments ${whereSql}
     GROUP BY period ORDER BY period ASC`,
    params
  );
  return rows;
}

/** Appointment (and completion) counts per doctor - workload report. */
async function getDoctorWorkload({ dateFrom, dateTo }) {
  const joinConditions = ['a.doctor_id = doc.id'];
  const params = {};
  if (dateFrom) { joinConditions.push('a.scheduled_at >= :dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo) { joinConditions.push('a.scheduled_at <= :dateTo'); params.dateTo = dateTo; }

  const [rows] = await pool.execute(
    `SELECT
       doc.id AS doctor_id, du.first_name, du.last_name, dep.name AS department_name,
       COUNT(a.id) AS total_appointments,
       SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
       SUM(CASE WHEN a.status = 'no_show' THEN 1 ELSE 0 END) AS no_shows
     FROM doctors doc
     JOIN users du ON du.id = doc.user_id
     LEFT JOIN departments dep ON dep.id = doc.department_id
     LEFT JOIN appointments a ON ${joinConditions.join(' AND ')}
     GROUP BY doc.id, du.first_name, du.last_name, dep.name
     ORDER BY total_appointments DESC`,
    params
  );
  return rows;
}

/** Lab test counts grouped by status and by test type. */
async function getLabStatistics({ dateFrom, dateTo }) {
  const where = [];
  const params = {};
  if (dateFrom) { where.push('requested_at >= :dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo) { where.push('requested_at <= :dateTo'); params.dateTo = dateTo; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [byStatus] = await pool.execute(
    `SELECT status, COUNT(*) AS count FROM laboratory_tests ${whereSql} GROUP BY status`,
    params
  );
  const [byType] = await pool.execute(
    `SELECT COALESCE(test_type, 'unspecified') AS test_type, COUNT(*) AS count
     FROM laboratory_tests ${whereSql} GROUP BY test_type ORDER BY count DESC`,
    params
  );
  return { byStatus, byType };
}

/** Current medicine stock levels for the inventory report. */
async function getMedicineInventoryReport() {
  const [rows] = await pool.execute(
    `SELECT m.id, m.name, m.unit, m.reorder_level, c.name AS category_name,
       COALESCE((SELECT SUM(ms.quantity) FROM medicine_stock ms WHERE ms.medicine_id = m.id AND ms.expiry_date >= CURDATE()), 0) AS current_stock
     FROM medicines m LEFT JOIN medicine_categories c ON c.id = m.category_id
     WHERE m.is_active = 1
     ORDER BY m.name ASC`
  );
  return rows;
}

module.exports = {
  getDashboardSummary,
  getPatientsOverTime,
  getAppointmentStats,
  getRevenueStats,
  getDoctorWorkload,
  getLabStatistics,
  getMedicineInventoryReport,
};
