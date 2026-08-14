// src/validators/patient.validator.js

const { body, param } = require('express-validator');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];

const createPatientRules = [
  body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ max: 100 }),
  body('lastName').trim().notEmpty().withMessage('Last name is required').isLength({ max: 100 }),
  body('dateOfBirth').notEmpty().withMessage('Date of birth is required').isISO8601().withMessage('Date of birth must be a valid date (YYYY-MM-DD)').toDate(),
  body('gender').notEmpty().withMessage('Gender is required').isIn(['male', 'female', 'other']),
  body('bloodGroup').optional({ checkFalsy: true }).isIn(BLOOD_GROUPS).withMessage(`Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`),
  body('phone').optional({ checkFalsy: true }).isMobilePhone('any').withMessage('Enter a valid phone number'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('address').optional({ checkFalsy: true }).isLength({ max: 500 }),
  body('city').optional({ checkFalsy: true }).isLength({ max: 100 }),
  body('allergies').optional({ checkFalsy: true }).isLength({ max: 2000 }),
  body('chronicConditions').optional({ checkFalsy: true }).isLength({ max: 2000 }),
  body('emergencyContactName').optional({ checkFalsy: true }).isLength({ max: 150 }),
  body('emergencyContactPhone').optional({ checkFalsy: true }).isMobilePhone('any'),
  body('emergencyContactRelation').optional({ checkFalsy: true }).isLength({ max: 50 }),
  body('insuranceProvider').optional({ checkFalsy: true }).isLength({ max: 150 }),
  body('insurancePolicyNumber').optional({ checkFalsy: true }).isLength({ max: 100 }),
];

const updatePatientRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid patient id'),
  body('firstName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('lastName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('dateOfBirth').optional().isISO8601().withMessage('Date of birth must be a valid date (YYYY-MM-DD)'),
  body('gender').optional().isIn(['male', 'female', 'other']),
  body('bloodGroup').optional({ checkFalsy: true }).isIn(BLOOD_GROUPS),
  body('phone').optional({ checkFalsy: true }).isMobilePhone('any'),
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body('address').optional({ checkFalsy: true }).isLength({ max: 500 }),
  body('city').optional({ checkFalsy: true }).isLength({ max: 100 }),
  body('allergies').optional({ checkFalsy: true }).isLength({ max: 2000 }),
  body('chronicConditions').optional({ checkFalsy: true }).isLength({ max: 2000 }),
  body('emergencyContactName').optional({ checkFalsy: true }).isLength({ max: 150 }),
  body('emergencyContactPhone').optional({ checkFalsy: true }).isMobilePhone('any'),
  body('emergencyContactRelation').optional({ checkFalsy: true }).isLength({ max: 50 }),
  body('insuranceProvider').optional({ checkFalsy: true }).isLength({ max: 150 }),
  body('insurancePolicyNumber').optional({ checkFalsy: true }).isLength({ max: 100 }),
];

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid patient id')];

const grantPortalAccessRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid patient id'),
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter'),
];

module.exports = { createPatientRules, updatePatientRules, idParamRule, grantPortalAccessRules };
