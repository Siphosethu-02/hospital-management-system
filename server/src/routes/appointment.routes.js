// src/routes/appointment.routes.js

const express = require('express');
const controller = require('../controllers/appointment.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { ROLES } = require('../utils/roles');
const {
  idParamRule,
  createAppointmentRules,
  rescheduleAppointmentRules,
  cancelAppointmentRules,
  updateStatusRules,
} = require('../validators/appointment.validator');

const router = express.Router();

router.use(authenticate);

// Read access: admin, receptionist, nurse (assisting), and doctors
// (auto-scoped to their own appointments in the controller).
router.get(
  '/',
  authorize(ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.NURSE, ROLES.DOCTOR),
  controller.listAppointments
);
router.get(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.NURSE, ROLES.DOCTOR),
  validate(idParamRule),
  controller.getAppointment
);

// Booking workflow: front desk.
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.RECEPTIONIST),
  validate(createAppointmentRules),
  controller.createAppointment
);
router.patch(
  '/:id/reschedule',
  authorize(ROLES.ADMIN, ROLES.RECEPTIONIST),
  validate(rescheduleAppointmentRules),
  controller.rescheduleAppointment
);
router.patch(
  '/:id/cancel',
  authorize(ROLES.ADMIN, ROLES.RECEPTIONIST),
  validate(cancelAppointmentRules),
  controller.cancelAppointment
);

// Status transitions: front desk / nurse check the patient in, the
// assigned doctor marks the visit completed or a no-show.
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.NURSE, ROLES.DOCTOR),
  validate(updateStatusRules),
  controller.updateAppointmentStatus
);

module.exports = router;
