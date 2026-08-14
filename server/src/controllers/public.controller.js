// src/controllers/public.controller.js
// Unauthenticated, read-only endpoints for the public marketing site
// (Home/About/Services/Departments/Doctors/Contact). Deliberately
// reuses existing models but only ever returns active records and
// non-sensitive fields - no emails, phone numbers, or internal ids
// beyond what's needed to render a directory page.

const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const departmentModel = require('../models/department.model');
const doctorModel = require('../models/doctor.model');

/** GET /public/departments */
const listPublicDepartments = asyncHandler(async (req, res) => {
  const departments = await departmentModel.listAllActive();
  new ApiResponse(200, 'Departments retrieved', departments).send(res);
});

/** GET /public/doctors */
const listPublicDoctors = asyncHandler(async (req, res) => {
  const { search, departmentId } = req.query;
  const { rows } = await doctorModel.list({
    search, departmentId, isActive: true, sortBy: 'last_name', order: 'ASC', limit: 100, offset: 0,
  });

  const publicRows = rows.map((d) => ({
    id: d.id,
    firstName: d.first_name,
    lastName: d.last_name,
    specialization: d.specialization,
    qualification: d.qualification,
    yearsOfExperience: d.years_of_experience,
    bio: d.bio,
    departmentName: d.department_name,
    avatarUrl: d.avatar_url,
  }));

  new ApiResponse(200, 'Doctors retrieved', publicRows).send(res);
});

module.exports = { listPublicDepartments, listPublicDoctors };
