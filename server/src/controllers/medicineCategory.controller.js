// src/controllers/medicineCategory.controller.js

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const categoryModel = require('../models/medicineCategory.model');
const { logAction } = require('../utils/audit');

/** GET /pharmacy/categories */
const listCategories = asyncHandler(async (req, res) => {
  const categories = await categoryModel.listAll();
  new ApiResponse(200, 'Medicine categories retrieved', categories).send(res);
});

/** POST /pharmacy/categories - pharmacist or admin */
const createCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (await categoryModel.findByName(name)) {
    throw ApiError.conflict('A category with this name already exists.');
  }
  const category = await categoryModel.create(name);

  await logAction({ req, action: 'MEDICINE_CATEGORY_CREATED', entityType: 'medicine_category', entityId: category.id });

  new ApiResponse(201, 'Category created successfully', category).send(res);
});

/** PATCH /pharmacy/categories/:id - pharmacist or admin */
const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await categoryModel.findById(id);
  if (!existing) throw ApiError.notFound('Category not found.');

  const { name } = req.body;
  const clash = await categoryModel.findByName(name);
  if (clash && Number(clash.id) !== Number(id)) {
    throw ApiError.conflict('A category with this name already exists.');
  }

  const category = await categoryModel.update(id, name);

  await logAction({ req, action: 'MEDICINE_CATEGORY_UPDATED', entityType: 'medicine_category', entityId: Number(id) });

  new ApiResponse(200, 'Category updated successfully', category).send(res);
});

/** DELETE /pharmacy/categories/:id - admin only */
const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await categoryModel.findById(id);
  if (!existing) throw ApiError.notFound('Category not found.');

  try {
    await categoryModel.remove(id);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      throw ApiError.badRequest('This category still has medicines assigned to it. Reassign them first.');
    }
    throw err;
  }

  await logAction({ req, action: 'MEDICINE_CATEGORY_DELETED', entityType: 'medicine_category', entityId: Number(id) });

  new ApiResponse(200, 'Category deleted successfully').send(res);
});

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };
