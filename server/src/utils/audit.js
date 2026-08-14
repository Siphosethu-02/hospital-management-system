// src/utils/audit.js
// Writes a row to `audit_logs` for traceable actions (who did what, to
// which record, from where). Failures here are logged but never break
// the request - an audit-log write should never be the reason a
// legitimate action fails.

const { pool } = require('../config/db');
const logger = require('./logger');

/**
 * @param {object} params
 * @param {import('express').Request} params.req   used to pull user id / ip / user-agent
 * @param {string} params.action        e.g. 'PATIENT_CREATED', 'USER_DEACTIVATED'
 * @param {string} [params.entityType]  e.g. 'patient', 'user', 'department'
 * @param {number} [params.entityId]
 * @param {object} [params.metadata]    arbitrary JSON-serializable context (e.g. changed fields)
 */
async function logAction({ req, action, entityType = null, entityId = null, metadata = null }) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent, metadata)
       VALUES (:userId, :action, :entityType, :entityId, :ip, :userAgent, :metadata)`,
      {
        userId: req.user ? req.user.id : null,
        action,
        entityType,
        entityId,
        ip: req.ip || null,
        userAgent: (req.headers['user-agent'] || '').slice(0, 255),
        metadata: metadata ? JSON.stringify(metadata) : null,
      }
    );
  } catch (err) {
    logger.error(`[audit] Failed to write audit log for action "${action}": ${err.message}`);
  }
}

module.exports = { logAction };
