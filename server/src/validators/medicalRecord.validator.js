// src/validators/medicalRecord.validator.js

const { body, param } = require('express-validator');

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid medical record id')];

const createMedicalRecordRules = [
  body('patientId').isInt({ min: 1 }).withMessage('patientId is required and must be a valid id'),
  body('appointmentId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('diagnosis').trim().notEmpty().withMessage('Diagnosis is required').isLength({ max: 5000 }),
  body('symptoms').optional({ checkFalsy: true }).isLength({ max: 5000 }),
  body('treatmentPlan').optional({ checkFalsy: true }).isLength({ max: 5000 }),
  body('doctorNotes').optional({ checkFalsy: true }).isLength({ max: 5000 }),
  body('followUpDate').optional({ checkFalsy: true }).isISO8601().withMessage('followUpDate must be a valid date'),
];

const updateMedicalRecordRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid medical record id'),
  body('diagnosis').optional().trim().notEmpty().isLength({ max: 5000 }),
  body('symptoms').optional({ checkFalsy: true }).isLength({ max: 5000 }),
  body('treatmentPlan').optional({ checkFalsy: true }).isLength({ max: 5000 }),
  body('doctorNotes').optional({ checkFalsy: true }).isLength({ max: 5000 }),
  body('followUpDate').optional({ checkFalsy: true }).isISO8601(),
];

const attachmentIdParamRule = [
  param('id').isInt({ min: 1 }).withMessage('Invalid medical record id'),
  param('attachmentId').isInt({ min: 1 }).withMessage('Invalid attachment id'),
];

module.exports = { idParamRule, createMedicalRecordRules, updateMedicalRecordRules, attachmentIdParamRule };
