// src/validators/pharmacy.validator.js

const { body, param, query } = require('express-validator');

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid medicine id')];
const categoryIdParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid category id')];
const stockIdParamRule = [
  param('id').isInt({ min: 1 }).withMessage('Invalid medicine id'),
  param('stockId').isInt({ min: 1 }).withMessage('Invalid stock batch id'),
];

const createMedicineRules = [
  body('name').trim().notEmpty().withMessage('Medicine name is required').isLength({ max: 200 }),
  body('categoryId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('genericName').optional({ checkFalsy: true }).isLength({ max: 200 }),
  body('manufacturer').optional({ checkFalsy: true }).isLength({ max: 150 }),
  body('unit').optional({ checkFalsy: true }).isLength({ max: 50 }),
  body('unitPrice').optional().isFloat({ min: 0 }).withMessage('unitPrice must be 0 or greater'),
  body('reorderLevel').optional().isInt({ min: 0 }).withMessage('reorderLevel must be 0 or greater'),
];

const updateMedicineRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid medicine id'),
  body('name').optional().trim().notEmpty().isLength({ max: 200 }),
  body('categoryId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('genericName').optional({ checkFalsy: true }).isLength({ max: 200 }),
  body('manufacturer').optional({ checkFalsy: true }).isLength({ max: 150 }),
  body('unit').optional({ checkFalsy: true }).isLength({ max: 50 }),
  body('unitPrice').optional().isFloat({ min: 0 }),
  body('reorderLevel').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean(),
];

const createCategoryRules = [
  body('name').trim().notEmpty().withMessage('Category name is required').isLength({ max: 100 }),
];

const updateCategoryRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid category id'),
  body('name').trim().notEmpty().withMessage('Category name is required').isLength({ max: 100 }),
];

const receiveStockRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid medicine id'),
  body('quantity').isInt({ min: 1 }).withMessage('quantity must be at least 1'),
  body('expiryDate').notEmpty().withMessage('expiryDate is required').isISO8601().withMessage('expiryDate must be a valid date')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('expiryDate must be in the future');
      }
      return true;
    }),
  body('batchNumber').optional({ checkFalsy: true }).isLength({ max: 100 }),
  body('supplier').optional({ checkFalsy: true }).isLength({ max: 150 }),
  body('receivedAt').optional({ checkFalsy: true }).isISO8601(),
];

const expiringSoonQueryRule = [
  query('withinDays').optional().isInt({ min: 1, max: 365 }).withMessage('withinDays must be between 1 and 365'),
];

module.exports = {
  idParamRule,
  categoryIdParamRule,
  stockIdParamRule,
  createMedicineRules,
  updateMedicineRules,
  createCategoryRules,
  updateCategoryRules,
  receiveStockRules,
  expiringSoonQueryRule,
};
