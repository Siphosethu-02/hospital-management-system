// src/validators/vitals.validator.js

const { body, param } = require('express-validator');

const patientIdParamRule = [param('patientId').isInt({ min: 1 }).withMessage('Invalid patient id')];

const createVitalsRules = [
  body('patientId').isInt({ min: 1 }).withMessage('patientId is required and must be a valid id'),
  body('appointmentId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('temperatureCelsius').optional({ checkFalsy: true }).isFloat({ min: 25, max: 45 }).withMessage('temperatureCelsius must be between 25 and 45'),
  body('heartRateBpm').optional({ checkFalsy: true }).isInt({ min: 20, max: 300 }),
  body('bloodPressureSystolic').optional({ checkFalsy: true }).isInt({ min: 40, max: 300 }),
  body('bloodPressureDiastolic').optional({ checkFalsy: true }).isInt({ min: 20, max: 200 }),
  body('respiratoryRate').optional({ checkFalsy: true }).isInt({ min: 5, max: 100 }),
  body('oxygenSaturation').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }),
  body('weightKg').optional({ checkFalsy: true }).isFloat({ min: 0, max: 500 }),
  body('heightCm').optional({ checkFalsy: true }).isFloat({ min: 0, max: 300 }),
  body('notes').optional({ checkFalsy: true }).isLength({ max: 2000 }),
];

module.exports = { patientIdParamRule, createVitalsRules };
