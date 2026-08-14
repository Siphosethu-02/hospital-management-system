// src/middleware/auth.middleware.js
// Verifies the Authorization: Bearer <token> header, checks that the
// token's tokenVersion still matches the user's current tokenVersion
// in the DB (so revoking/changing a password invalidates old tokens),
// and attaches the authenticated user to req.user.

const { verifyAccessToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const userModel = require('../models/user.model');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Authentication token missing. Please log in.');
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Access token expired. Please refresh your session.');
    }
    throw ApiError.unauthorized('Invalid access token.');
  }

  const user = await userModel.findById(decoded.id);

  if (!user || !user.is_active) {
    throw ApiError.unauthorized('Account not found or has been deactivated.');
  }

  // Invalidate tokens issued before a password change / forced logout.
  if (user.token_version !== decoded.tokenVersion) {
    throw ApiError.unauthorized('Session is no longer valid. Please log in again.');
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role_name,
    firstName: user.first_name,
    lastName: user.last_name,
  };

  next();
});

/**
 * Optional-auth variant: attaches req.user if a valid token is present,
 * but does not reject the request if it's missing. Useful for public
 * endpoints that behave slightly differently for logged-in users.
 */
const attachUserIfPresent = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next();
  }

  try {
    const decoded = verifyAccessToken(token);
    const user = await userModel.findById(decoded.id);
    if (user && user.is_active && user.token_version === decoded.tokenVersion) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role_name,
        firstName: user.first_name,
        lastName: user.last_name,
      };
    }
  } catch (err) {
    // Silently ignore - this endpoint doesn't require auth.
  }

  next();
});

module.exports = { authenticate, attachUserIfPresent };
