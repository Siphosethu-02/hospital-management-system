// src/controllers/doctor.controller.js
// Public/staff doctor directory (specialization, department, bio, fee)
// plus weekly availability management, which the appointment scheduler
// reads to compute open slots.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const doctorModel = require('../models/doctor.model');
const availabilityModel = require('../models/doctorAvailability.model');
const appointmentModel = require('../models/appointment.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');
const { ROLES } = require('../utils/roles');

const SORTABLE_COLUMNS = ['first_name', 'last_name', 'created_at'];

/** GET /doctors - directory listing. Supports ?search=&departmentId=&isActive=&page=&limit= */
const listDoctors = asyncHandler(async (req, res) => {
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, SORTABLE_COLUMNS, 'last_name');
  const { search, departmentId } = req.query;
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

  const { rows, total } = await doctorModel.list({ search, departmentId, isActive, sortBy, order, limit, offset });

  new ApiResponse(200, 'Doctors retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /doctors/:id */
const getDoctor = asyncHandler(async (req, res) => {
  const doctor = await doctorModel.findDirectoryProfileById(req.params.id);
  if (!doctor) throw ApiError.notFound('Doctor not found.');
  new ApiResponse(200, 'Doctor retrieved', doctor).send(res);
});

/**
 * Shared ownership check for every availability-mutating endpoint: an
 * admin can manage any doctor's schedule; a doctor can only manage
 * their own. Returns the doctor row (throws 404/403 otherwise) so
 * callers don't have to fetch it twice.
 */
async function requireDoctorAndOwnership(req, doctorId) {
  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) throw ApiError.notFound('Doctor not found.');

  if (req.user.role === ROLES.DOCTOR && doctor.user_id !== req.user.id) {
    throw ApiError.forbidden('You can only manage your own availability.');
  }

  return doctor;
}

/** GET /doctors/:id/availability - weekly recurring schedule (active + inactive, for the management UI) */
const getAvailability = asyncHandler(async (req, res) => {
  const doctor = await doctorModel.findById(req.params.id);
  if (!doctor) throw ApiError.notFound('Doctor not found.');

  const availability = await availabilityModel.listByDoctor(req.params.id);
  new ApiResponse(200, 'Availability retrieved', availability).send(res);
});

/**
 * POST /doctors/:id/availability - admin, or the doctor managing their
 * own schedule. Rejects a new window that overlaps an existing active
 * one on the same day (a doctor can't be in two places at once, and an
 * overlap would make slot generation double-count that time).
 */
const addAvailability = asyncHandler(async (req, res) => {
  const doctorId = req.params.id;
  await requireDoctorAndOwnership(req, doctorId);

  const { dayOfWeek, startTime, endTime, slotMinutes, isActive } = req.body;

  const overlap = await availabilityModel.hasOverlap(doctorId, dayOfWeek, startTime, endTime);
  if (overlap) {
    throw ApiError.conflict('This overlaps an existing availability window on that day.');
  }

  const slot = await availabilityModel.create({ doctorId, dayOfWeek, startTime, endTime, slotMinutes, isActive });

  await logAction({
    req,
    action: 'DOCTOR_AVAILABILITY_ADDED',
    entityType: 'doctor',
    entityId: Number(doctorId),
    metadata: { dayOfWeek, startTime, endTime },
  });

  new ApiResponse(201, 'Availability slot added', slot).send(res);
});

/**
 * PATCH /doctors/:id/availability/:availabilityId - admin, or the
 * doctor managing their own schedule. Supports partial updates (e.g.
 * just flipping isActive) - merges the patch onto the existing row
 * before validating the end result, so a partial update can never leave
 * the window in an inconsistent state (end before start, or newly
 * overlapping another window).
 */
const updateAvailability = asyncHandler(async (req, res) => {
  const { id: doctorId, availabilityId } = req.params;
  await requireDoctorAndOwnership(req, doctorId);

  const existing = await availabilityModel.findById(availabilityId);
  if (!existing || Number(existing.doctor_id) !== Number(doctorId)) {
    throw ApiError.notFound('Availability slot not found.');
  }

  const dayOfWeek = req.body.dayOfWeek !== undefined ? req.body.dayOfWeek : existing.day_of_week;
  const startTime = req.body.startTime || existing.start_time.slice(0, 5);
  const endTime = req.body.endTime || existing.end_time.slice(0, 5);

  if (endTime <= startTime) {
    throw ApiError.badRequest('endTime must be after startTime.');
  }

  const isActive = req.body.isActive !== undefined ? req.body.isActive : !!existing.is_active;

  if (isActive) {
    const overlap = await availabilityModel.hasOverlap(doctorId, dayOfWeek, startTime, endTime, availabilityId);
    if (overlap) {
      throw ApiError.conflict('This overlaps an existing availability window on that day.');
    }
  }

  const updated = await availabilityModel.update(availabilityId, {
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
    slot_minutes: req.body.slotMinutes !== undefined ? req.body.slotMinutes : existing.slot_minutes,
    is_active: isActive ? 1 : 0,
  });

  await logAction({
    req,
    action: 'DOCTOR_AVAILABILITY_UPDATED',
    entityType: 'doctor',
    entityId: Number(doctorId),
    metadata: { availabilityId, dayOfWeek, startTime, endTime, isActive },
  });

  new ApiResponse(200, 'Availability slot updated', updated).send(res);
});

/** DELETE /doctors/:id/availability/:availabilityId */
const removeAvailability = asyncHandler(async (req, res) => {
  const { id: doctorId, availabilityId } = req.params;
  await requireDoctorAndOwnership(req, doctorId);

  const slot = await availabilityModel.findById(availabilityId);
  if (!slot || Number(slot.doctor_id) !== Number(doctorId)) {
    throw ApiError.notFound('Availability slot not found.');
  }

  await availabilityModel.remove(availabilityId);

  await logAction({
    req,
    action: 'DOCTOR_AVAILABILITY_REMOVED',
    entityType: 'doctor',
    entityId: Number(doctorId),
    metadata: { availabilityId },
  });

  new ApiResponse(200, 'Availability slot removed').send(res);
});

/** GET /doctors/:id/available-slots?date=YYYY-MM-DD - used by the booking screen */
const getAvailableSlots = asyncHandler(async (req, res) => {
  const doctorId = req.params.id;
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw ApiError.badRequest('A valid ?date=YYYY-MM-DD query parameter is required.');
  }

  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) throw ApiError.notFound('Doctor not found.');

  const slots = await appointmentModel.getAvailableSlots(doctorId, date);
  new ApiResponse(200, 'Available slots retrieved', slots).send(res);
});

module.exports = {
  listDoctors,
  getDoctor,
  getAvailability,
  addAvailability,
  updateAvailability,
  removeAvailability,
  getAvailableSlots,
};
