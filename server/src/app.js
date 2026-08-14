// src/app.js
// Builds and configures the Express application. Kept separate from
// server.js so the app instance can be imported directly in tests
// without binding to a real port.

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const env = require('./config/env');
const logger = require('./utils/logger');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

const app = express();

// Behind a reverse proxy (Render/Railway/Nginx) in production, so
// req.ip / secure cookies work correctly.
app.set('trust proxy', 1);

// --- Security & parsing middleware -----------------------------------
app.use(helmet());
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true, // allow the refresh-token cookie to be sent
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser(env.cookie.secret));

// --- Logging -----------------------------------------------------------
app.use(
  morgan(env.isProduction ? 'combined' : 'dev', {
    stream: { write: (message) => logger.http ? logger.http(message.trim()) : logger.info(message.trim()) },
  })
);

// --- Global rate limiting ----------------------------------------------
app.use(
  rateLimit({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// --- Static file serving (uploaded patient images, lab reports, etc.) --
app.use('/uploads', express.static(path.join(__dirname, '..', env.upload.dir)));

// --- API routes ----------------------------------------------------------
app.use(env.apiPrefix, routes);

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Hospital Management System API',
    docs: `${env.apiPrefix}/health`,
  });
});

// --- 404 + centralized error handling (must be last) -------------------
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
