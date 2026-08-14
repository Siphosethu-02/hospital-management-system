// src/validators/doctor.validator.js

const { body, param } = require('express-validator');

const ALLOWED_SLOT_MINUTES = [15, 20, 30, 45, 60];
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid doctor id')];

const availabilityIdParamRule = [
  param('id').isInt({ min: 1 }).withMessage('Invalid doctor id'),
  param('availabilityId').isInt({ min: 1 }).withMessage('Invalid availability id'),
];

const createAvailabilityRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid doctor id'),
  body('dayOfWeek').isInt({ min: 0, max: 6 }).withMessage('dayOfWeek must be 0 (Sunday) through 6 (Saturday)'),
  body('startTime').matches(TIME_REGEX).withMessage('startTime must be in HH:MM format'),
  body('endTime').matches(TIME_REGEX).withMessage('endTime must be in HH:MM format')
    .custom((value, { req }) => {
      if (value <= req.body.startTime) {
        throw new Error('endTime must be after startTime');
      }
      return true;
    }),
  body('slotMinutes').optional().isIn(ALLOWED_SLOT_MINUTES).withMessage(`slotMinutes must be one of: ${ALLOWED_SLOT_MINUTES.join(', ')}`),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false'),
];

// Same shape as create, but every field is optional so the caller can
// PATCH just the one thing that changed (e.g. only toggling isActive).
const updateAvailabilityRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid doctor id'),
  param('availabilityId').isInt({ min: 1 }).withMessage('Invalid availability id'),
  body('dayOfWeek').optional().isInt({ min: 0, max: 6 }).withMessage('dayOfWeek must be 0 (Sunday) through 6 (Saturday)'),
  body('startTime').optional().matches(TIME_REGEX).withMessage('startTime must be in HH:MM format'),
  body('endTime').optional().matches(TIME_REGEX).withMessage('endTime must be in HH:MM format')
    .custom((value, { req }) => {
      if (req.body.startTime && value <= req.body.startTime) {
        throw new Error('endTime must be after startTime');
      }
      return true;
    }),
  body('slotMinutes').optional().isIn(ALLOWED_SLOT_MINUTES).withMessage(`slotMinutes must be one of: ${ALLOWED_SLOT_MINUTES.join(', ')}`),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false'),
];

module.exports = {
  idParamRule,
  availabilityIdParamRule,
  createAvailabilityRules,
  updateAvailabilityRules,
  ALLOWED_SLOT_MINUTES,
};
