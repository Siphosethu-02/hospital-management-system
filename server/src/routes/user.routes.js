// src/routes/user.routes.js

const express = require('express');
const controller = require('../controllers/user.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { uploadAvatar } = require('../middleware/upload.middleware');
const { ROLES } = require('../utils/roles');
const { idParamRule, updateUserRules, updateOwnProfileRules } = require('../validators/user.validator');

const router = express.Router();

router.use(authenticate);

// Self-service (any authenticated role) - must come before /:id routes.
router.patch('/me', validate(updateOwnProfileRules), controller.updateOwnProfile);
router.post('/me/avatar', uploadAvatar, controller.uploadOwnAvatar);

// Admin-only "Manage Users" screen.
router.get('/', authorize(ROLES.ADMIN), controller.listUsers);
router.get('/:id', authorize(ROLES.ADMIN), validate(idParamRule), controller.getUser);
router.patch('/:id', authorize(ROLES.ADMIN), validate(updateUserRules), controller.updateUser);
router.patch('/:id/deactivate', authorize(ROLES.ADMIN), validate(idParamRule), controller.deactivateUser);
router.patch('/:id/activate', authorize(ROLES.ADMIN), validate(idParamRule), controller.activateUser);
router.delete('/:id', authorize(ROLES.ADMIN), validate(idParamRule), controller.deleteUser);

module.exports = router;
