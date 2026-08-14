// src/middleware/rbac.middleware.js
// Role-Based Access Control. Use after `authenticate` on any route that
// should only be reachable by specific roles.
//
// Example:
//   router.get('/admin/users', authenticate, authorize(ROLES.ADMIN), ctrl.list);
//   router.get('/records/:id', authenticate, authorize(ROLES.DOCTOR, ROLES.NURSE), ctrl.get);

const ApiError = require('../utils/ApiError');

const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    // authenticate() should always run first; this is a safety net.
    return next(ApiError.unauthorized('Authentication required.'));
  }

  if (!allowedRoles.includes(req.user.role)) {
    return next(
      ApiError.forbidden(
        `Role "${req.user.role}" is not permitted to perform this action.`
      )
    );
  }

  next();
};

module.exports = authorize;
