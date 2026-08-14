// src/routes/patientPortal.routes.js
// Mounted at /api/v1/patient (singular - distinct from the staff-facing
// /api/v1/patients router). Every route here is restricted to the
// "patient" role, and every handler resolves "which patient" from the
// authenticated user's own identity - see the header comment in
// patientPortal.controller.js for the full security rationale.

const express = require('express');
const controller = require('../controllers/patientPortal.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { ROLES } = require('../utils/roles');
const {
  idParamRule,
  updateMyProfileRules,
  bookAppointmentRules,
  cancelAppointmentRules,
} = require('../validators/patientPortal.validator');

const router = express.Router();

router.use(authenticate, authorize(ROLES.PATIENT));

router.get('/profile', controller.getMyProfile);
router.patch('/profile', validate(updateMyProfileRules), controller.updateMyProfile);

router.get('/appointments', controller.listMyAppointments);
router.get('/appointments/available-slots', controller.getAvailableSlots);
router.post('/appointments', validate(bookAppointmentRules), controller.bookMyAppointment);
router.patch('/appointments/:id/cancel', validate(cancelAppointmentRules), controller.cancelMyAppointment);

router.get('/medical-records', controller.listMyMedicalRecords);
router.get('/medical-records/:id', validate(idParamRule), controller.getMyMedicalRecord);

router.get('/prescriptions', controller.listMyPrescriptions);
router.get('/prescriptions/:id', validate(idParamRule), controller.getMyPrescription);

router.get('/lab-results', controller.listMyLabResults);

module.exports = router;
