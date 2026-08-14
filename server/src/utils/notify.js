// src/utils/notify.js
// Thin helper other controllers call to fire a notification at a single
// user when something they care about happens (their appointment was
// booked, their patient's lab result is ready, etc). Failures are logged
// but never break the calling request, same philosophy as audit.js.

const notificationModel = require('../models/notification.model');
const logger = require('./logger');

/**
 * @param {object} params
 * @param {number} params.userId
 * @param {'appointment_reminder'|'lab_result'|'prescription'|'billing'|'system'} params.type
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.referenceType]
 * @param {number} [params.referenceId]
 */
async function notify({ userId, type, title, message, referenceType, referenceId }) {
  if (!userId) return null;
  try {
    return await notificationModel.create({ userId, type, title, message, referenceType, referenceId });
  } catch (err) {
    logger.error(`[notify] Failed to create notification for user ${userId}: ${err.message}`);
    return null;
  }
}

module.exports = { notify };
