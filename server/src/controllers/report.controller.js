// src/controllers/report.controller.js
// Admin dashboard analytics (JSON, for Chart.js) and exportable PDF
// reports built from the same aggregate queries.

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const reportModel = require('../models/report.model');
const patientModel = require('../models/patient.model');
const doctorModel = require('../models/doctor.model');
const appointmentModel = require('../models/appointment.model');
const { streamTableReportPdf } = require('../utils/pdf');

function dateRangeFromQuery(query) {
  return { dateFrom: query.dateFrom || undefined, dateTo: query.dateTo || undefined };
}

/** GET /reports/dashboard - summary cards + chart-ready series for the admin dashboard */
const getDashboard = asyncHandler(async (req, res) => {
  const range = dateRangeFromQuery(req.query);

  const [summary, patientsOverTime, appointmentStats, revenueStats, doctorWorkload, labStats] = await Promise.all([
    reportModel.getDashboardSummary(),
    reportModel.getPatientsOverTime({ groupBy: req.query.groupBy || 'day', ...range }),
    reportModel.getAppointmentStats(range),
    reportModel.getRevenueStats({ groupBy: req.query.groupBy || 'day', ...range }),
    reportModel.getDoctorWorkload(range),
    reportModel.getLabStatistics(range),
  ]);

  new ApiResponse(200, 'Dashboard analytics retrieved', {
    summary, patientsOverTime, appointmentStats, revenueStats, doctorWorkload, labStats,
  }).send(res);
});

/** GET /reports/patients/pdf */
const exportPatientsPdf = asyncHandler(async (req, res) => {
  const { rows } = await patientModel.list({
    search: req.query.search, isActive: true, sortBy: 'created_at', order: 'DESC', limit: 1000, offset: 0,
  });

  streamTableReportPdf(res, {
    title: 'Patients Report',
    filename: 'patients-report',
    columns: ['Code', 'Name', 'Gender', 'Phone', 'City', 'Registered'],
    keys: ['patient_code', '_name', 'gender', 'phone', 'city', 'created_at'],
    rows: rows.map((r) => ({ ...r, _name: `${r.first_name} ${r.last_name}` })),
  });
});

/** GET /reports/doctors/pdf - doctor workload report */
const exportDoctorsPdf = asyncHandler(async (req, res) => {
  const rows = await reportModel.getDoctorWorkload(dateRangeFromQuery(req.query));

  streamTableReportPdf(res, {
    title: 'Doctor Workload Report',
    filename: 'doctor-workload-report',
    columns: ['Doctor', 'Department', 'Total', 'Completed', 'Cancelled', 'No-shows'],
    keys: ['_name', 'department_name', 'total_appointments', 'completed', 'cancelled', 'no_shows'],
    rows: rows.map((r) => ({ ...r, _name: `Dr. ${r.first_name} ${r.last_name}` })),
  });
});

/** GET /reports/appointments/pdf */
const exportAppointmentsPdf = asyncHandler(async (req, res) => {
  const { rows } = await appointmentModel.list({
    dateFrom: req.query.dateFrom, dateTo: req.query.dateTo,
    sortBy: 'scheduled_at', order: 'ASC', limit: 1000, offset: 0,
  });

  streamTableReportPdf(res, {
    title: 'Appointments Report',
    filename: 'appointments-report',
    columns: ['Date/Time', 'Patient', 'Doctor', 'Status'],
    keys: ['scheduled_at', '_patient', '_doctor', 'status'],
    rows: rows.map((r) => ({
      ...r,
      _patient: `${r.patient_first_name} ${r.patient_last_name}`,
      _doctor: `Dr. ${r.doctor_first_name} ${r.doctor_last_name}`,
    })),
  });
});

/** GET /reports/revenue/pdf */
const exportRevenuePdf = asyncHandler(async (req, res) => {
  const rows = await reportModel.getRevenueStats({ groupBy: req.query.groupBy || 'day', ...dateRangeFromQuery(req.query) });

  streamTableReportPdf(res, {
    title: 'Revenue Report',
    filename: 'revenue-report',
    columns: ['Period', 'Total Revenue'],
    keys: ['period', 'total'],
    rows,
  });
});

/** GET /reports/medicine-inventory/pdf */
const exportMedicineInventoryPdf = asyncHandler(async (req, res) => {
  const rows = await reportModel.getMedicineInventoryReport();

  streamTableReportPdf(res, {
    title: 'Medicine Inventory Report',
    filename: 'medicine-inventory-report',
    columns: ['Medicine', 'Category', 'Unit', 'Current Stock', 'Reorder Level'],
    keys: ['name', 'category_name', 'unit', 'current_stock', 'reorder_level'],
    rows,
  });
});

/** GET /reports/laboratory/pdf */
const exportLaboratoryPdf = asyncHandler(async (req, res) => {
  const { byType } = await reportModel.getLabStatistics(dateRangeFromQuery(req.query));

  streamTableReportPdf(res, {
    title: 'Laboratory Statistics Report',
    filename: 'laboratory-report',
    columns: ['Test Type', 'Count'],
    keys: ['test_type', 'count'],
    rows: byType,
  });
});

module.exports = {
  getDashboard,
  exportPatientsPdf,
  exportDoctorsPdf,
  exportAppointmentsPdf,
  exportRevenuePdf,
  exportMedicineInventoryPdf,
  exportLaboratoryPdf,
};
