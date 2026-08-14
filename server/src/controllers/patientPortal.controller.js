// src/controllers/patientPortal.controller.js
// Self-service endpoints for the "patient" role. Every handler in this
// file follows one non-negotiable rule: the patient record acted on is
// ALWAYS resolved from the authenticated user's own identity
// (patients.user_id -> req.user.id), never from a client-supplied
// patientId/:id in the URL, query string, or request body. Where a
// specific record id IS taken from the URL (a medical record, a
// prescription, an appointment), the handler re-fetches that record and
// checks its patient_id against the caller's own patient id before
// returning anything - a mismatch is reported as 404, not 403, so a
// patient probing another patient's id can't even learn whether that id
// exists.
//
// Every model call below reuses the exact same model functions the
// staff-facing controllers use (appointmentModel, medicalRecordModel,
// prescriptionModel, labTestModel, labResultModel) - there is no
// parallel/duplicate business logic here, only a different,
// self-scoped entry point into it.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const patientModel = require('../models/patient.model');
const doctorModel = require('../models/doctor.model');
const appointmentModel = require('../models/appointment.model');
const medicalRecordModel = require('../models/medicalRecord.model');
const prescriptionModel = require('../models/prescription.model');
const labTestModel = require('../models/labTest.model');
const labResultModel = require('../models/labResult.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');
const { notify } = require('../utils/notify');

/** Resolves the patient record linked to the logged-in user, or 404s. */
async function requireOwnPatientRecord(req) {
  const patient = await patientModel.findByUserId(req.user.id);
  if (!patient) {
    throw ApiError.notFound('No patient record is linked to this account. Contact reception for help.');
  }
  return patient;
}

// -----------------------------------------------------------------------
// Profile
// -----------------------------------------------------------------------

/** GET /patient/profile */
const getMyProfile = asyncHandler(async (req, res) => {
  const patient = await requireOwnPatientRecord(req);
  new ApiResponse(200, 'Profile retrieved', patient).send(res);
});

// Only contact-type fields are patient-editable. Clinical fields
// (allergies, chronic conditions, blood group), identity fields (name,
// date of birth), and administrative fields (insurance) stay
// staff-controlled - a patient self-editing their own allergy list or
// date of birth would undermine the record's reliability for the care
// team, so those still go through reception/admin via PATCH /patients/:id.
const SAFE_SELF_EDIT_FIELDS = {
  phone: 'phone',
  email: 'email',
  address: 'address',
  city: 'city',
  emergencyContactName: 'emergency_contact_name',
  emergencyContactPhone: 'emergency_contact_phone',
  emergencyContactRelation: 'emergency_contact_relation',
};

/** PATCH /patient/profile */
const updateMyProfile = asyncHandler(async (req, res) => {
  const patient = await requireOwnPatientRecord(req);

  const fields = {};
  for (const [bodyKey, column] of Object.entries(SAFE_SELF_EDIT_FIELDS)) {
    if (req.body[bodyKey] !== undefined) fields[column] = req.body[bodyKey];
  }

  const updated = await patientModel.update(patient.id, fields);

  await logAction({
    req, action: 'PATIENT_SELF_UPDATED_PROFILE', entityType: 'patient', entityId: patient.id,
    metadata: { fields: Object.keys(fields) },
  });

  new ApiResponse(200, 'Profile updated successfully', updated).send(res);
});

// -----------------------------------------------------------------------
// Appointments
// -----------------------------------------------------------------------

/** GET /patient/appointments - supports ?status=&page=&limit=&sortBy=&order= */
const listMyAppointments = asyncHandler(async (req, res) => {
  const patient = await requireOwnPatientRecord(req);
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, ['scheduled_at', 'created_at', 'status'], 'scheduled_at');
  const { status } = req.query;

  const { rows, total } = await appointmentModel.list({
    patientId: patient.id, status, sortBy, order, limit, offset,
  });

  new ApiResponse(200, 'Appointments retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/**
 * GET /patient/appointments/available-slots?doctorId=&date=YYYY-MM-DD
 * Thin pass-through to the same slot generator the staff booking screen
 * uses (appointmentModel.getAvailableSlots) - no separate availability
 * logic. A patient could already reach this same computation via
 * GET /doctors/:id/available-slots (open to any authenticated role);
 * this endpoint just gives the patient portal its own, spec-shaped URL.
 */
const getAvailableSlots = asyncHandler(async (req, res) => {
  const { doctorId, date } = req.query;

  if (!doctorId) throw ApiError.badRequest('doctorId is required.');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw ApiError.badRequest('A valid date=YYYY-MM-DD query parameter is required.');
  }

  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) throw ApiError.notFound('Doctor not found.');

  const slots = await appointmentModel.getAvailableSlots(doctorId, date);
  new ApiResponse(200, 'Available slots retrieved', slots).send(res);
});

/**
 * POST /patient/appointments
 * body: { doctorId, scheduledAt, reason }
 * patientId and departmentId are intentionally NOT accepted from the
 * client - patientId comes from the authenticated user's own linked
 * patient record, departmentId is derived from the doctor's own
 * department, so a patient can never book "as" another patient or
 * mis-tag an appointment's department.
 */
