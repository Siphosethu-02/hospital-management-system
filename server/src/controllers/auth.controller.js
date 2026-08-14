// src/controllers/auth.controller.js
// Handles registration (admin-only, since staff accounts are provisioned
// internally), login, silent token refresh, logout, current-user lookup,
// and password change.

const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const userModel = require('../models/user.model');
const doctorModel = require('../models/doctor.model');
const patientModel = require('../models/patient.model');
const { logAction } = require('../utils/audit');
const { ROLES } = require('../utils/roles');
const env = require('../config/env');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwt');

const REFRESH_COOKIE_NAME = 'hms_refresh_token';

function refreshCookieOptions(rememberMe) {
  const maxAgeMs = rememberMe
    ? 30 * 24 * 60 * 60 * 1000 // 30 days
    : 7 * 24 * 60 * 60 * 1000; // 7 days

  return {
    httpOnly: true,
    secure: env.cookie.secure,
    // 'none' is required for the cookie to be sent on cross-SITE
    // requests (e.g. a Vercel-hosted frontend calling a Render/Railway
    // API on a different domain) - but SameSite=None is only valid on
    // an HTTPS-served cookie, so it's tied to the same secure flag
    // rather than a separate setting: in local Docker dev (COOKIE_SECURE
    // unset/false, everything on localhost) 'lax' still works fine and
    // is the safer default; in a real cross-domain deployment
    // (COOKIE_SECURE=true) 'lax' would silently break refresh/login
    // persistence, since browsers don't send Lax cookies on cross-site
    // fetch/XHR calls.
    sameSite: env.cookie.secure ? 'none' : 'lax',
    maxAge: maxAgeMs,
    path: `${env.apiPrefix}/auth`,
  };
}

function sanitizeUser(user) {
  const { password_hash, token_version, role_id, ...safe } = user;
  return safe;
}

async function issueTokens(res, user, rememberMe) {
  const accessToken = signAccessToken({
    id: user.id,
    role: user.role_name,
    tokenVersion: user.token_version,
  });

  const refreshToken = signRefreshToken(
    { id: user.id, tokenVersion: user.token_version },
    rememberMe
  );

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(rememberMe));
  return accessToken;
}

/**
 * POST /auth/register
 * Admin-only: provisions a new staff account (doctor, nurse, receptionist,
 * pharmacist, lab staff, or another admin).
 */
const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, role, phone } = req.body;

  if (await userModel.emailExists(email)) {
    throw ApiError.conflict('An account with this email already exists.');
  }

  const roleRecord = await userModel.findRoleByName(role);
  if (!roleRecord) {
    throw ApiError.badRequest(`Unknown role: ${role}`);
  }

  const passwordHash = await bcrypt.hash(password, env.bcrypt.saltRounds);

  const user = await userModel.create({
    roleId: roleRecord.id,
    firstName,
    lastName,
    email,
    passwordHash,
    phone,
  });

  // Doctors get a corresponding 1:1 profile row immediately, so they
  // show up in department/doctor listings right away. Detailed fields
  // (specialization, fee, etc.) can be filled in afterwards via
  // PATCH /users/:id.
  if (role === ROLES.DOCTOR) {
    await doctorModel.createMinimal(user.id);
  }

  await logAction({
    req,
    action: 'USER_REGISTERED',
    entityType: 'user',
    entityId: user.id,
    metadata: { email, role },
  });

  new ApiResponse(201, 'User account created successfully', sanitizeUser(user)).send(res);
});

/**
 * POST /auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password, rememberMe } = req.body;

  const user = await userModel.findByEmail(email);

  // Use a generic message for both "no such user" and "wrong password"
  // so we don't leak which emails are registered.
  const invalidCredentials = () => ApiError.unauthorized('Invalid email or password.');

  if (!user) throw invalidCredentials();
  if (!user.is_active) throw ApiError.forbidden('This account has been deactivated. Contact an administrator.');

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) throw invalidCredentials();

  const accessToken = await issueTokens(res, user, !!rememberMe);
  await userModel.updateLastLogin(user.id);

  new ApiResponse(200, 'Login successful', {
    user: sanitizeUser(user),
    accessToken,
  }).send(res);
});

/**
 * POST /auth/refresh
 * Reads the httpOnly refresh cookie and, if valid, issues a new access
 * token (and rotates the refresh token).
 */
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (!token) {
    throw ApiError.unauthorized('No refresh token provided. Please log in again.');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: `${env.apiPrefix}/auth` });
    throw ApiError.unauthorized('Refresh token invalid or expired. Please log in again.');
  }

  const user = await userModel.findById(decoded.id);
  if (!user || !user.is_active || user.token_version !== decoded.tokenVersion) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: `${env.apiPrefix}/auth` });
    throw ApiError.unauthorized('Session no longer valid. Please log in again.');
  }

  const accessToken = await issueTokens(res, user, false);

  new ApiResponse(200, 'Token refreshed', { accessToken }).send(res);
});

/**
 * POST /auth/logout
 * Clears the refresh cookie. (Access tokens simply expire client-side;
 * for a hard "log out everywhere" use /auth/logout-all.)
 */
const logout = asyncHandler(async (req, res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: `${env.apiPrefix}/auth` });
  new ApiResponse(200, 'Logged out successfully').send(res);
});

/**
 * POST /auth/logout-all
 * Requires authentication. Bumps token_version so every previously
 * issued access/refresh token is immediately invalidated.
 */
const logoutAll = asyncHandler(async (req, res) => {
  await userModel.bumpTokenVersion(req.user.id);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: `${env.apiPrefix}/auth` });
  new ApiResponse(200, 'Logged out on all devices').send(res);
});

/**
 * GET /auth/me
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await userModel.findByIdWithoutPassword(req.user.id);
  if (!user) throw ApiError.notFound('User not found.');

  // Doctors need their own `doctors.id` (distinct from their user id) to
  // call the availability endpoints for their own schedule - attach it
  // here rather than making the frontend make a second round trip.
  let doctorProfile = null;
  if (user.role_name === ROLES.DOCTOR) {
    doctorProfile = await doctorModel.findByUserId(user.id);
  }

  // Same idea for patients: the portal needs the linked `patients.id`
  // (and patient_code, etc.) for every self-service call it makes.
  let patientProfile = null;
  if (user.role_name === ROLES.PATIENT) {
    patientProfile = await patientModel.findByUserId(user.id);
  }

  new ApiResponse(200, 'Current user retrieved', { ...user, doctorProfile, patientProfile }).send(res);
});

/**
 * PATCH /auth/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await userModel.findById(req.user.id);
  const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!passwordMatches) {
    throw ApiError.badRequest('Current password is incorrect.');
  }

  const newHash = await bcrypt.hash(newPassword, env.bcrypt.saltRounds);
  await userModel.updatePasswordAndBumpTokenVersion(user.id, newHash);

  // Bumping token_version invalidated the current session too, so issue
  // fresh tokens to keep the user logged in on this device.
  const refreshedUser = await userModel.findById(user.id);
  const accessToken = await issueTokens(res, refreshedUser, false);

  new ApiResponse(200, 'Password changed successfully', { accessToken }).send(res);
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getMe,
  changePassword,
  REFRESH_COOKIE_NAME,
};
