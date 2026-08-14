// src/validators/notification.validator.js

const { param } = require('express-validator');

const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid notification id')];

module.exports = { idParamRule };
