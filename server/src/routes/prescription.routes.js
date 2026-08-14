// src/routes/prescription.routes.js

const express = require('express');
const controller = require('../controllers/prescription.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { ROLES } = require('../utils/roles');
const { idParamRule, itemIdParamRule, createPrescriptionRules } = require('../validators/prescription.validator');

const router = express.Router();

router.use(authenticate);

// Read: admin, doctor (own, via controller), nurse, pharmacist (to dispense).
router.get(
  '/',
  authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.PHARMACIST),
  controller.listPrescriptions
);
router.get(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.PHARMACIST),
  validate(idParamRule),
  controller.getPrescription
);

// Write: doctor or admin.
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.DOCTOR),
  validate(createPrescriptionRules),
  controller.createPrescription
);
router.patch(
  '/:id/cancel',
  authorize(ROLES.ADMIN, ROLES.DOCTOR),
  validate(idParamRule),
  controller.cancelPrescription
);

// Dispensing: pharmacist or admin.
router.patch(
  '/:id/items/:itemId/dispense',
  authorize(ROLES.ADMIN, ROLES.PHARMACIST),
  validate([...idParamRule, ...itemIdParamRule]),
  controller.dispenseItem
);

module.exports = router;
