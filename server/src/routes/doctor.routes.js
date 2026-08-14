// src/routes/doctor.routes.js

const express = require('express');
const controller = require('../controllers/doctor.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { ROLES } = require('../utils/roles');
const {
  idParamRule,
  availabilityIdParamRule,
  createAvailabilityRules,
  updateAvailabilityRules,
} = require('../validators/doctor.validator');

const router = express.Router();

router.use(authenticate);

// Directory: readable by every staff role (booking, referrals, directory page).
router.get('/', controller.listDoctors);
router.get('/:id', validate(idParamRule), controller.getDoctor);
router.get('/:id/available-slots', validate(idParamRule), controller.getAvailableSlots);
router.get('/:id/availability', validate(idParamRule), controller.getAvailability);

// Availability management: admin, or the doctor managing their own schedule
// (ownership is checked in the controller since it depends on req.user).
router.post(
  '/:id/availability',
  authorize(ROLES.ADMIN, ROLES.DOCTOR),
  validate(createAvailabilityRules),
  controller.addAvailability
);
router.patch(
  '/:id/availability/:availabilityId',
  authorize(ROLES.ADMIN, ROLES.DOCTOR),
  validate(updateAvailabilityRules),
  controller.updateAvailability
);
router.delete(
  '/:id/availability/:availabilityId',
  authorize(ROLES.ADMIN, ROLES.DOCTOR),
  validate(availabilityIdParamRule),
  controller.removeAvailability
);

module.exports = router;
