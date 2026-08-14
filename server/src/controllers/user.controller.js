// src/controllers/user.controller.js
// Admin "Manage Users" screen, plus self-service profile endpoints
// (GET /auth/me already covers "view own profile" from Stage 1).

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const userModel = require('../models/user.model');
const doctorModel = require('../models/doctor.model');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { logAction } = require('../utils/audit');
const { ROLES } = require('../utils/roles');

const SORTABLE_COLUMNS = ['first_name', 'last_name', 'email', 'created_at', 'last_login_at'];

function sanitize(user) {
  if (!user) return user;
  const { password_hash, token_version, ...safe } = user;
  return safe;
}

/** GET /users - admin only. Supports ?search=&role=&isActive=&page=&limit=&sortBy=&order= */
const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset, sortBy, order } = parsePagination(req.query, SORTABLE_COLUMNS, 'created_at');
  const { search, role } = req.query;
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

  const { rows, total } = await userModel.list({ search, role, isActive, sortBy, order, limit, offset });

  new ApiResponse(200, 'Users retrieved', rows, buildMeta(total, page, limit)).send(res);
});

/** GET /users/:id - admin only */
const getUser = asyncHandler(async (req, res) => {
  const user = await userModel.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found.');

  let doctorProfile = null;
  if (user.role_name === ROLES.DOCTOR) {
    doctorProfile = await doctorModel.findByUserId(user.id);
  }

  new ApiResponse(200, 'User retrieved', { ...sanitize(user), doctorProfile }).send(res);
});

/**
 * PATCH /users/:id - admin only.
 * Handles name/phone/role/active-status changes, and - when the role is
 * or becomes "doctor" - bridges the nested `doctorProfile` object into
 * the `doctors` table (creating the 1:1 row on first promotion).
 */
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const target = await userModel.findById(id);
  if (!target) throw ApiError.notFound('User not found.');

  const { firstName, lastName, phone, role, isActive, doctorProfile } = req.body;

  // Prevent an admin from locking themselves out.
  if (Number(id) === req.user.id && isActive === false) {
    throw ApiError.badRequest('You cannot deactivate your own account.');
  }
  if (Number(id) === req.user.id && role !== undefined && role !== req.user.role) {
    throw ApiError.badRequest('You cannot change your own role.');
  }

  let roleId;
  if (role !== undefined) {
    const roleRecord = await userModel.findRoleByName(role);
    if (!roleRecord) throw ApiError.badRequest(`Unknown role: ${role}`);
    roleId = roleRecord.id;
  }

  const updated = await userModel.updateAsAdmin(id, { firstName, lastName, phone, roleId, isActive });

  const becomingDoctor = role === ROLES.DOCTOR || (role === undefined && target.role_name === ROLES.DOCTOR);
  let profile = null;

  if (becomingDoctor) {
    profile = await doctorModel.findByUserId(id);
    if (!profile) {
      profile = await doctorModel.createMinimal(id, doctorProfile && doctorProfile.departmentId);
    }
    if (doctorProfile) {
      profile = await doctorModel.updateProfile(id, {
        department_id: doctorProfile.departmentId,
        specialization: doctorProfile.specialization,
        qualification: doctorProfile.qualification,
        license_number: doctorProfile.licenseNumber,
        years_of_experience: doctorProfile.yearsOfExperience,
        consultation_fee: doctorProfile.consultationFee,
        bio: doctorProfile.bio,
        room_number: doctorProfile.roomNumber,
      });
    }
  }

  await logAction({
    req,
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: Number(id),
    metadata: { firstName, lastName, phone, role, isActive },
  });

  new ApiResponse(200, 'User updated successfully', { ...sanitize(updated), doctorProfile: profile }).send(res);
});

/** PATCH /users/:id/deactivate - admin only. Also invalidates all of their active sessions. */
const deactivateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.id) {
    throw ApiError.badRequest('You cannot deactivate your own account.');
  }

  const target = await userModel.findById(id);
  if (!target) throw ApiError.notFound('User not found.');

  const updated = await userModel.setActive(id, false);
  await logAction({ req, action: 'USER_DEACTIVATED', entityType: 'user', entityId: Number(id) });

  new ApiResponse(200, 'User deactivated successfully', sanitize(updated)).send(res);
});

/** PATCH /users/:id/activate - admin only */
const activateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const target = await userModel.findById(id);
  if (!target) throw ApiError.notFound('User not found.');

  const updated = await userModel.setActive(id, true);
  await logAction({ req, action: 'USER_ACTIVATED', entityType: 'user', entityId: Number(id) });

  new ApiResponse(200, 'User activated successfully', sanitize(updated)).send(res);
});

/** DELETE /users/:id - admin only. Prefer deactivation; this is for accidental/duplicate accounts. */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.id) {
    throw ApiError.badRequest('You cannot delete your own account.');
  }

  const target = await userModel.findById(id);
  if (!target) throw ApiError.notFound('User not found.');

  try {
    await userModel.remove(id);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      throw ApiError.badRequest(
        'This user has related records (appointments, medical records, etc.) and cannot be permanently deleted. Deactivate the account instead.'
      );
    }
    throw err;
  }

  await logAction({ req, action: 'USER_DELETED', entityType: 'user', entityId: Number(id) });

  new ApiResponse(200, 'User deleted successfully').send(res);
});

/** PATCH /users/me - any authenticated user updates their own basic profile */
const updateOwnProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, phone } = req.body;
  const updated = await userModel.updateProfile(req.user.id, { firstName, lastName, phone });
  new ApiResponse(200, 'Profile updated successfully', sanitize(updated)).send(res);
});

/** POST /users/me/avatar - any authenticated user uploads their own avatar */
const uploadOwnAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No avatar file was uploaded.');

  const avatarUrl = `/uploads/misc/${req.file.filename}`;
  const updated = await userModel.updateProfile(req.user.id, { avatarUrl });

  new ApiResponse(200, 'Avatar updated successfully', sanitize(updated)).send(res);
});

module.exports = {
  listUsers,
  getUser,
  updateUser,
  deactivateUser,
  activateUser,
  deleteUser,
  updateOwnProfile,
  uploadOwnAvatar,
};
