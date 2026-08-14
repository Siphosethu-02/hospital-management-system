// src/controllers/appointment.controller.js

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const appointmentModel = require('../models/appointment.model');
const patientModel = require('../models/patient.model');
const doctorModel = require('../models/doctor.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');
const { notify } = require('../utils/notify');
const { ROLES } = require('../utils/roles');

const SORTABLE_COLUMNS = ['scheduled_at', 'created_at', 'status'];

/**
 * GET /appointments
 * Supports ?patientId=&doctorId=&departmentId=&status=&dateFrom=&dateTo=&search=&page=&limit=&sortBy=&order=
 * Doctors are automatically scoped to their own appointments only.
 */
const listAppointments = asyncHandler(async (req, res) => {
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, SORTABLE_COLUMNS, 'scheduled_at');
  const { patientId, departmentId, status, dateFrom, dateTo, search } = req.query;

  let { doctorId } = req.query;

  // A doctor can only ever see their own appointments, regardless of
  // what doctorId they pass in the query string.
  if (req.user.role === ROLES.DOCTOR) {
    const ownDoctorProfile = await doctorModel.findByUserId(req.user.id);
    if (!ownDoctorProfile) throw ApiError.forbidden('No doctor profile is associated with your account.');
    doctorId = ownDoctorProfile.id;
  }

  const { rows, total } = await appointmentModel.list({
    patientId, doctorId, departmentId, status, dateFrom, dateTo, search, sortBy, order, limit, offset,
  });

  new ApiResponse(200, 'Appointments retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /appointments/:id */
const getAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentModel.findById(req.params.id);
  if (!appointment) throw ApiError.notFound('Appointment not found.');

  if (req.user.role === ROLES.DOCTOR) {
    const ownDoctorProfile = await doctorModel.findByUserId(req.user.id);
    if (!ownDoctorProfile || ownDoctorProfile.id !== appointment.doctor_id) {
      throw ApiError.forbidden('You can only view your own appointments.');
    }
  }

  new ApiResponse(200, 'Appointment retrieved', appointment).send(res);
});

/** POST /appointments - receptionist or admin books a new appointment */
const createAppointment = asyncHandler(async (req, res) => {
  const { patientId, doctorId, departmentId, scheduledAt, durationMinutes, reason } = req.body;

  const patient = await patientModel.findById(patientId);
  if (!patient) throw ApiError.badRequest('patientId does not match an existing patient.');
  if (!patient.is_active) throw ApiError.badRequest('This patient record is deactivated.');

  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) throw ApiError.badRequest('doctorId does not match an existing doctor.');

  const duration = durationMinutes || 30;
  const conflict = await appointmentModel.hasConflict(doctorId, scheduledAt, duration);
  if (conflict) {
    throw ApiError.conflict('This doctor already has an appointment that overlaps this time slot.');
  }

  const appointment = await appointmentModel.create({
    patientId,
    doctorId,
    departmentId,
    scheduledAt,
    durationMinutes: duration,
    reason,
    bookedBy: req.user.id,
  });

  await logAction({
    req,
    action: 'APPOINTMENT_CREATED',
    entityType: 'appointment',
    entityId: appointment.id,
    metadata: { patientId, doctorId, scheduledAt },
  });

  await notify({
    userId: doctor.user_id,
    type: 'appointment_reminder',
    title: 'New appointment booked',
    message: `${patient.first_name} ${patient.last_name} is scheduled with you on ${new Date(scheduledAt).toLocaleString()}.`,
    referenceType: 'appointment',
    referenceId: appointment.id,
  });

  new ApiResponse(201, 'Appointment booked successfully', appointment).send(res);
});

/** PATCH /appointments/:id/reschedule - receptionist or admin */
const rescheduleAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await appointmentModel.findById(id);
  if (!existing) throw ApiError.notFound('Appointment not found.');

  if (['completed', 'cancelled'].includes(existing.status)) {
    throw ApiError.badRequest(`A ${existing.status} appointment cannot be rescheduled.`);
  }

  const { scheduledAt, durationMinutes } = req.body;
  const duration = durationMinutes || existing.duration_minutes;

  const conflict = await appointmentModel.hasConflict(existing.doctor_id, scheduledAt, duration, id);
  if (conflict) {
    throw ApiError.conflict('This doctor already has an appointment that overlaps this time slot.');
  }

  const appointment = await appointmentModel.reschedule(id, { scheduledAt, durationMinutes: duration });

  await logAction({
    req,
    action: 'APPOINTMENT_RESCHEDULED',
    entityType: 'appointment',
    entityId: Number(id),
    metadata: { scheduledAt, durationMinutes: duration },
  });

  new ApiResponse(200, 'Appointment rescheduled successfully', appointment).send(res);
});

/** PATCH /appointments/:id/cancel - receptionist or admin */
const cancelAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await appointmentModel.findById(id);
  if (!existing) throw ApiError.notFound('Appointment not found.');

  if (['completed', 'cancelled'].includes(existing.status)) {
    throw ApiError.badRequest(`This appointment is already ${existing.status}.`);
  }

  const appointment = await appointmentModel.updateStatus(id, 'cancelled', req.body.cancellationReason || null);

  await logAction({
    req,
    action: 'APPOINTMENT_CANCELLED',
    entityType: 'appointment',
    entityId: Number(id),
    metadata: { reason: req.body.cancellationReason },
  });

  new ApiResponse(200, 'Appointment cancelled successfully', appointment).send(res);
});

/**
 * PATCH /appointments/:id/status - admin, receptionist, nurse (check-in),
 * or the assigned doctor (complete / no-show their own appointment).
 */
const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const existing = await appointmentModel.findById(id);
  if (!existing) throw ApiError.notFound('Appointment not found.');

  if (req.user.role === ROLES.DOCTOR) {
    const ownDoctorProfile = await doctorModel.findByUserId(req.user.id);
    if (!ownDoctorProfile || ownDoctorProfile.id !== existing.doctor_id) {
      throw ApiError.forbidden('You can only update the status of your own appointments.');
    }
  }

  if (['completed', 'cancelled'].includes(existing.status)) {
    throw ApiError.badRequest(`A ${existing.status} appointment's status can no longer be changed.`);
  }

  const appointment = await appointmentModel.updateStatus(id, status);

  await logAction({
    req,
    action: 'APPOINTMENT_STATUS_UPDATED',
    entityType: 'appointment',
    entityId: Number(id),
    metadata: { from: existing.status, to: status },
  });

  new ApiResponse(200, 'Appointment status updated successfully', appointment).send(res);
});

module.exports = {
  listAppointments,
  getAppointment,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  updateAppointmentStatus,
};
