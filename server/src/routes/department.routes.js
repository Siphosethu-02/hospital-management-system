// src/routes/department.routes.js

const express = require('express');
const controller = require('../controllers/department.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { ROLES } = require('../utils/roles');
const {
  createDepartmentRules,
  updateDepartmentRules,
  idParamRule,
  assignDoctorRules,
  unassignDoctorRules,
} = require('../validators/department.validator');

const router = express.Router();

// All department routes require login; read access is open to every
// staff role since departments are referenced all over the UI
// (appointment booking, doctor filters, reports, etc).
router.use(authenticate);

router.get('/', controller.listDepartments);
router.get('/all', controller.listAllActiveDepartments);
router.get('/:id', validate(idParamRule), controller.getDepartment);

// Mutations are admin-only.
router.post('/', authorize(ROLES.ADMIN), validate(createDepartmentRules), controller.createDepartment);
router.patch('/:id', authorize(ROLES.ADMIN), validate(updateDepartmentRules), controller.updateDepartment);
router.delete('/:id', authorize(ROLES.ADMIN), validate(idParamRule), controller.deleteDepartment);

// Doctor assignment - lets an admin add another doctor to an existing
// department (or remove one) without going through the doctor's own
// profile edit screen.
router.post('/:id/doctors', authorize(ROLES.ADMIN), validate(assignDoctorRules), controller.assignDoctor);
router.delete('/:id/doctors/:doctorId', authorize(ROLES.ADMIN), validate(unassignDoctorRules), controller.unassignDoctor);

module.exports = router;
