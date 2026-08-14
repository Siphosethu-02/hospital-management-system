// src/controllers/medicine.controller.js

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const medicineModel = require('../models/medicine.model');
const medicineStockModel = require('../models/medicineStock.model');
const medicineCategoryModel = require('../models/medicineCategory.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');

const SORTABLE_COLUMNS = ['name', 'unit_price', 'current_stock', 'created_at'];

/** GET /pharmacy/medicines - supports ?search=&categoryId=&isActive=&lowStockOnly=&sortBy=&order= */
const listMedicines = asyncHandler(async (req, res) => {
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, SORTABLE_COLUMNS, 'name');
  const { search, categoryId } = req.query;
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
  const lowStockOnly = req.query.lowStockOnly === 'true';

  const { rows, total } = await medicineModel.list({
    search, categoryId, isActive, lowStockOnly, sortBy, order, limit, offset,
  });

  new ApiResponse(200, 'Medicines retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /pharmacy/medicines/:id */
const getMedicine = asyncHandler(async (req, res) => {
  const medicine = await medicineModel.findById(req.params.id);
  if (!medicine) throw ApiError.notFound('Medicine not found.');
  new ApiResponse(200, 'Medicine retrieved', medicine).send(res);
});

/** POST /pharmacy/medicines - pharmacist or admin */
const createMedicine = asyncHandler(async (req, res) => {
  const { name, categoryId } = req.body;

  if (await medicineModel.findByName(name)) {
    throw ApiError.conflict('A medicine with this name already exists.');
  }
  if (categoryId && !(await medicineCategoryModel.findById(categoryId))) {
    throw ApiError.badRequest('categoryId does not match an existing category.');
  }

  const medicine = await medicineModel.create(req.body);

  await logAction({ req, action: 'MEDICINE_CREATED', entityType: 'medicine', entityId: medicine.id, metadata: { name } });

  new ApiResponse(201, 'Medicine created successfully', medicine).send(res);
});

/** PATCH /pharmacy/medicines/:id - pharmacist or admin */
const updateMedicine = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await medicineModel.findById(id);
  if (!existing) throw ApiError.notFound('Medicine not found.');

  const { name, categoryId } = req.body;

  if (name && name !== existing.name && (await medicineModel.findByName(name))) {
    throw ApiError.conflict('A medicine with this name already exists.');
  }
  if (categoryId && !(await medicineCategoryModel.findById(categoryId))) {
    throw ApiError.badRequest('categoryId does not match an existing category.');
  }

  const fieldMap = {
    name: 'name', categoryId: 'category_id', genericName: 'generic_name', manufacturer: 'manufacturer',
    unit: 'unit', unitPrice: 'unit_price', reorderLevel: 'reorder_level', isActive: 'is_active',
  };
  const fields = {};
  for (const [bodyKey, column] of Object.entries(fieldMap)) {
    if (req.body[bodyKey] !== undefined) fields[column] = req.body[bodyKey];
  }

  const medicine = await medicineModel.update(id, fields);

  await logAction({ req, action: 'MEDICINE_UPDATED', entityType: 'medicine', entityId: Number(id) });

  new ApiResponse(200, 'Medicine updated successfully', medicine).send(res);
});

/** DELETE /pharmacy/medicines/:id - admin only, blocked if referenced by prescriptions/stock */
const deleteMedicine = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await medicineModel.findById(id);
  if (!existing) throw ApiError.notFound('Medicine not found.');

  try {
    await medicineModel.remove(id);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      throw ApiError.badRequest(
        'This medicine has prescription or stock history and cannot be deleted. Deactivate it instead.'
      );
    }
    throw err;
  }

  await logAction({ req, action: 'MEDICINE_DELETED', entityType: 'medicine', entityId: Number(id) });

  new ApiResponse(200, 'Medicine deleted successfully').send(res);
});

/** GET /pharmacy/medicines/:id/stock - batch-level stock for one medicine */
const listStockBatches = asyncHandler(async (req, res) => {
  const medicine = await medicineModel.findById(req.params.id);
  if (!medicine) throw ApiError.notFound('Medicine not found.');

  const batches = await medicineStockModel.listByMedicine(req.params.id);
  new ApiResponse(200, 'Stock batches retrieved', batches).send(res);
});

/** POST /pharmacy/medicines/:id/stock - receive a new batch (pharmacist or admin) */
const receiveStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const medicine = await medicineModel.findById(id);
  if (!medicine) throw ApiError.notFound('Medicine not found.');

  const batch = await medicineStockModel.receiveBatch({ medicineId: id, ...req.body });

  await logAction({
    req, action: 'MEDICINE_STOCK_RECEIVED', entityType: 'medicine', entityId: Number(id),
    metadata: { quantity: req.body.quantity, expiryDate: req.body.expiryDate },
  });

  new ApiResponse(201, 'Stock batch received successfully', batch).send(res);
});

/** GET /pharmacy/alerts/low-stock */
const getLowStockAlerts = asyncHandler(async (req, res) => {
  const medicines = await medicineModel.listLowStock();
  new ApiResponse(200, 'Low-stock medicines retrieved', medicines).send(res);
});

/** GET /pharmacy/alerts/expiring?withinDays=30 */
const getExpiringAlerts = asyncHandler(async (req, res) => {
  const withinDays = req.query.withinDays ? parseInt(req.query.withinDays, 10) : 30;
  const batches = await medicineStockModel.listExpiringSoon(withinDays);
  new ApiResponse(200, 'Expiring stock batches retrieved', batches).send(res);
});

/** GET /pharmacy/alerts/expired */
const getExpiredAlerts = asyncHandler(async (req, res) => {
  const batches = await medicineStockModel.listExpired();
  new ApiResponse(200, 'Expired stock batches retrieved', batches).send(res);
});

module.exports = {
  listMedicines,
  getMedicine,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  listStockBatches,
  receiveStock,
  getLowStockAlerts,
  getExpiringAlerts,
  getExpiredAlerts,
};