const bookMyAppointment = asyncHandler(async (req, res) => {
  const patient = await requireOwnPatientRecord(req);
  const { doctorId, scheduledAt, reason } = req.body;

  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) throw ApiError.badRequest('doctorId does not match an existing doctor.');

  const duration = 30;
  const conflict = await appointmentModel.hasConflict(doctorId, scheduledAt, duration);
  if (conflict) {
    throw ApiError.conflict('This slot is no longer available. Please choose another time.');
  }

  const appointment = await appointmentModel.create({
    patientId: patient.id,
    doctorId,
    departmentId: doctor.department_id,
    scheduledAt,
    durationMinutes: duration,
    reason,
    bookedBy: req.user.id,
  });

  await logAction({
    req, action: 'APPOINTMENT_SELF_BOOKED', entityType: 'appointment', entityId: appointment.id,
    metadata: { doctorId, scheduledAt },
  });

  await notify({
    userId: doctor.user_id,
    type: 'appointment_reminder',
    title: 'New appointment booked',
    message: `${patient.first_name} ${patient.last_name} booked an appointment with you on ${new Date(appointment.scheduled_at).toLocaleString()}.`,
    referenceType: 'appointment',
    referenceId: appointment.id,
  });

  new ApiResponse(201, 'Appointment booked successfully', appointment).send(res);
});

/** PATCH /patient/appointments/:id/cancel */
const cancelMyAppointment = asyncHandler(async (req, res) => {
  const patient = await requireOwnPatientRecord(req);
  const { id } = req.params;

  const existing = await appointmentModel.findById(id);
  // 404, not 403, for a mismatched owner - see file header.
  if (!existing || existing.patient_id !== patient.id) {
    throw ApiError.notFound('Appointment not found.');
  }
  if (['completed', 'cancelled'].includes(existing.status)) {
    throw ApiError.badRequest(`This appointment is already ${existing.status}.`);
  }

  const appointment = await appointmentModel.updateStatus(id, 'cancelled', req.body.cancellationReason || null);

  await logAction({ req, action: 'APPOINTMENT_SELF_CANCELLED', entityType: 'appointment', entityId: Number(id) });

  new ApiResponse(200, 'Appointment cancelled successfully', appointment).send(res);
});

// -----------------------------------------------------------------------
// Medical records (read-only)
// -----------------------------------------------------------------------

/** GET /patient/medical-records */
const listMyMedicalRecords = asyncHandler(async (req, res) => {
  const patient = await requireOwnPatientRecord(req);
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, ['created_at', 'follow_up_date'], 'created_at');

  const { rows, total } = await medicalRecordModel.list({ patientId: patient.id, sortBy, order, limit, offset });
  new ApiResponse(200, 'Medical records retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /patient/medical-records/:id */
const getMyMedicalRecord = asyncHandler(async (req, res) => {
  const patient = await requireOwnPatientRecord(req);
  const record = await medicalRecordModel.findById(req.params.id);

  if (!record || record.patient_id !== patient.id) {
    throw ApiError.notFound('Medical record not found.');
  }

  const attachments = await medicalRecordModel.listAttachments(record.id);
  new ApiResponse(200, 'Medical record retrieved', { ...record, attachments }).send(res);
});

// -----------------------------------------------------------------------
// Prescriptions (read-only)
// -----------------------------------------------------------------------

/** GET /patient/prescriptions */
const listMyPrescriptions = asyncHandler(async (req, res) => {
  const patient = await requireOwnPatientRecord(req);
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, ['created_at', 'status'], 'created_at');
  const { status } = req.query;

  const { rows, total } = await prescriptionModel.list({ patientId: patient.id, status, sortBy, order, limit, offset });
  new ApiResponse(200, 'Prescriptions retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /patient/prescriptions/:id */
const getMyPrescription = asyncHandler(async (req, res) => {
  const patient = await requireOwnPatientRecord(req);
  const prescription = await prescriptionModel.findById(req.params.id);

  if (!prescription || prescription.patient_id !== patient.id) {
    throw ApiError.notFound('Prescription not found.');
  }

  new ApiResponse(200, 'Prescription retrieved', prescription).send(res);
});

// -----------------------------------------------------------------------
// Laboratory results (read-only, completed tests only)
// -----------------------------------------------------------------------

/** GET /patient/lab-results */
const listMyLabResults = asyncHandler(async (req, res) => {
  const patient = await requireOwnPatientRecord(req);
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, ['requested_at'], 'requested_at');

  // Patients only ever see completed tests with a result attached - a
  // pending/in-progress request isn't clinically meaningful to show
  // without the ordering doctor's interpretation.
  const { rows, total } = await labTestModel.list({
    patientId: patient.id, status: 'completed', sortBy, order, limit, offset,
  });

  const withResults = await Promise.all(
    rows.map(async (test) => ({ ...test, result: await labResultModel.findByTestId(test.id) }))
  );

  new ApiResponse(200, 'Lab results retrieved', withResults, buildMeta(total, page, limit)).send(res);
});

module.exports = {
  getMyProfile,
  updateMyProfile,
  listMyAppointments,
  getAvailableSlots,
  bookMyAppointment,
  cancelMyAppointment,
  listMyMedicalRecords,
  getMyMedicalRecord,
  listMyPrescriptions,
  getMyPrescription,
  listMyLabResults,
};
