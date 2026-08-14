// src/routes/billing.routes.js

const express = require('express');
const controller = require('../controllers/billing.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { ROLES } = require('../utils/roles');
const { idParamRule, createInvoiceRules, recordPaymentRules } = require('../validators/billing.validator');

const router = express.Router();

router.use(authenticate);

const canManage = authorize(ROLES.ADMIN, ROLES.RECEPTIONIST);

router.get('/invoices', canManage, controller.listInvoices);
router.get('/invoices/:id', canManage, validate(idParamRule), controller.getInvoice);
router.get('/invoices/:id/pdf', canManage, validate(idParamRule), controller.downloadInvoicePdf);
router.post('/invoices', canManage, validate(createInvoiceRules), controller.createInvoice);
router.post('/invoices/:id/payments', canManage, validate(recordPaymentRules), controller.recordPayment);
router.patch('/invoices/:id/void', authorize(ROLES.ADMIN), validate(idParamRule), controller.voidInvoice);

module.exports = router;
