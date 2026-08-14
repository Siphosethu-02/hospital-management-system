// src/middleware/upload.middleware.js
// Multer configuration for file uploads. Two configured uploaders:
//   - patientImageUpload: single image, saved under uploads/patients
//   - documentUpload: single PDF/image, saved under uploads/misc
//     (reused later for lab reports, attachments, etc.)
//
// Files are saved to disk with a random name (uuid) to avoid collisions
// and to avoid trusting user-supplied filenames.

const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', env.upload.dir);

function makeStorage(subdir) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, subdir)),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  });
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];

function fileFilterFor(allowedMimeTypes) {
  return (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        ApiError.badRequest(
          `Unsupported file type "${file.mimetype}". Allowed: ${allowedMimeTypes.join(', ')}`
        )
      );
    }
    cb(null, true);
  };
}

const maxSizeBytes = env.upload.maxSizeMb * 1024 * 1024;

const patientImageUpload = multer({
  storage: makeStorage('patients'),
  limits: { fileSize: maxSizeBytes },
  fileFilter: fileFilterFor(IMAGE_TYPES),
}).single('image');

const documentUpload = multer({
  storage: makeStorage('misc'),
  limits: { fileSize: maxSizeBytes },
  fileFilter: fileFilterFor(DOCUMENT_TYPES),
}).single('file');

const avatarUpload = multer({
  storage: makeStorage('misc'),
  limits: { fileSize: maxSizeBytes },
  fileFilter: fileFilterFor(IMAGE_TYPES),
}).single('avatar');

const labReportUpload = multer({
  storage: makeStorage('lab-reports'),
  limits: { fileSize: maxSizeBytes },
  fileFilter: fileFilterFor(DOCUMENT_TYPES),
}).single('report');

/**
 * Wraps a multer single-file middleware so multer's own errors (file too
 * large, wrong field name, etc.) flow into our centralized error handler
 * with a consistent message instead of an unhandled exception.
 */
function wrap(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  };
}

module.exports = {
  uploadPatientImage: wrap(patientImageUpload),
  uploadDocument: wrap(documentUpload),
  uploadAvatar: wrap(avatarUpload),
  uploadLabReport: wrap(labReportUpload),
};
