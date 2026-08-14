// src/validators/department.validator.js

const { body, param } = require('express-validator');

// A department must have at least one doctor from the moment it's
// created - doctorIds is required (not optional) specifically so a
// department can never be created with zero doctors going forward.
// (Departments that already existed before this rule was added, or
// whose only doctor was later reassigned elsewhere, can still end up
// at zero - see department.controller.js's "doctor_count" flag on the
// list/detail response, which surfaces that as a visible warning
// rather than silently blocking every subsequent action on them.)
const createDepartmentRules = [
  body('name').trim().notEmpty().withMessage('Department name is required').isLength({ max: 100 }),
  body('description').optional({ checkFalsy: true }).isLength({ max: 2000 }),
  body('headDoctorId').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('headDoctorId must be a positive integer'),
  body('doctorIds')
    .isArray({ min: 1 }).withMessage('Select at least one doctor for this department'),
  body('doctorIds.*').isInt({ min: 1 }).withMessage('Each doctorIds entry must be a valid doctor id'),
];

const updateDepartmentRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid department id'),
  body('name').optional().trim().notEmpty().withMessage('Department name cannot be empty').isLength({ max: 100 }),
  body('description').optional({ checkFalsy: true }).isLength({ max: 2000 }),
  body('headDoctorId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('isActive').optional().isBoolean(),
];

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid department id')];

const assignDoctorRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid department id'),
  body('doctorId').isInt({ min: 1 }).withMessage('doctorId is required and must be a valid id'),
];

const unassignDoctorRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid department id'),
  param('doctorId').isInt({ min: 1 }).withMessage('Invalid doctor id'),
];

module.exports = {
  createDepartmentRules,
  updateDepartmentRules,
  idParamRule,
  assignDoctorRules,
  unassignDoctorRules,
};
