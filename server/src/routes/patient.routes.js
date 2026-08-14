// src/routes/patient.routes.js

const express = require('express');
const controller = require('../controllers/patient.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { uploadPatientImage } = require('../middleware/upload.middleware');
const { ROLES, STAFF_ROLES } = require('../utils/roles');
const {
  createPatientRules,
  updatePatientRules,
  idParamRule,
  grantPortalAccessRules,
} = require('../validators/patient.validator');

const router = express.Router();

router.use(authenticate);

// Read access: every clinical/operational STAFF role needs to be able to
// look a patient up (doctors, nurses, pharmacists dispensing meds, lab
// staff attaching results, receptionists at the front desk, admins).
// Deliberately excludes the "patient" role - a patient must never be
// able to list or look up other patients' records through this router.
// Patients read their OWN record through the separate, self-scoped
// /patient/profile endpoint (patientPortal.routes.js) instead.
router.get('/', authorize(...STAFF_ROLES), controller.listPatients);
router.get('/code/:code', authorize(...STAFF_ROLES), controller.getPatientByCode);
router.get('/:id', authorize(...STAFF_ROLES), validate(idParamRule), controller.getPatient);

// Registration and demographic edits: front-desk workflow.
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.RECEPTIONIST),
  validate(createPatientRules),
  controller.createPatient
);
router.patch(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.RECEPTIONIST),
  validate(updatePatientRules),
  controller.updatePatient
);
router.post(
  '/:id/image',
  authorize(ROLES.ADMIN, ROLES.RECEPTIONIST),
  validate(idParamRule),
  uploadPatientImage,
  controller.uploadPatientImage
);

// Activation state: admin only.
router.patch('/:id/deactivate', authorize(ROLES.ADMIN), validate(idParamRule), controller.deactivatePatient);
router.patch('/:id/activate', authorize(ROLES.ADMIN), validate(idParamRule), controller.activatePatient);
router.delete('/:id', authorize(ROLES.ADMIN), validate(idParamRule), controller.deletePatient);

// Portal access: admin or receptionist grants an existing patient a
// login to the patient portal.
router.post(
  '/:id/portal-access',
  authorize(ROLES.ADMIN, ROLES.RECEPTIONIST),
  validate(grantPortalAccessRules),
  controller.grantPortalAccess
);

module.exports = router;
