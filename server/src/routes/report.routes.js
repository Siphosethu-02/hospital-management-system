// src/routes/report.routes.js
// Dashboard analytics + PDF report exports. Admin-only, per the spec's
// "Dashboard Analytics" / "Generate Reports" administrator capabilities.

const express = require('express');
const controller = require('../controllers/report.controller');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/dashboard', controller.getDashboard);
router.get('/patients/pdf', controller.exportPatientsPdf);
router.get('/doctors/pdf', controller.exportDoctorsPdf);
router.get('/appointments/pdf', controller.exportAppointmentsPdf);
router.get('/revenue/pdf', controller.exportRevenuePdf);
router.get('/medicine-inventory/pdf', controller.exportMedicineInventoryPdf);
router.get('/laboratory/pdf', controller.exportLaboratoryPdf);

module.exports = router;
