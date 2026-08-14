// src/controllers/prescription.controller.js

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const prescriptionModel = require('../models/prescription.model');
const patientModel = require('../models/patient.model');
const doctorModel = require('../models/doctor.model');
const medicineModel = require('../models/medicine.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');
const { ROLES } = require('../utils/roles');

const SORTABLE_COLUMNS = ['created_at', 'status'];

async function requireOwnDoctorId(req) {
  const profile = await doctorModel.findByUserId(req.user.id);
  if (!profile) throw ApiError.forbidden('No doctor profile is associated with your account.');
  return profile.id;
}

/** GET /prescriptions - supports ?patientId=&doctorId=&status=&page=&limit= */
const listPrescriptions = asyncHandler(async (req, res) => {
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, SORTABLE_COLUMNS, 'created_at');
  const { patientId, status } = req.query;
  let { doctorId } = req.query;

  if (req.user.role === ROLES.DOCTOR) {
    doctorId = await requireOwnDoctorId(req);
  }

  const { rows, total } = await prescriptionModel.list({ patientId, doctorId, status, sortBy, order, limit, offset });
  new ApiResponse(200, 'Prescriptions retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /prescriptions/:id */
const getPrescription = asyncHandler(async (req, res) => {
  const prescription = await prescriptionModel.findById(req.params.id);
  if (!prescription) throw ApiError.notFound('Prescription not found.');
  new ApiResponse(200, 'Prescription retrieved', prescription).send(res);
});

/** POST /prescriptions - doctor or admin (admin must supply doctorId) */
const createPrescription = asyncHandler(async (req, res) => {
  const { patientId, medicalRecordId, notes, items } = req.body;

  const patient = await patientModel.findById(patientId);
  if (!patient) throw ApiError.badRequest('patientId does not match an existing patient.');

  let doctorId;
  if (req.user.role === ROLES.DOCTOR) {
    doctorId = await requireOwnDoctorId(req);
  } else if (req.body.doctorId) {
    const doctor = await doctorModel.findById(req.body.doctorId);
    if (!doctor) throw ApiError.badRequest('doctorId does not match an existing doctor.');
    doctorId = req.body.doctorId;
  } else {
    throw ApiError.badRequest('doctorId is required when creating a prescription as an admin.');
  }

  for (const item of items) {
    const medicine = await medicineModel.findById(item.medicineId);
    if (!medicine) throw ApiError.badRequest(`medicineId ${item.medicineId} does not match an existing medicine.`);
    if (!medicine.is_active) throw ApiError.badRequest(`Medicine "${medicine.name}" is no longer active.`);
  }

  const prescription = await prescriptionModel.create({ patientId, doctorId, medicalRecordId, notes, items });

  await logAction({
    req, action: 'PRESCRIPTION_CREATED', entityType: 'prescription', entityId: prescription.id,
    metadata: { patientId, itemCount: items.length },
  });

  new ApiResponse(201, 'Prescription created successfully', prescription).send(res);
});

/** PATCH /prescriptions/:id/cancel - the prescribing doctor, or admin */
const cancelPrescription = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await prescriptionModel.findById(id);
  if (!existing) throw ApiError.notFound('Prescription not found.');

  if (existing.status !== 'pending') {
    throw ApiError.badRequest('Only a pending prescription (nothing dispensed yet) can be cancelled.');
  }

  if (req.user.role === ROLES.DOCTOR) {
    const ownDoctorId = await requireOwnDoctorId(req);
    if (ownDoctorId !== existing.doctor_id) {
      throw ApiError.forbidden('You can only cancel prescriptions you wrote.');
    }
  }

  const prescription = await prescriptionModel.updateStatus(id, 'cancelled');

  await logAction({ req, action: 'PRESCRIPTION_CANCELLED', entityType: 'prescription', entityId: Number(id) });

  new ApiResponse(200, 'Prescription cancelled successfully', prescription).send(res);
});

/**
 * PATCH /prescriptions/:id/items/:itemId/dispense - pharmacist or admin.
 * Decrements stock (FIFO by soonest expiry) and rolls the prescription's
 * status up to partially_dispensed / dispensed.
 */
const dispenseItem = asyncHandler(async (req, res) => {
  const { id, itemId } = req.params;

  const item = await prescriptionModel.findItemById(itemId);
  if (!item || Number(item.prescription_id) !== Number(id)) {
    throw ApiError.notFound('Prescription item not found.');
  }

  try {
    const prescription = await prescriptionModel.dispenseItem(itemId, req.user.id);

    await logAction({
      req, action: 'PRESCRIPTION_ITEM_DISPENSED', entityType: 'prescription', entityId: Number(id),
      metadata: { itemId, medicine: item.medicine_name },
    });

    new ApiResponse(200, 'Medicine dispensed successfully', prescription).send(res);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_STOCK') {
      throw ApiError.conflict(`Insufficient stock for "${item.medicine_name}" to dispense this item.`);
    }
    if (err.code === 'ALREADY_DISPENSED') {
      throw ApiError.badRequest('This item has already been dispensed.');
    }
    throw err;
  }
});

/** GET /pharmacy/dispensing-history - pharmacist or admin. Supports ?medicineId=&dispensedBy=&patientId=&dateFrom=&dateTo= */
const getDispensingHistory = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, ['dispensed_at'], 'dispensed_at');
  const { medicineId, dispensedBy, patientId, dateFrom, dateTo } = req.query;

  const { rows, total } = await prescriptionModel.listDispensingHistory({
    medicineId, dispensedBy, patientId, dateFrom, dateTo, limit, offset,
  });

  new ApiResponse(200, 'Dispensing history retrieved', rows, buildMeta(total, page, limit)).send(res);
});

module.exports = {
  listPrescriptions,
  getPrescription,
  createPrescription,
  cancelPrescription,
  dispenseItem,
  getDispensingHistory,
};
