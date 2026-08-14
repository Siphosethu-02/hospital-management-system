// src/validators/prescription.validator.js

const { body, param } = require('express-validator');

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid prescription id')];

const itemIdParamRule = [param('itemId').isInt({ min: 1 }).withMessage('Invalid prescription item id')];

const createPrescriptionRules = [
  body('patientId').isInt({ min: 1 }).withMessage('patientId is required and must be a valid id'),
  body('medicalRecordId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('notes').optional({ checkFalsy: true }).isLength({ max: 2000 }),
  body('items').isArray({ min: 1 }).withMessage('At least one prescription item is required'),
  body('items.*.medicineId').isInt({ min: 1 }).withMessage('Each item needs a valid medicineId'),
  body('items.*.dosage').trim().notEmpty().withMessage('Each item needs a dosage, e.g. "500mg"').isLength({ max: 100 }),
  body('items.*.frequency').trim().notEmpty().withMessage('Each item needs a frequency, e.g. "twice a day"').isLength({ max: 100 }),
  body('items.*.durationDays').optional({ checkFalsy: true }).isInt({ min: 1, max: 365 }),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Each item needs a quantity of at least 1'),
  body('items.*.instructions').optional({ checkFalsy: true }).isLength({ max: 500 }),
];

module.exports = { idParamRule, itemIdParamRule, createPrescriptionRules };
