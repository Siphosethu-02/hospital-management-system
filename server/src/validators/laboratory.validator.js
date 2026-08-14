// src/validators/laboratory.validator.js

const { body, param } = require('express-validator');

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid lab test id')];

const createTestRules = [
  body('patientId').isInt({ min: 1 }).withMessage('patientId is required and must be a valid id'),
  body('medicalRecordId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('testName').trim().notEmpty().withMessage('testName is required').isLength({ max: 200 }),
  body('testType').optional({ checkFalsy: true }).isLength({ max: 100 }),
  body('priority').optional().isIn(['routine', 'urgent', 'stat']).withMessage('priority must be routine, urgent, or stat'),
  body('notes').optional({ checkFalsy: true }).isLength({ max: 2000 }),
];

const updateStatusRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid lab test id'),
  body('status')
    .notEmpty().withMessage('status is required')
    .isIn(['requested', 'sample_collected', 'in_progress', 'completed', 'cancelled'])
    .withMessage('Invalid status value'),
];

const uploadResultRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid lab test id'),
  body('resultSummary').optional({ checkFalsy: true }).isLength({ max: 5000 }),
  body('resultData').optional().custom((value) => {
    if (value === undefined || value === '' || value === null) return true;
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (typeof parsed !== 'object') throw new Error();
      return true;
    } catch {
      throw new Error('resultData must be valid JSON');
    }
  }),
];

module.exports = { idParamRule, createTestRules, updateStatusRules, uploadResultRules };
