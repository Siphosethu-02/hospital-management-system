// src/routes/vitals.routes.js

const express = require('express');
const controller = require('../controllers/vitals.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { ROLES } = require('../utils/roles');
const { patientIdParamRule, createVitalsRules } = require('../validators/vitals.validator');

const router = express.Router();

router.use(authenticate);

router.get(
  '/patient/:patientId',
  authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE),
  validate(patientIdParamRule),
  controller.listPatientVitals
);

router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.NURSE),
  validate(createVitalsRules),
  controller.recordVitals
);

module.exports = router;
