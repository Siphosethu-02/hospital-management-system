// src/config/env.js
// Centralized environment configuration.
// Every other module should read config from here instead of touching
// process.env directly - this makes it obvious what the app depends on,
// and lets us fail fast (at boot) if something required is missing.

require('dotenv').config();

const required = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_NAME',
];

function validateEnv() {
  const missing = required.filter((key) => !process.env[key]);

  // In production we refuse to boot with missing secrets.
  // In development we warn loudly so it's still easy to get started.
  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[config] WARNING: ${message}. Copy .env.example to .env and fill it in.`);
    }
  }
}

validateEnv();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT, 10) || 5000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'hospital_management_system',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    refreshExpiresInRememberMe: process.env.JWT_REFRESH_EXPIRES_IN_REMEMBER_ME || '30d',
  },

  cookie: {
    secret: process.env.COOKIE_SECRET || 'dev_cookie_secret_change_me',
    secure: process.env.COOKIE_SECURE === 'true',
  },

  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
  },

  upload: {
    maxSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) || 5,
    dir: process.env.UPLOAD_DIR || 'uploads',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 200,
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10) || 10,
  },
};

module.exports = env;
