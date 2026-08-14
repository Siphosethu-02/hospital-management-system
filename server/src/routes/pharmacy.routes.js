// src/routes/pharmacy.routes.js
// Everything under the "Pharmacy" umbrella from the spec: medicine
// inventory, categories, stock batches, low-stock/expiry alerts, and
// dispensing history. (Dispensing itself - PATCH /prescriptions/:id/items/:itemId/dispense -
// lives in prescription.routes.js since it operates on prescription_items.)

const express = require('express');
const medicineController = require('../controllers/medicine.controller');
const categoryController = require('../controllers/medicineCategory.controller');
const prescriptionController = require('../controllers/prescription.controller');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const { ROLES } = require('../utils/roles');
const {
  idParamRule,
  categoryIdParamRule,
  createMedicineRules,
  updateMedicineRules,
  createCategoryRules,
  updateCategoryRules,
  receiveStockRules,
  expiringSoonQueryRule,
} = require('../validators/pharmacy.validator');

const router = express.Router();

router.use(authenticate);

const canManage = authorize(ROLES.ADMIN, ROLES.PHARMACIST);
const canRead = authorize(ROLES.ADMIN, ROLES.PHARMACIST, ROLES.DOCTOR, ROLES.NURSE);

// --- Categories ---------------------------------------------------------
router.get('/categories', canRead, categoryController.listCategories);
router.post('/categories', canManage, validate(createCategoryRules), categoryController.createCategory);
router.patch('/categories/:id', canManage, validate(updateCategoryRules), categoryController.updateCategory);
router.delete('/categories/:id', authorize(ROLES.ADMIN), validate(categoryIdParamRule), categoryController.deleteCategory);

// --- Alerts (must come before /medicines/:id to avoid route clashes) ----
router.get('/alerts/low-stock', canRead, medicineController.getLowStockAlerts);
router.get('/alerts/expiring', canRead, validate(expiringSoonQueryRule), medicineController.getExpiringAlerts);
router.get('/alerts/expired', canRead, medicineController.getExpiredAlerts);

// --- Dispensing history ---------------------------------------------------
router.get('/dispensing-history', canManage, prescriptionController.getDispensingHistory);

// --- Medicines ------------------------------------------------------------
router.get('/medicines', canRead, medicineController.listMedicines);
router.get('/medicines/:id', canRead, validate(idParamRule), medicineController.getMedicine);
router.post('/medicines', canManage, validate(createMedicineRules), medicineController.createMedicine);
router.patch('/medicines/:id', canManage, validate(updateMedicineRules), medicineController.updateMedicine);
router.delete('/medicines/:id', authorize(ROLES.ADMIN), validate(idParamRule), medicineController.deleteMedicine);

// --- Stock batches ----------------------------------------------------
router.get('/medicines/:id/stock', canRead, validate(idParamRule), medicineController.listStockBatches);
router.post('/medicines/:id/stock', canManage, validate(receiveStockRules), medicineController.receiveStock);

module.exports = router;
