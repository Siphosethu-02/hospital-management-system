// src/middleware/validate.middleware.js
// Runs an array of express-validator validation chains, then checks the
// result. On failure, throws a single ApiError(400) with a field-level
// `errors` array so the frontend can highlight individual form fields.

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * @param {import('express-validator').ValidationChain[]} validations
 */
const validate = (validations) => async (req, res, next) => {
  await Promise.all(validations.map((validation) => validation.run(req)));

  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  const errors = result.array().map((e) => ({
    field: e.path,
    message: e.msg,
  }));

  next(ApiError.badRequest('Validation failed', errors));
};

module.exports = validate;
