// src/controllers/patient.controller.js

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const bcrypt = require('bcryptjs');
const patientModel = require('../models/patient.model');
const userModel = require('../models/user.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');
const { ROLES } = require('../utils/roles');
const env = require('../config/env');

const SORTABLE_COLUMNS = ['first_name', 'last_name', 'created_at', 'date_of_birth', 'patient_code'];

/**
 * GET /patients
 * Supports ?search=&gender=&bloodGroup=&isActive=&page=&limit=&sortBy=&order=
 * `search` matches name, patient code, phone, or email - this is the
 * "Patient search" / "Global search" feature from the spec.
 */
const listPatients = asyncHandler(async (req, res) => {
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, SORTABLE_COLUMNS, 'created_at');
  const { search, gender, bloodGroup } = req.query;
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

  const { rows, total } = await patientModel.list({
    search, gender, bloodGroup, isActive, sortBy, order, limit, offset,
  });

  new ApiResponse(200, 'Patients retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /patients/:id */
const getPatient = asyncHandler(async (req, res) => {
  const patient = await patientModel.findById(req.params.id);
  if (!patient) throw ApiError.notFound('Patient not found.');
  new ApiResponse(200, 'Patient retrieved', patient).send(res);
});

/** GET /patients/code/:code - lookup by the human-readable patient card code */
const getPatientByCode = asyncHandler(async (req, res) => {
  const patient = await patientModel.findByCode(req.params.code);
  if (!patient) throw ApiError.notFound('Patient not found.');
  new ApiResponse(200, 'Patient retrieved', patient).send(res);
});

/** POST /patients - receptionist or admin */
const createPatient = asyncHandler(async (req, res) => {
  const patient = await patientModel.create({ ...req.body, registeredBy: req.user.id });

  await logAction({
    req,
    action: 'PATIENT_CREATED',
    entityType: 'patient',
    entityId: patient.id,
    metadata: { patientCode: patient.patient_code },
  });

  new ApiResponse(201, 'Patient registered successfully', patient).send(res);
});

/** PATCH /patients/:id - receptionist or admin */
const updatePatient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await patientModel.findById(id);
  if (!existing) throw ApiError.notFound('Patient not found.');

  // Map camelCase body -> snake_case columns expected by the model.
  const fieldMap = {
    firstName: 'first_name',
    lastName: 'last_name',
    dateOfBirth: 'date_of_birth',
    gender: 'gender',
    bloodGroup: 'blood_group',
    phone: 'phone',
    email: 'email',
    address: 'address',
    city: 'city',
    allergies: 'allergies',
    chronicConditions: 'chronic_conditions',
    emergencyContactName: 'emergency_contact_name',
    emergencyContactPhone: 'emergency_contact_phone',
    emergencyContactRelation: 'emergency_contact_relation',
    insuranceProvider: 'insurance_provider',
    insurancePolicyNumber: 'insurance_policy_number',
  };

  const fields = {};
  for (const [bodyKey, column] of Object.entries(fieldMap)) {
    if (req.body[bodyKey] !== undefined) fields[column] = req.body[bodyKey];
  }

  const patient = await patientModel.update(id, fields);

  await logAction({
    req,
    action: 'PATIENT_UPDATED',
    entityType: 'patient',
    entityId: Number(id),
    metadata: { fields: Object.keys(fields) },
  });

  new ApiResponse(200, 'Patient updated successfully', patient).send(res);
});

/** POST /patients/:id/image - receptionist or admin */
const uploadPatientImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await patientModel.findById(id);
  if (!existing) throw ApiError.notFound('Patient not found.');

  if (!req.file) throw ApiError.badRequest('No image file was uploaded.');

  const imageUrl = `/uploads/patients/${req.file.filename}`;
  const patient = await patientModel.updateImage(id, imageUrl);

  await logAction({ req, action: 'PATIENT_IMAGE_UPDATED', entityType: 'patient', entityId: Number(id) });

  new ApiResponse(200, 'Patient image uploaded successfully', patient).send(res);
});

/** PATCH /patients/:id/deactivate - admin only */
const deactivatePatient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await patientModel.findById(id);
  if (!existing) throw ApiError.notFound('Patient not found.');

  const patient = await patientModel.setActive(id, false);
  await logAction({ req, action: 'PATIENT_DEACTIVATED', entityType: 'patient', entityId: Number(id) });

  new ApiResponse(200, 'Patient deactivated successfully', patient).send(res);
});

/** PATCH /patients/:id/activate - admin only */
const activatePatient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await patientModel.findById(id);
  if (!existing) throw ApiError.notFound('Patient not found.');

  const patient = await patientModel.setActive(id, true);
  await logAction({ req, action: 'PATIENT_ACTIVATED', entityType: 'patient', entityId: Number(id) });

  new ApiResponse(200, 'Patient activated successfully', patient).send(res);
});

/** DELETE /patients/:id - admin only, blocked if the patient has related records */
const deletePatient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await patientModel.findById(id);
  if (!existing) throw ApiError.notFound('Patient not found.');

  try {
    await patientModel.remove(id);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      throw ApiError.badRequest(
        'This patient has related records (appointments, medical history, invoices, etc.) and cannot be permanently deleted. Deactivate the record instead.'
      );
    }
    throw err;
  }

  await logAction({ req, action: 'PATIENT_DELETED', entityType: 'patient', entityId: Number(id) });

  new ApiResponse(200, 'Patient deleted successfully').send(res);
});

/**
 * POST /patients/:id/portal-access - admin or receptionist grants an
 * existing patient a login to the patient portal. Creates a new `users`
 * row (role: patient) and links it via patients.user_id - the patient
 * keeps every bit of their existing medical history, since this only
 * ever touches the link column, never the patient record itself.
 */
const grantPortalAccess = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { email, password } = req.body;

  const patient = await patientModel.findById(id);
  if (!patient) throw ApiError.notFound('Patient not found.');

  if (patient.user_id) {
    throw ApiError.conflict('This patient already has portal access.');
  }
  if (await userModel.emailExists(email)) {
    throw ApiError.conflict('An account with this email already exists.');
  }

  const roleRecord = await userModel.findRoleByName(ROLES.PATIENT);
  if (!roleRecord) throw ApiError.internal('Patient role is not configured.');

  const passwordHash = await bcrypt.hash(password, env.bcrypt.saltRounds);
  const user = await userModel.create({
    roleId: roleRecord.id,
    firstName: patient.first_name,
    lastName: patient.last_name,
    email,
    passwordHash,
    phone: patient.phone,
  });

  const updated = await patientModel.linkUserAccount(id, user.id);

  await logAction({
    req, action: 'PATIENT_PORTAL_ACCESS_GRANTED', entityType: 'patient', entityId: Number(id),
    metadata: { email },
  });

  new ApiResponse(201, 'Portal access granted successfully', updated).send(res);
});

module.exports = {
  listPatients,
  getPatient,
  getPatientByCode,
  createPatient,
  updatePatient,
  uploadPatientImage,
  deactivatePatient,
  activatePatient,
  deletePatient,
  grantPortalAccess,
};
