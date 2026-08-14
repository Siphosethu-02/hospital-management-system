// src/routes/laboratory.routes.js

const express = require('express');
const controller = require('../controllers/laboratory.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { uploadLabReport } = require('../middleware/upload.middleware');
const { ROLES } = require('../utils/roles');
const {
  idParamRule,
  createTestRules,
  updateStatusRules,
  uploadResultRules,
} = require('../validators/laboratory.validator');

const router = express.Router();

router.use(authenticate);

// Read: admin, doctor (own via controller), lab staff, nurse (assisting).
router.get('/tests', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.LAB_STAFF, ROLES.NURSE), controller.listTests);
router.get('/tests/:id', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.LAB_STAFF, ROLES.NURSE), validate(idParamRule), controller.getTest);

// Request: doctor or admin.
router.post('/tests', authorize(ROLES.ADMIN, ROLES.DOCTOR), validate(createTestRules), controller.createTest);

// Processing: lab staff or admin.
router.patch(
  '/tests/:id/status',
  authorize(ROLES.ADMIN, ROLES.LAB_STAFF),
  validate(updateStatusRules),
  controller.updateStatus
);
router.post(
  '/tests/:id/result',
  authorize(ROLES.ADMIN, ROLES.LAB_STAFF),
  uploadLabReport,
  validate(uploadResultRules),
  controller.uploadResult
);

// Review: the requesting doctor, or admin.
router.patch(
  '/tests/:id/review',
  authorize(ROLES.ADMIN, ROLES.DOCTOR),
  validate(idParamRule),
  controller.reviewResult
);

module.exports = router;
