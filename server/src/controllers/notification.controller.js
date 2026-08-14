// src/controllers/notification.controller.js
// Self-service notification inbox. Every authenticated user manages
// only their own notifications.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const notificationModel = require('../models/notification.model');
const { parsePagination, buildMeta } = require('../utils/pagination');

/** GET /notifications - supports ?unreadOnly=true&page=&limit= */
const listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, ['created_at'], 'created_at');
  const unreadOnly = req.query.unreadOnly === 'true';

  const { rows, total } = await notificationModel.listByUser(req.user.id, { unreadOnly, limit, offset });
  new ApiResponse(200, 'Notifications retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /notifications/unread-count */
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationModel.getUnreadCount(req.user.id);
  new ApiResponse(200, 'Unread count retrieved', { count }).send(res);
});

/** PATCH /notifications/:id/read */
const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationModel.findById(req.params.id);
  if (!notification || notification.user_id !== req.user.id) {
    throw ApiError.notFound('Notification not found.');
  }
  const updated = await notificationModel.markRead(req.params.id);
  new ApiResponse(200, 'Notification marked as read', updated).send(res);
});

/** PATCH /notifications/read-all */
const markAllRead = asyncHandler(async (req, res) => {
  await notificationModel.markAllRead(req.user.id);
  new ApiResponse(200, 'All notifications marked as read').send(res);
});

/** DELETE /notifications/:id */
const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await notificationModel.findById(req.params.id);
  if (!notification || notification.user_id !== req.user.id) {
    throw ApiError.notFound('Notification not found.');
  }
  await notificationModel.remove(req.params.id);
  new ApiResponse(200, 'Notification deleted').send(res);
});

module.exports = { listNotifications, getUnreadCount, markRead, markAllRead, deleteNotification };
