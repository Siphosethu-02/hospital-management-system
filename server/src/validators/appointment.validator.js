// src/validators/appointment.validator.js

const { body, param } = require('express-validator');

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid appointment id')];

// scheduledAt: .toDate() is required, not cosmetic. The booking screen
// sends back the exact ISO string (e.g. "2026-08-08T10:30:00.000Z")
// that the available-slots endpoint generated. Left as a plain string,
// that value gets bound as-is to the `scheduled_at` DATETIME column -
// but MySQL's DATETIME literal parser rejects the 'T'/'Z' ISO format
// outright ("Incorrect datetime value"). .toDate() converts it to a
// real JS Date object during validation, which mysql2 serializes
// correctly for DATETIME columns. This also fixes every other place in
// the controller that reads req.body.scheduledAt afterwards (the
// conflict check, the audit log, the notification), since they all
// receive the same already-converted value.
const createAppointmentRules = [
  body('patientId').isInt({ min: 1 }).withMessage('patientId is required and must be a valid id'),
  body('doctorId').isInt({ min: 1 }).withMessage('doctorId is required and must be a valid id'),
  body('departmentId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('scheduledAt').notEmpty().withMessage('scheduledAt is required').isISO8601().withMessage('scheduledAt must be a valid ISO 8601 datetime').toDate(),
  body('durationMinutes').optional().isInt({ min: 5, max: 480 }).withMessage('durationMinutes must be between 5 and 480'),
  body('reason').optional({ checkFalsy: true }).isLength({ max: 500 }),
];

const rescheduleAppointmentRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  body('scheduledAt').notEmpty().withMessage('scheduledAt is required').isISO8601().withMessage('scheduledAt must be a valid ISO 8601 datetime').toDate(),
  body('durationMinutes').optional().isInt({ min: 5, max: 480 }),
];

const cancelAppointmentRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  body('cancellationReason').optional({ checkFalsy: true }).isLength({ max: 500 }),
];

const updateStatusRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  body('status')
    .notEmpty().withMessage('status is required')
    .isIn(['scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'])
    .withMessage('Invalid status value'),
];

const availableSlotsQueryRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid doctor id'),
];

module.exports = {
  idParamRule,
  createAppointmentRules,
  rescheduleAppointmentRules,
  cancelAppointmentRules,
  updateStatusRules,
  availableSlotsQueryRules,
};
