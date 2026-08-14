// src/routes/auth.routes.js

const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { ROLES } = require('../utils/roles');
const {
  loginRules,
  registerRules,
  changePasswordRules,
} = require('../validators/auth.validator');
const env = require('../config/env');

const router = express.Router();

// Tighter rate limit on auth endpoints to slow down credential stuffing /
// brute-force attempts.
const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

// Public
router.post('/login', authLimiter, validate(loginRules), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

// Staff account creation is an admin-only, authenticated action - there
// is no public sign-up page for a hospital system.
router.post(
  '/register',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(registerRules),
  authController.register
);

// Authenticated
router.get('/me', authenticate, authController.getMe);
router.post('/logout-all', authenticate, authController.logoutAll);
router.patch(
  '/change-password',
  authenticate,
  validate(changePasswordRules),
  authController.changePassword
);

module.exports = router;
