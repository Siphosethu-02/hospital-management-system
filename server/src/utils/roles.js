// src/utils/roles.js
// Single source of truth for user roles. Must stay in sync with the
// `roles` table seeded in database/seed.sql.
//
// STAFF_ROLES vs ALL_ROLES: patient accounts are NEVER created or
// edited through the staff-management endpoints (POST /auth/register,
// PATCH /users/:id) - they're created only via the dedicated
// patient-portal-access flow (POST /patients/:id/portal-access) or the
// seed script. Keeping "patient" out of the staff role allowlists means
// an admin can never accidentally set a staff member's role to
// "patient" (or vice versa) through the generic Users screen, which
// isn't built to handle a patient account's different shape (no
// department, no doctor profile, linked 1:1 to a `patients` row
// instead). ALL_ROLES is for places that genuinely mean "any role in
// the system" (e.g. RBAC checks); STAFF_ROLES is for staff-account
// creation/editing forms specifically.

const ROLES = Object.freeze({
  ADMIN: 'admin',
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  RECEPTIONIST: 'receptionist',
  PHARMACIST: 'pharmacist',
  LAB_STAFF: 'lab_staff',
  PATIENT: 'patient',
});

const ALL_ROLES = Object.values(ROLES);
const STAFF_ROLES = ALL_ROLES.filter((r) => r !== ROLES.PATIENT);

module.exports = { ROLES, ALL_ROLES, STAFF_ROLES };
