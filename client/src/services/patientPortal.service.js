// src/services/patientPortal.service.js
// Self-service calls for the "patient" role. Every function here
// resolves "which patient" from the logged-in user's own linked
// patients doc (patients.userId == auth.currentUser.uid) and then
// reuses the SAME underlying service functions the staff UI uses
// (appointmentsService, medicalRecordsService, etc.) - there is no
// parallel/duplicate business logic, same as the original design.
//
// The real security boundary is firestore.rules, not this file: every
// read/write below is independently checked against
// resource.data.patientUserId == request.auth.uid server-side (well,
// Firestore-side) regardless of what this client code does or doesn't
// pre-validate. That's a meaningfully different - and in some ways
// stronger - guarantee than the old Express version had, where the
// controller's own ownership check WAS the only enforcement.
//
// IMPORTANT: reads below pass patientUserId (the Auth uid), not
// patientId (the Firestore document id), to every list() call. This
// matters more than it looks like it should: Firestore rejects an
// entire list/query request outright unless it can verify from the
// query's OWN filters alone that every possible result is allowed - it
// will not fetch results and check them one by one. Since
// firestore.rules checks resource.data.patientUserId for a
// patient-role reader, the query has to filter on that exact same
// field, or Firestore refuses the whole query even though every real
// result would have been allowed.

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { patientsService } from './patients.service';
import { appointmentsService } from './appointments.service';
import { doctorsService } from './doctors.service';
import { medicalRecordsService, prescriptionsService } from './medicalRecords.service';
import { laboratoryService } from './laboratory.service';

async function getMyPatientId() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  const q = query(collection(db, 'patients'), where('userId', '==', uid));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('No patient record is linked to this account. Contact reception for help.');
  return snap.docs[0].id;
}

function requireUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  return uid;
}

export const patientPortalService = {
  getProfile: async () => {
    const patientId = await getMyPatientId();
    return patientsService.get(patientId);
  },

  // Only contact-type fields are accepted here at the UI layer, but the
  // real enforcement is firestore.rules' onlyChangedFields() check on
  // the patients collection - a patient-role write touching any other
  // field is rejected by Firestore itself, not just hidden by this form.
  updateProfile: async (payload) => {
    const patientId = await getMyPatientId();
    const safeFields = {};
    ['phone', 'email', 'address', 'city', 'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation']
      .forEach((key) => { if (payload[key] !== undefined) safeFields[key] = payload[key]; });
    return patientsService.update(patientId, safeFields);
  },

  listAppointments: async (params = {}) => appointmentsService.list({ ...params, patientUserId: requireUid() }),

  // Identical slot generator the staff booking screen uses - see
  // firebase/scheduling.js.
  availableSlots: async (doctorId, date) => doctorsService.availableSlots(doctorId, date),

  bookAppointment: async ({ doctorId, scheduledAt, reason }) => {
    const patientId = await getMyPatientId();
    return appointmentsService.create({ patientId, doctorId, scheduledAt, reason });
  },

  cancelAppointment: async (id, payload) => appointmentsService.cancel(id, payload),

  listMedicalRecords: async (params = {}) => medicalRecordsService.list({ ...params, patientUserId: requireUid() }),

  getMedicalRecord: async (id) => medicalRecordsService.get(id),

  listPrescriptions: async (params = {}) => prescriptionsService.list({ ...params, patientUserId: requireUid() }),

  getPrescription: async (id) => prescriptionsService.get(id),

  listLabResults: async (params = {}) =>
    laboratoryService.listTests({ ...params, patientUserId: requireUid(), status: 'completed' }),
};
