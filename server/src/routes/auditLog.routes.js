// src/routes/auditLog.routes.js

const express = require('express');
const controller = require('../controllers/auditLog.controller');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));
router.get('/', controller.listAuditLogs);

module.exports = router;
