// src/routes/medicalRecord.routes.js

const express = require('express');
const controller = require('../controllers/medicalRecord.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { uploadDocument } = require('../middleware/upload.middleware');
const { ROLES } = require('../utils/roles');
const {
  idParamRule,
  createMedicalRecordRules,
  updateMedicalRecordRules,
  attachmentIdParamRule,
} = require('../validators/medicalRecord.validator');

const router = express.Router();

router.use(authenticate);

// Read: admin, doctor (own records via controller), nurse (patient history).
router.get('/', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE), controller.listMedicalRecords);
router.get('/:id', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE), validate(idParamRule), controller.getMedicalRecord);

// Write: doctor or admin.
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.DOCTOR),
  validate(createMedicalRecordRules),
  controller.createMedicalRecord
);
router.patch(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.DOCTOR),
  validate(updateMedicalRecordRules),
  controller.updateMedicalRecord
);

// Attachments (lab reports, scans, referral letters, ...).
router.post(
  '/:id/attachments',
  authorize(ROLES.ADMIN, ROLES.DOCTOR),
  validate(idParamRule),
  uploadDocument,
  controller.addAttachment
);
router.delete(
  '/:id/attachments/:attachmentId',
  authorize(ROLES.ADMIN, ROLES.DOCTOR),
  validate(attachmentIdParamRule),
  controller.removeAttachment
);

module.exports = router;
