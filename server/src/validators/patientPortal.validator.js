// src/validators/patientPortal.validator.js

const { body, param } = require('express-validator');

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid id')];

const updateMyProfileRules = [
  body('phone').optional({ checkFalsy: true }).isMobilePhone('any').withMessage('Enter a valid phone number'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('address').optional({ checkFalsy: true }).isLength({ max: 500 }),
  body('city').optional({ checkFalsy: true }).isLength({ max: 100 }),
  body('emergencyContactName').optional({ checkFalsy: true }).isLength({ max: 150 }),
  body('emergencyContactPhone').optional({ checkFalsy: true }).isMobilePhone('any'),
  body('emergencyContactRelation').optional({ checkFalsy: true }).isLength({ max: 50 }),
];

const bookAppointmentRules = [
  body('doctorId').isInt({ min: 1 }).withMessage('doctorId is required and must be a valid id'),
  body('scheduledAt')
    .notEmpty().withMessage('scheduledAt is required')
    .isISO8601().withMessage('scheduledAt must be a valid ISO 8601 datetime')
    .custom((value) => {
      if (new Date(value).getTime() <= Date.now()) {
        throw new Error('scheduledAt must be in the future');
      }
      return true;
    })
    .toDate(),
  body('reason').optional({ checkFalsy: true }).isLength({ max: 500 }),
];

const cancelAppointmentRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  body('cancellationReason').optional({ checkFalsy: true }).isLength({ max: 500 }),
];

module.exports = {
  idParamRule,
  updateMyProfileRules,
  bookAppointmentRules,
  cancelAppointmentRules,
};
