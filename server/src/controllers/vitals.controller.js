// src/controllers/vitals.controller.js

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const vitalsModel = require('../models/vitals.model');
const patientModel = require('../models/patient.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');

/** GET /vitals/patient/:patientId - vitals history for a patient */
const listPatientVitals = asyncHandler(async (req, res) => {
  const { patientId } = req.params;

  const patient = await patientModel.findById(patientId);
  if (!patient) throw ApiError.notFound('Patient not found.');

  const { page, limit, offset } = parsePagination(req.query, ['recorded_at'], 'recorded_at');
  const { rows, total } = await vitalsModel.listByPatient(patientId, { limit, offset });

  new ApiResponse(200, 'Vitals retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** POST /vitals - nurse or admin */
const recordVitals = asyncHandler(async (req, res) => {
  const { patientId } = req.body;

  const patient = await patientModel.findById(patientId);
  if (!patient) throw ApiError.badRequest('patientId does not match an existing patient.');

  const vitals = await vitalsModel.create({ ...req.body, recordedBy: req.user.id });

  await logAction({
    req, action: 'VITALS_RECORDED', entityType: 'patient', entityId: Number(patientId),
    metadata: { vitalsId: vitals.id },
  });

  new ApiResponse(201, 'Vitals recorded successfully', vitals).send(res);
});

module.exports = { listPatientVitals, recordVitals };
