// src/controllers/billing.controller.js

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const invoiceModel = require('../models/invoice.model');
const patientModel = require('../models/patient.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');
const { streamInvoicePdf } = require('../utils/pdf');

const SORTABLE_COLUMNS = ['created_at', 'total', 'status', 'due_date'];

/** GET /billing/invoices - supports ?patientId=&status=&dateFrom=&dateTo=&search= */
const listInvoices = asyncHandler(async (req, res) => {
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, SORTABLE_COLUMNS, 'created_at');
  const { patientId, status, dateFrom, dateTo, search } = req.query;

  const { rows, total } = await invoiceModel.list({ patientId, status, dateFrom, dateTo, search, sortBy, order, limit, offset });
  new ApiResponse(200, 'Invoices retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /billing/invoices/:id */
const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceModel.findById(req.params.id);
  if (!invoice) throw ApiError.notFound('Invoice not found.');
  new ApiResponse(200, 'Invoice retrieved', invoice).send(res);
});

/** POST /billing/invoices - admin or receptionist */
const createInvoice = asyncHandler(async (req, res) => {
  const { patientId } = req.body;
  const patient = await patientModel.findById(patientId);
  if (!patient) throw ApiError.badRequest('patientId does not match an existing patient.');

  const invoice = await invoiceModel.create({ ...req.body, createdBy: req.user.id });

  await logAction({
    req, action: 'INVOICE_CREATED', entityType: 'invoice', entityId: invoice.id,
    metadata: { invoiceNumber: invoice.invoice_number, total: invoice.total },
  });

  new ApiResponse(201, 'Invoice created successfully', invoice).send(res);
});

/** POST /billing/invoices/:id/payments - admin or receptionist records a payment */
const recordPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await invoiceModel.findById(id);
  if (!existing) throw ApiError.notFound('Invoice not found.');

  if (existing.status === 'paid') {
    throw ApiError.badRequest('This invoice is already fully paid.');
  }

  try {
    const invoice = await invoiceModel.recordPayment(id, { ...req.body, receivedBy: req.user.id });

    await logAction({
      req, action: 'PAYMENT_RECORDED', entityType: 'invoice', entityId: Number(id),
      metadata: { amount: req.body.amount, method: req.body.paymentMethod },
    });

    new ApiResponse(201, 'Payment recorded successfully', invoice).send(res);
  } catch (err) {
    if (err.code === 'INVALID_STATE') throw ApiError.badRequest(err.message);
    if (err.code === 'NOT_FOUND') throw ApiError.notFound(err.message);
    throw err;
  }
});

/** PATCH /billing/invoices/:id/void - admin only */
const voidInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await invoiceModel.findById(id);
  if (!existing) throw ApiError.notFound('Invoice not found.');

  if (existing.status === 'paid') {
    throw ApiError.badRequest('A fully paid invoice cannot be voided.');
  }

  const invoice = await invoiceModel.voidInvoice(id);

  await logAction({ req, action: 'INVOICE_VOIDED', entityType: 'invoice', entityId: Number(id) });

  new ApiResponse(200, 'Invoice voided successfully', invoice).send(res);
});

/** GET /billing/invoices/:id/pdf - printable/downloadable invoice */
const downloadInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await invoiceModel.findById(req.params.id);
  if (!invoice) throw ApiError.notFound('Invoice not found.');
  streamInvoicePdf(res, invoice);
});

module.exports = { listInvoices, getInvoice, createInvoice, recordPayment, voidInvoice, downloadInvoicePdf };
