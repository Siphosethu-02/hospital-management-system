// src/firebase/firestoreUtils.js
// Shared helpers used by every collection's service module.

import { Timestamp, serverTimestamp } from 'firebase/firestore';

export { serverTimestamp };

/** Firestore Timestamp -> JS Date, tolerant of already-a-Date or null/undefined. */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

/** JS Date/string -> Firestore Timestamp, for writes. */
export function toTimestamp(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  return Timestamp.fromDate(value instanceof Date ? value : new Date(value));
}

/** Spreads a QueryDocumentSnapshot into a plain object with its id attached. */
export function docToObject(docSnap) {
  return { id: docSnap.id, ...docSnap.data() };
}

export function querySnapshotToArray(querySnap) {
  return querySnap.docs.map(docToObject);
}

/**
 * Client-side search + sort + pagination over an already-fetched batch
 * of documents.
 *
 * WHY CLIENT-SIDE, NOT CURSOR-BASED FIRESTORE PAGINATION: this project
 * is sized for a single hospital's demo/small-scale dataset (dozens to
 * low hundreds of records per collection), the same scale already
 * acknowledged as a limitation for the Reports module in
 * FIRESTORE_SCHEMA.md. Firestore's real pagination primitive is
 * cursor-based (startAfter(lastDoc)), which doesn't support "jump to
 * page 4" the way the existing DataTable UI does - reworking that UI
 * to a cursor/"load more" model was out of scope for this migration
 * pass. At this project's scale, fetching a capped batch (see
 * FETCH_CAP below) and paginating/sorting/searching it in memory costs
 * one Firestore query per list view instead of one per page, which is
 * actually MORE efficient against the free tier's daily read quota,
 * not less - the tradeoff only turns negative once a collection
 * genuinely exceeds a few thousand documents, which is explicitly
 * flagged in the README's limitations section.
 */
const FETCH_CAP = 500;

export function paginateClientSide(rows, { page = 1, limit = 10, sortBy, order = 'ASC', search, searchFields = [] } = {}) {
  let filtered = rows;

  if (search && searchFields.length > 0) {
    const q = search.toLowerCase();
    filtered = filtered.filter((row) =>
      searchFields.some((field) => String(row[field] ?? '').toLowerCase().includes(q))
    );
  }

  if (sortBy) {
    filtered = [...filtered].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return order === 'DESC' ? -cmp : cmp;
    });
  }

  const total = filtered.length;
  const start = (page - 1) * limit;
  const pageRows = filtered.slice(start, start + limit).map(withLegacyAliases);

  return {
    data: pageRows,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export { FETCH_CAP };

// -----------------------------------------------------------------------
// Legacy field-name aliasing
// -----------------------------------------------------------------------
// Every existing page component (25 of them, audited directly) reads
// fields the OLD SQL/Express version returned in snake_case
// (first_name, patient_code, department_name, doctor_first_name, ...).
// Firestore documents here use idiomatic camelCase instead. Rather than
// rewrite 25 page files - which is exactly the kind of unnecessary,
// error-prone churn this whole migration has deliberately avoided
// everywhere else (see the same reasoning for the `role_name` alias in
// auth.service.js) - every service function wraps its return value
// through withLegacyAliases() below, so both spellings are always
// present and every existing page keeps working unmodified.

const DIRECT_ALIASES = {
  firstName: 'first_name',
  lastName: 'last_name',
  isActive: 'is_active',
  patientCode: 'patient_code',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  departmentName: 'department_name',
  treatmentPlan: 'treatment_plan',
  followUpDate: 'follow_up_date',
  medicineName: 'medicine_name',
  emergencyContactName: 'emergency_contact_name',
  emergencyContactPhone: 'emergency_contact_phone',
  emergencyContactRelation: 'emergency_contact_relation',
  dateOfBirth: 'date_of_birth',
  bloodGroup: 'blood_group',
  unitPrice: 'unit_price',
  requestedAt: 'requested_at',
  isDispensed: 'is_dispensed',
  insuranceProvider: 'insurance_provider',
  insurancePolicyNumber: 'insurance_policy_number',
  currentStock: 'current_stock',
  testName: 'test_name',
  reorderLevel: 'reorder_level',
  invoiceNumber: 'invoice_number',
  chronicConditions: 'chronic_conditions',
  amountPaid: 'amount_paid',
  genericName: 'generic_name',
  batchNumber: 'batch_number',
  expiryDate: 'expiry_date',
  dispensedAt: 'dispensed_at',
  dispensedBy: 'dispensed_by',
  dueDate: 'due_date',
  testType: 'test_type',
  doctorNotes: 'doctor_notes',
};

/**
 * Splits a single denormalized "Full Name" string (this project's
 * Firestore convention - see FIRESTORE_SCHEMA.md) into the separate
 * first/last fields the old SQL joins produced, on a given prefix
 * (e.g. "doctor" -> doctor_first_name/doctor_last_name).
 */
function splitName(fullName, prefix, target) {
  if (!fullName) return;
  const [first, ...rest] = fullName.split(' ');
  target[`${prefix}_first_name`] = first;
  target[`${prefix}_last_name`] = rest.join(' ');
}

export function withLegacyAliases(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const aliased = { ...obj };

  for (const [camel, snake] of Object.entries(DIRECT_ALIASES)) {
    if (aliased[camel] !== undefined) aliased[snake] = aliased[camel];
  }

  if (aliased.doctorName) splitName(aliased.doctorName, 'doctor', aliased);
  if (aliased.patientName) splitName(aliased.patientName, 'patient', aliased);
  if (aliased.receivedByName) splitName(aliased.receivedByName, 'received_by', aliased);
  if (aliased.registeredByName) splitName(aliased.registeredByName, 'registered_by', aliased);
  if (aliased.reviewedByName) splitName(aliased.reviewedByName, 'reviewed_by', aliased);
  if (aliased.uploadedByName) splitName(aliased.uploadedByName, 'uploaded_by', aliased);

  // profile_image_url / report_file_url: the old system stored actual
  // URLs (Multer-uploaded files served by Express); this migration
  // stores base64 data directly on the document instead (see the
  // file-upload note in FIRESTORE_SCHEMA.md) - a base64 data: URI is a
  // valid `src`/`href` value in an <img>/<a> tag, so aliasing it
  // straight into the old field name means the existing <img
  // src={patient.profile_image_url}> markup in PatientDetailPage.jsx
  // keeps working completely unchanged, no page edits needed.
  if (aliased.profileImageData) aliased.profile_image_url = aliased.profileImageData;
  if (aliased.reportFileData) aliased.report_file_url = aliased.reportFileData;

  return aliased;
}

/** Applies withLegacyAliases() to every row in a { data, meta } list response. */
export function withLegacyAliasesList(listResponse) {
  return { ...listResponse, data: listResponse.data.map(withLegacyAliases) };
}
