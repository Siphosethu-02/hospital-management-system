// src/controllers/medicalRecord.controller.js

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const medicalRecordModel = require('../models/medicalRecord.model');
const patientModel = require('../models/patient.model');
const doctorModel = require('../models/doctor.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');
const { ROLES } = require('../utils/roles');
const fs = require('fs');
const path = require('path');

const SORTABLE_COLUMNS = ['created_at', 'follow_up_date'];

async function requireOwnDoctorId(req) {
  const profile = await doctorModel.findByUserId(req.user.id);
  if (!profile) throw ApiError.forbidden('No doctor profile is associated with your account.');
  return profile.id;
}

/** GET /medical-records - supports ?patientId=&doctorId=&page=&limit=&sortBy=&order= */
const listMedicalRecords = asyncHandler(async (req, res) => {
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, SORTABLE_COLUMNS, 'created_at');
  const { patientId } = req.query;
  let { doctorId } = req.query;

  if (req.user.role === ROLES.DOCTOR) {
    doctorId = await requireOwnDoctorId(req);
  }

  const { rows, total } = await medicalRecordModel.list({ patientId, doctorId, sortBy, order, limit, offset });
  new ApiResponse(200, 'Medical records retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /medical-records/:id */
const getMedicalRecord = asyncHandler(async (req, res) => {
  const record = await medicalRecordModel.findById(req.params.id);
  if (!record) throw ApiError.notFound('Medical record not found.');

  const attachments = await medicalRecordModel.listAttachments(record.id);
  new ApiResponse(200, 'Medical record retrieved', { ...record, attachments }).send(res);
});

/** POST /medical-records - doctor or admin */
const createMedicalRecord = asyncHandler(async (req, res) => {
  const { patientId, appointmentId, diagnosis, symptoms, treatmentPlan, doctorNotes, followUpDate } = req.body;

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
    throw ApiError.badRequest('doctorId is required when creating a record as an admin.');
  }

  const record = await medicalRecordModel.create({
    patientId, doctorId, appointmentId, diagnosis, symptoms, treatmentPlan, doctorNotes, followUpDate,
  });

  await logAction({
    req, action: 'MEDICAL_RECORD_CREATED', entityType: 'medical_record', entityId: record.id,
    metadata: { patientId },
  });

  new ApiResponse(201, 'Medical record created successfully', record).send(res);
});

/** PATCH /medical-records/:id - the authoring doctor, or admin */
const updateMedicalRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await medicalRecordModel.findById(id);
  if (!existing) throw ApiError.notFound('Medical record not found.');

  if (req.user.role === ROLES.DOCTOR) {
    const ownDoctorId = await requireOwnDoctorId(req);
    if (ownDoctorId !== existing.doctor_id) {
      throw ApiError.forbidden('You can only edit medical records you authored.');
    }
  }

  const fieldMap = {
    diagnosis: 'diagnosis',
    symptoms: 'symptoms',
    treatmentPlan: 'treatment_plan',
    doctorNotes: 'doctor_notes',
    followUpDate: 'follow_up_date',
  };
  const fields = {};
  for (const [bodyKey, column] of Object.entries(fieldMap)) {
    if (req.body[bodyKey] !== undefined) fields[column] = req.body[bodyKey];
  }

  const record = await medicalRecordModel.update(id, fields);

  await logAction({ req, action: 'MEDICAL_RECORD_UPDATED', entityType: 'medical_record', entityId: Number(id) });

  new ApiResponse(200, 'Medical record updated successfully', record).send(res);
});

/** POST /medical-records/:id/attachments - the authoring doctor, or admin */
const addAttachment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await medicalRecordModel.findById(id);
  if (!existing) throw ApiError.notFound('Medical record not found.');

  if (!req.file) throw ApiError.badRequest('No file was uploaded.');

  if (req.user.role === ROLES.DOCTOR) {
    const ownDoctorId = await requireOwnDoctorId(req);
    if (ownDoctorId !== existing.doctor_id) {
      throw ApiError.forbidden('You can only add attachments to records you authored.');
    }
  }

  const attachment = await medicalRecordModel.addAttachment({
    medicalRecordId: id,
    fileName: req.file.originalname,
    fileUrl: `/uploads/misc/${req.file.filename}`,
    fileType: req.file.mimetype,
    uploadedBy: req.user.id,
  });

  await logAction({
    req, action: 'MEDICAL_RECORD_ATTACHMENT_ADDED', entityType: 'medical_record', entityId: Number(id),
  });

  new ApiResponse(201, 'Attachment uploaded successfully', attachment).send(res);
});

/** DELETE /medical-records/:id/attachments/:attachmentId - the authoring doctor, or admin */
const removeAttachment = asyncHandler(async (req, res) => {
  const { id, attachmentId } = req.params;
  const existing = await medicalRecordModel.findById(id);
  if (!existing) throw ApiError.notFound('Medical record not found.');

  if (req.user.role === ROLES.DOCTOR) {
    const ownDoctorId = await requireOwnDoctorId(req);
    if (ownDoctorId !== existing.doctor_id) {
      throw ApiError.forbidden('You can only remove attachments from records you authored.');
    }
  }

  const attachment = await medicalRecordModel.findAttachmentById(attachmentId);
  if (!attachment || Number(attachment.medical_record_id) !== Number(id)) {
    throw ApiError.notFound('Attachment not found.');
  }

  await medicalRecordModel.removeAttachment(attachmentId);

  // Best-effort file cleanup - don't fail the request if this errors.
  const diskPath = path.join(__dirname, '..', '..', attachment.file_url.replace(/^\/uploads\//, 'uploads/'));
  fs.unlink(diskPath, () => {});

  await logAction({
    req, action: 'MEDICAL_RECORD_ATTACHMENT_REMOVED', entityType: 'medical_record', entityId: Number(id),
  });

  new ApiResponse(200, 'Attachment removed successfully').send(res);
});

module.exports = {
  listMedicalRecords,
  getMedicalRecord,
  createMedicalRecord,
  updateMedicalRecord,
  addAttachment,
  removeAttachment,
};
