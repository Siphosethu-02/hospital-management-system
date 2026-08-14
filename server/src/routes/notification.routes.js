// src/routes/notification.routes.js

const express = require('express');
const controller = require('../controllers/notification.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { idParamRule } = require('../validators/notification.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.listNotifications);
router.get('/unread-count', controller.getUnreadCount);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', validate(idParamRule), controller.markRead);
router.delete('/:id', validate(idParamRule), controller.deleteNotification);

module.exports = router;
