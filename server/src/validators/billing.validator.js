// src/validators/billing.validator.js

const { body, param } = require('express-validator');

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid invoice id')];

const createInvoiceRules = [
  body('patientId').isInt({ min: 1 }).withMessage('patientId is required and must be a valid id'),
  body('appointmentId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('discount').optional().isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 }),
  body('dueDate').optional({ checkFalsy: true }).isISO8601(),
  body('items').isArray({ min: 1 }).withMessage('At least one invoice item is required'),
  body('items.*.description').trim().notEmpty().withMessage('Each item needs a description').isLength({ max: 255 }),
  body('items.*.itemType').optional().isIn(['consultation', 'medicine', 'lab_test', 'procedure', 'other']),
  body('items.*.referenceId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Each item needs a quantity of at least 1'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Each item needs a unitPrice of 0 or greater'),
];

const recordPaymentRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid invoice id'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be greater than 0'),
  body('paymentMethod').optional().isIn(['cash', 'card', 'bank_transfer', 'insurance', 'mobile_money']),
  body('referenceNumber').optional({ checkFalsy: true }).isLength({ max: 100 }),
];

module.exports = { idParamRule, createInvoiceRules, recordPaymentRules };
