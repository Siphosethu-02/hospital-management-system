// src/controllers/auditLog.controller.js

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const auditLogModel = require('../models/auditLog.model');
const { parsePagination, buildMeta } = require('../utils/pagination');

/** GET /audit-logs - admin only. Supports ?userId=&action=&entityType=&dateFrom=&dateTo= */
const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, ['created_at'], 'created_at');
  const { userId, action, entityType, dateFrom, dateTo } = req.query;

  const { rows, total } = await auditLogModel.list({ userId, action, entityType, dateFrom, dateTo, limit, offset });
  new ApiResponse(200, 'Audit logs retrieved', rows, buildMeta(total, page, limit)).send(res);
});

module.exports = { listAuditLogs };
