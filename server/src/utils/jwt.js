// src/utils/jwt.js
// Thin wrapper around jsonwebtoken for issuing/verifying the two token
// types used by the app:
//   - access token  -> short-lived, sent in the Authorization header,
//                      used to authorize every API request
//   - refresh token -> long-lived, stored in an httpOnly cookie, used
//                      only to mint new access tokens

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * @param {{ id: number, role: string, tokenVersion: number }} payload
 */
function signAccessToken(payload) {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
    issuer: 'hms-api',
  });
}

/**
 * @param {{ id: number, tokenVersion: number }} payload
 * @param {boolean} rememberMe  extends expiry when the user opted in
 */
function signRefreshToken(payload, rememberMe = false) {
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: rememberMe
      ? env.jwt.refreshExpiresInRememberMe
      : env.jwt.refreshExpiresIn,
    issuer: 'hms-api',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, { issuer: 'hms-api' });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret, { issuer: 'hms-api' });
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
