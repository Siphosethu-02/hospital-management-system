// src/controllers/laboratory.controller.js

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const labTestModel = require('../models/labTest.model');
const labResultModel = require('../models/labResult.model');
const patientModel = require('../models/patient.model');
const doctorModel = require('../models/doctor.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');
const { notify } = require('../utils/notify');
const { ROLES } = require('../utils/roles');

const SORTABLE_COLUMNS = ['requested_at', 'priority', 'status'];

async function requireOwnDoctorId(req) {
  const profile = await doctorModel.findByUserId(req.user.id);
  if (!profile) throw ApiError.forbidden('No doctor profile is associated with your account.');
  return profile.id;
}

/** GET /laboratory/tests - supports ?patientId=&doctorId=&status=&priority= */
const listTests = asyncHandler(async (req, res) => {
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, SORTABLE_COLUMNS, 'requested_at');
  const { patientId, status, priority } = req.query;
  let { doctorId } = req.query;

  if (req.user.role === ROLES.DOCTOR) {
    doctorId = await requireOwnDoctorId(req);
  }

  const { rows, total } = await labTestModel.list({ patientId, doctorId, status, priority, sortBy, order, limit, offset });
  new ApiResponse(200, 'Lab tests retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /laboratory/tests/:id */
const getTest = asyncHandler(async (req, res) => {
  const test = await labTestModel.findById(req.params.id);
  if (!test) throw ApiError.notFound('Lab test not found.');

  const result = await labResultModel.findByTestId(test.id);
  new ApiResponse(200, 'Lab test retrieved', { ...test, result }).send(res);
});

/** POST /laboratory/tests - doctor or admin requests a test */
const createTest = asyncHandler(async (req, res) => {
  const { patientId, medicalRecordId, testName, testType, priority, notes } = req.body;

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
    throw ApiError.badRequest('doctorId is required when requesting a test as an admin.');
  }

  const test = await labTestModel.create({ patientId, doctorId, medicalRecordId, testName, testType, priority, notes });

  await logAction({ req, action: 'LAB_TEST_REQUESTED', entityType: 'laboratory_test', entityId: test.id, metadata: { testName, patientId } });

  new ApiResponse(201, 'Lab test requested successfully', test).send(res);
});

/** PATCH /laboratory/tests/:id/status - lab staff or admin */
const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await labTestModel.findById(id);
  if (!existing) throw ApiError.notFound('Lab test not found.');

  if (existing.status === 'completed' || existing.status === 'cancelled') {
    throw ApiError.badRequest(`A ${existing.status} test's status can no longer be changed.`);
  }

  const test = await labTestModel.updateStatus(id, req.body.status);

  await logAction({ req, action: 'LAB_TEST_STATUS_UPDATED', entityType: 'laboratory_test', entityId: Number(id), metadata: { from: existing.status, to: req.body.status } });

  new ApiResponse(200, 'Lab test status updated successfully', test).send(res);
});

/** POST /laboratory/tests/:id/result - lab staff or admin uploads results (marks the test completed) */
const uploadResult = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await labTestModel.findById(id);
  if (!existing) throw ApiError.notFound('Lab test not found.');

  if (existing.status === 'cancelled') {
    throw ApiError.badRequest('Cannot upload a result for a cancelled test.');
  }

  const { resultSummary, resultData } = req.body;
  const reportFileUrl = req.file ? `/uploads/lab-reports/${req.file.filename}` : null;

  if (!resultSummary && !reportFileUrl && !resultData) {
    throw ApiError.badRequest('Provide at least a result summary, structured data, or a report file.');
  }

  const parsedData = resultData
    ? (typeof resultData === 'string' ? JSON.parse(resultData) : resultData)
    : null;

  const result = await labResultModel.create({
    laboratoryTestId: id,
    resultSummary,
    resultData: parsedData,
    reportFileUrl,
    uploadedBy: req.user.id,
  });

  const test = await labTestModel.updateStatus(id, 'completed');

  await logAction({ req, action: 'LAB_RESULT_UPLOADED', entityType: 'laboratory_test', entityId: Number(id) });

  const requestingDoctor = await doctorModel.findById(existing.doctor_id);
  await notify({
    userId: requestingDoctor?.user_id,
    type: 'lab_result',
    title: 'Lab result ready',
    message: `Results for "${existing.test_name}" (${existing.patient_first_name} ${existing.patient_last_name}) are ready for review.`,
    referenceType: 'laboratory_test',
    referenceId: Number(id),
  });

  new ApiResponse(201, 'Lab result uploaded successfully', { ...test, result }).send(res);
});

/** PATCH /laboratory/tests/:id/review - the requesting doctor, or admin, acknowledges the result */
const reviewResult = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const test = await labTestModel.findById(id);
  if (!test) throw ApiError.notFound('Lab test not found.');

  const existingResult = await labResultModel.findByTestId(id);
  if (!existingResult) throw ApiError.badRequest('This test does not have a result to review yet.');

  if (req.user.role === ROLES.DOCTOR) {
    const ownDoctorId = await requireOwnDoctorId(req);
    if (ownDoctorId !== test.doctor_id) {
      throw ApiError.forbidden('You can only review results for tests you requested.');
    }
  }

  const result = await labResultModel.markReviewed(id, req.user.id);

  await logAction({ req, action: 'LAB_RESULT_REVIEWED', entityType: 'laboratory_test', entityId: Number(id) });

  new ApiResponse(200, 'Lab result marked as reviewed', result).send(res);
});

module.exports = { listTests, getTest, createTest, updateStatus, uploadResult, reviewResult };
