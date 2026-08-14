// src/validators/user.validator.js

const { body, param } = require('express-validator');
const { STAFF_ROLES } = require('../utils/roles');

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid user id')];

const updateUserRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid user id'),
  body('firstName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('lastName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('phone').optional({ checkFalsy: true }).isMobilePhone('any').withMessage('Enter a valid phone number'),
  body('role').optional().isIn(STAFF_ROLES).withMessage(`Role must be one of: ${STAFF_ROLES.join(', ')}`),
  body('isActive').optional().isBoolean(),
  // Nested doctor-profile fields, only applied when role is/becomes "doctor"
  body('doctorProfile').optional().isObject(),
  body('doctorProfile.departmentId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('doctorProfile.specialization').optional({ checkFalsy: true }).isLength({ max: 150 }),
  body('doctorProfile.qualification').optional({ checkFalsy: true }).isLength({ max: 255 }),
  body('doctorProfile.licenseNumber').optional({ checkFalsy: true }).isLength({ max: 100 }),
  body('doctorProfile.yearsOfExperience').optional({ checkFalsy: true }).isInt({ min: 0, max: 80 }),
  body('doctorProfile.consultationFee').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('doctorProfile.bio').optional({ checkFalsy: true }).isLength({ max: 2000 }),
  body('doctorProfile.roomNumber').optional({ checkFalsy: true }).isLength({ max: 20 }),
];

const updateOwnProfileRules = [
  body('firstName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('lastName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('phone').optional({ checkFalsy: true }).isMobilePhone('any').withMessage('Enter a valid phone number'),
];

module.exports = { idParamRule, updateUserRules, updateOwnProfileRules };
