// src/services/appointments.service.js
import {
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc,
  runTransaction, serverTimestamp, Timestamp, deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { paginateClientSide } from '../firebase/firestoreUtils';
import { logAction } from '../firebase/audit';

function slotLockId(doctorId, scheduledAtISO) {
  return `${doctorId}_${scheduledAtISO}`;
}

async function fetchAppointmentRows({ patientId, patientUserId, doctorId, status, dateFrom, dateTo, page = 1, limit = 10, sortBy = 'scheduledAt', order = 'DESC', search }) {
  let q = collection(db, 'appointments');
  const clauses = [];
  // patientUserId (not patientId) is what firestore.rules actually
  // checks for a patient-role reader - a list/query request must be
  // provably safe from its OWN filters alone (Firestore can't verify
  // it by checking each result afterward), so a patient-facing query
  // has to filter on the exact field the rule compares against, or
  // Firestore rejects the whole query outright even though every
  // result really would belong to them. Staff callers keep using
  // patientId (their rule branches don't depend on it at all).
  if (patientUserId) clauses.push(where('patientUserId', '==', patientUserId));
  else if (patientId) clauses.push(where('patientId', '==', patientId));
  if (doctorId) clauses.push(where('doctorId', '==', doctorId));
  if (clauses.length) q = query(q, ...clauses);

  const snap = await getDocs(q);
  let rows = snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data, scheduled_at: data.scheduledAt?.toDate().toISOString() };
  });

  if (status) rows = rows.filter((r) => r.status === status);
  // dateFrom/dateTo are 'YYYY-MM-DD' strings from the dashboard's
  // upcoming-vs-recent split - compared against just the date portion
  // of scheduled_at so a same-day boundary is inclusive either side.
  if (dateFrom) rows = rows.filter((r) => r.scheduled_at?.slice(0, 10) >= dateFrom);
  if (dateTo) rows = rows.filter((r) => r.scheduled_at?.slice(0, 10) <= dateTo);

  return paginateClientSide(rows, {
    page, limit, search,
    searchFields: ['patientName', 'doctorName'],
    sortBy: 'scheduled_at', order,
  });
}

export const appointmentsService = {
  list: (params = {}) => fetchAppointmentRows(params),

  get: async (id) => {
    const snap = await getDoc(doc(db, 'appointments', id));
    if (!snap.exists()) throw new Error('Appointment not found.');
    const data = snap.data();
    return { data: { id, ...data, scheduled_at: data.scheduledAt?.toDate().toISOString() } };
  },

  /**
   * Books an appointment with true atomic double-booking prevention -
   * see FIRESTORE_SCHEMA.md's slotLocks entry for exactly why this
   * needs a deterministic lock document rather than a query-then-write.
   */
  create: async ({ patientId, doctorId, scheduledAt, reason }) => {
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      throw new Error('scheduledAt must be in the future.');
    }

    const [patientSnap, doctorSnap] = await Promise.all([
      getDoc(doc(db, 'patients', patientId)),
      getDoc(doc(db, 'doctors', doctorId)),
    ]);
    if (!patientSnap.exists()) throw new Error('patientId does not match an existing patient.');
    if (!doctorSnap.exists()) throw new Error('doctorId does not match an existing doctor.');
    const patient = patientSnap.data();
    const doctorData = doctorSnap.data();

    const scheduledAtISO = new Date(scheduledAt).toISOString();
    const lockRef = doc(db, 'slotLocks', slotLockId(doctorId, scheduledAtISO));
    const appointmentRef = doc(collection(db, 'appointments'));

    await runTransaction(db, async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists()) {
        throw new Error('This slot is no longer available. Please choose another time.');
      }

      tx.set(lockRef, {
        appointmentId: appointmentRef.id,
        doctorId,
        scheduledAt: scheduledAtISO,
        createdAt: serverTimestamp(),
      });

      tx.set(appointmentRef, {
        patientId,
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientUserId: patient.userId || null,
        doctorId,
        doctorName: `${doctorData.firstName || ''} ${doctorData.lastName || ''}`.trim(),
        departmentId: doctorData.departmentId || null,
        departmentName: doctorData.departmentName || null,
        scheduledAt: Timestamp.fromDate(new Date(scheduledAt)),
        durationMinutes: 30,
        reason: reason || null,
        status: 'scheduled',
        cancellationReason: null,
        bookedBy: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await logAction({ action: 'APPOINTMENT_BOOKED', entityType: 'appointment', entityId: appointmentRef.id, metadata: { doctorId, scheduledAt } });
    return appointmentsService.get(appointmentRef.id);
  },

  reschedule: async (id, { scheduledAt }) => {
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      throw new Error('scheduledAt must be in the future.');
    }
    const existingSnap = await getDoc(doc(db, 'appointments', id));
    if (!existingSnap.exists()) throw new Error('Appointment not found.');
    const existing = existingSnap.data();

    const oldLockRef = doc(db, 'slotLocks', slotLockId(existing.doctorId, existing.scheduledAt.toDate().toISOString()));
    const scheduledAtISO = new Date(scheduledAt).toISOString();
    const newLockRef = doc(db, 'slotLocks', slotLockId(existing.doctorId, scheduledAtISO));

    await runTransaction(db, async (tx) => {
      const newLockSnap = await tx.get(newLockRef);
      if (newLockSnap.exists()) {
        throw new Error('This slot is no longer available. Please choose another time.');
      }
      tx.delete(oldLockRef);
      tx.set(newLockRef, { appointmentId: id, doctorId: existing.doctorId, scheduledAt: scheduledAtISO, createdAt: serverTimestamp() });
      tx.update(doc(db, 'appointments', id), {
        scheduledAt: Timestamp.fromDate(new Date(scheduledAt)),
        updatedAt: serverTimestamp(),
      });
    });

    return appointmentsService.get(id);
  },

  cancel: async (id, { cancellationReason } = {}) => {
    const snap = await getDoc(doc(db, 'appointments', id));
    if (!snap.exists()) throw new Error('Appointment not found.');
    const data = snap.data();
    if (['completed', 'cancelled'].includes(data.status)) {
      throw new Error(`This appointment is already ${data.status}.`);
    }

    const lockRef = doc(db, 'slotLocks', slotLockId(data.doctorId, data.scheduledAt.toDate().toISOString()));
    await updateDoc(doc(db, 'appointments', id), {
      status: 'cancelled',
      cancellationReason: cancellationReason || null,
      updatedAt: serverTimestamp(),
    });
    // Frees the slot - see slotLocks in FIRESTORE_SCHEMA.md.
    await deleteDoc(lockRef).catch(() => {}); // lock may not exist if this appointment predates locks (migrated data)

    await logAction({ action: 'APPOINTMENT_CANCELLED', entityType: 'appointment', entityId: id, metadata: { cancellationReason } });
    return appointmentsService.get(id);
  },

  updateStatus: async (id, status) => {
    await updateDoc(doc(db, 'appointments', id), { status, updatedAt: serverTimestamp() });
    return appointmentsService.get(id);
  },
};
