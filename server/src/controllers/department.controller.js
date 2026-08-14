// src/controllers/department.controller.js

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const departmentModel = require('../models/department.model');
const doctorModel = require('../models/doctor.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');

const SORTABLE_COLUMNS = ['name', 'created_at', 'updated_at'];

/** GET /departments - any authenticated staff member (used for dropdowns, filters, etc.) */
const listDepartments = asyncHandler(async (req, res) => {
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, SORTABLE_COLUMNS, 'name');
  const { search } = req.query;
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

  const { rows, total } = await departmentModel.list({ search, isActive, sortBy, order, limit, offset });

  new ApiResponse(200, 'Departments retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /departments/all - unpaginated, active-only list for <select> dropdowns */
const listAllActiveDepartments = asyncHandler(async (req, res) => {
  const departments = await departmentModel.listAllActive();
  new ApiResponse(200, 'Active departments retrieved', departments).send(res);
});

/** GET /departments/:id */
const getDepartment = asyncHandler(async (req, res) => {
  const department = await departmentModel.findById(req.params.id);
  if (!department) throw ApiError.notFound('Department not found.');
  new ApiResponse(200, 'Department retrieved', department).send(res);
});

/**
 * POST /departments - admin only.
 * `doctorIds` (at least one) is required - a department can never be
 * created without a doctor assigned to it. Since a doctor can only
 * belong to one department at a time (doctors.department_id is a
 * single FK, not many-to-many), assigning an existing doctor here
 * moves them out of whatever department they were in before - that's
 * intentional (hospitals do reassign doctors), not a bug.
 */
const createDepartment = asyncHandler(async (req, res) => {
  const { name, description, headDoctorId, doctorIds } = req.body;

  if (await departmentModel.findByName(name)) {
    throw ApiError.conflict('A department with this name already exists.');
  }

  if (headDoctorId) {
    const doctor = await doctorModel.findById(headDoctorId);
    if (!doctor) throw ApiError.badRequest('headDoctorId does not match an existing doctor.');
  }

  const doctors = [];
  for (const doctorId of doctorIds) {
    const doctor = await doctorModel.findById(doctorId);
    if (!doctor) throw ApiError.badRequest(`doctorIds contains ${doctorId}, which does not match an existing doctor.`);
    doctors.push(doctor);
  }

  const department = await departmentModel.create({ name, description, headDoctorId });

  for (const doctor of doctors) {
    await doctorModel.setDepartment(doctor.id, department.id);
  }

  const withDoctors = await departmentModel.findById(department.id);

  await logAction({
    req,
    action: 'DEPARTMENT_CREATED',
    entityType: 'department',
    entityId: department.id,
    metadata: { name, doctorIds },
  });

  new ApiResponse(201, 'Department created successfully', withDoctors).send(res);
});

/** PATCH /departments/:id - admin only */
const updateDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await departmentModel.findById(id);
  if (!existing) throw ApiError.notFound('Department not found.');

  const { name, description, headDoctorId, isActive } = req.body;

  if (name && name !== existing.name) {
    const clash = await departmentModel.findByName(name);
    if (clash) throw ApiError.conflict('A department with this name already exists.');
  }

  if (headDoctorId) {
    const doctor = await doctorModel.findById(headDoctorId);
    if (!doctor) throw ApiError.badRequest('headDoctorId does not match an existing doctor.');
  }

  const fields = {};
  if (name !== undefined) fields.name = name;
  if (description !== undefined) fields.description = description;
  if (headDoctorId !== undefined) fields.head_doctor_id = headDoctorId;
  if (isActive !== undefined) fields.is_active = isActive;

  const department = await departmentModel.update(id, fields);

  await logAction({
    req,
    action: 'DEPARTMENT_UPDATED',
    entityType: 'department',
    entityId: Number(id),
    metadata: fields,
  });

  new ApiResponse(200, 'Department updated successfully', department).send(res);
});

/** DELETE /departments/:id - admin only */
const deleteDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await departmentModel.findById(id);
  if (!existing) throw ApiError.notFound('Department not found.');

  if (Number(existing.doctor_count) > 0) {
    throw ApiError.badRequest(
      'This department still has doctors assigned to it. Reassign them before deleting.'
    );
  }

  await departmentModel.remove(id);

  await logAction({ req, action: 'DEPARTMENT_DELETED', entityType: 'department', entityId: Number(id) });

  new ApiResponse(200, 'Department deleted successfully').send(res);
});

/**
 * POST /departments/:id/doctors - admin only. Assigns an existing
 * doctor to this department - the "add another doctor to the same
 * department" action. Moves the doctor here even if they already
 * belonged to a different department (see the createDepartment note
 * above on why that's expected).
 */
const assignDoctor = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { doctorId } = req.body;

  const department = await departmentModel.findById(id);
  if (!department) throw ApiError.notFound('Department not found.');

  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) throw ApiError.badRequest('doctorId does not match an existing doctor.');

  if (Number(doctor.department_id) === Number(id)) {
    throw ApiError.conflict('This doctor is already assigned to this department.');
  }

  await doctorModel.setDepartment(doctorId, id);
  const updated = await departmentModel.findById(id);

  await logAction({
    req, action: 'DEPARTMENT_DOCTOR_ASSIGNED', entityType: 'department', entityId: Number(id),
    metadata: { doctorId, previousDepartmentId: doctor.department_id },
  });

  new ApiResponse(200, 'Doctor assigned to department successfully', updated).send(res);
});

/** DELETE /departments/:id/doctors/:doctorId - admin only. Unassigns a doctor from this department. */
const unassignDoctor = asyncHandler(async (req, res) => {
  const { id, doctorId } = req.params;

  const department = await departmentModel.findById(id);
  if (!department) throw ApiError.notFound('Department not found.');

  const doctor = await doctorModel.findById(doctorId);
  if (!doctor || Number(doctor.department_id) !== Number(id)) {
    throw ApiError.badRequest('This doctor is not currently assigned to this department.');
  }

  await doctorModel.setDepartment(doctorId, null);
  const updated = await departmentModel.findById(id);

  await logAction({
    req, action: 'DEPARTMENT_DOCTOR_UNASSIGNED', entityType: 'department', entityId: Number(id),
    metadata: { doctorId },
  });

  new ApiResponse(200, 'Doctor removed from department successfully', updated).send(res);
});

module.exports = {
  listDepartments,
  listAllActiveDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  assignDoctor,
  unassignDoctor,
};
