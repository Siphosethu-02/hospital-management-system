// src/services/medicalRecords.service.js
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, addDoc, updateDoc,
  runTransaction, increment, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { paginateClientSide, withLegacyAliases } from '../firebase/firestoreUtils';
import { logAction } from '../firebase/audit';

const MAX_ATTACHMENT_BYTES = 500 * 1024; // see FIRESTORE_SCHEMA.md file-upload note

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function withDenormalizedNames({ patientId, doctorId }) {
  const [patientSnap, doctorSnap] = await Promise.all([
    getDoc(doc(db, 'patients', patientId)),
    doctorId ? getDoc(doc(db, 'doctors', doctorId)) : Promise.resolve(null),
  ]);
  if (!patientSnap.exists()) throw new Error('patientId does not match an existing patient.');
  const patient = patientSnap.data();
  const doctorData = doctorSnap?.exists() ? doctorSnap.data() : null;
  return {
    patientName: `${patient.firstName} ${patient.lastName}`,
    patientUserId: patient.userId || null,
    doctorName: doctorData ? `${doctorData.firstName} ${doctorData.lastName}` : null,
  };
}

// -----------------------------------------------------------------------
// Medical records
// -----------------------------------------------------------------------
export const medicalRecordsService = {
  list: async ({ patientId, patientUserId, doctorId, page = 1, limit = 10 } = {}) => {
    let q = collection(db, 'medicalRecords');
    const clauses = [];
    // See appointments.service.js's fetchAppointmentRows() for why
    // patientUserId (not patientId) is required for a patient-role
    // reader's query to pass firestore.rules.
    if (patientUserId) clauses.push(where('patientUserId', '==', patientUserId));
    else if (patientId) clauses.push(where('patientId', '==', patientId));
    if (doctorId) clauses.push(where('doctorId', '==', doctorId));
    if (clauses.length) q = query(q, ...clauses);
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return paginateClientSide(rows, { page, limit, sortBy: 'createdAt', order: 'DESC' });
  },

  get: async (id) => {
    const snap = await getDoc(doc(db, 'medicalRecords', id));
    if (!snap.exists()) throw new Error('Medical record not found.');
    return { data: withLegacyAliases({ id, ...snap.data() }) };
  },

  create: async ({ patientId, doctorId, appointmentId, diagnosis, symptoms, treatmentPlan, doctorNotes, followUpDate }) => {
    const denorm = await withDenormalizedNames({ patientId, doctorId });
    const ref = await addDoc(collection(db, 'medicalRecords'), {
      patientId, patientName: denorm.patientName, patientUserId: denorm.patientUserId,
      doctorId, doctorName: denorm.doctorName,
      appointmentId: appointmentId || null,
      diagnosis, symptoms: symptoms || null, treatmentPlan: treatmentPlan || null,
      doctorNotes: doctorNotes || null, followUpDate: followUpDate || null,
      attachments: [],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    return medicalRecordsService.get(ref.id);
  },

  update: async (id, payload) => {
    await updateDoc(doc(db, 'medicalRecords', id), { ...payload, updatedAt: serverTimestamp() });
    return medicalRecordsService.get(id);
  },

  addAttachment: async (id, file) => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachments must be under ${MAX_ATTACHMENT_BYTES / 1024}KB (Firebase Storage isn't available on the free tier - see FIRESTORE_SCHEMA.md).`);
    }
    const fileData = await fileToBase64(file);
    const snap = await getDoc(doc(db, 'medicalRecords', id));
    if (!snap.exists()) throw new Error('Medical record not found.');
    const attachments = [...(snap.data().attachments || []), {
      id: `${Date.now()}`, fileName: file.name, fileType: file.type, fileData,
      uploadedAt: new Date().toISOString(), uploadedBy: auth.currentUser?.uid || null,
    }];
    await updateDoc(doc(db, 'medicalRecords', id), { attachments, updatedAt: serverTimestamp() });
    return medicalRecordsService.get(id);
  },

  removeAttachment: async (id, attachmentId) => {
    const snap = await getDoc(doc(db, 'medicalRecords', id));
    if (!snap.exists()) throw new Error('Medical record not found.');
    const attachments = (snap.data().attachments || []).filter((a) => a.id !== attachmentId);
    await updateDoc(doc(db, 'medicalRecords', id), { attachments, updatedAt: serverTimestamp() });
    return medicalRecordsService.get(id);
  },
};

// -----------------------------------------------------------------------
// Vitals
// -----------------------------------------------------------------------
export const vitalsService = {
  listByPatient: async (patientId, { page = 1, limit = 10 } = {}) => {
    const q = query(collection(db, 'vitals'), where('patientId', '==', patientId));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return paginateClientSide(rows, { page, limit, sortBy: 'recordedAt', order: 'DESC' });
  },

  record: async (payload) => {
    const ref = await addDoc(collection(db, 'vitals'), {
      ...payload,
      recordedBy: auth.currentUser?.uid || null,
      recordedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return { data: withLegacyAliases({ id: ref.id, ...snap.data() }) };
  },
};

// -----------------------------------------------------------------------
// Prescriptions
// -----------------------------------------------------------------------
export const prescriptionsService = {
  list: async ({ patientId, patientUserId, doctorId, status, page = 1, limit = 10 } = {}) => {
    let q = collection(db, 'prescriptions');
    const clauses = [];
    if (patientUserId) clauses.push(where('patientUserId', '==', patientUserId));
    else if (patientId) clauses.push(where('patientId', '==', patientId));
    if (doctorId) clauses.push(where('doctorId', '==', doctorId));
    if (clauses.length) q = query(q, ...clauses);
    const snap = await getDocs(q);
    let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (status) rows = rows.filter((r) => r.status === status);
    return paginateClientSide(rows, { page, limit, sortBy: 'createdAt', order: 'DESC' });
  },

  get: async (id) => {
    const snap = await getDoc(doc(db, 'prescriptions', id));
    if (!snap.exists()) throw new Error('Prescription not found.');
    return { data: withLegacyAliases({ id, ...snap.data() }) };
  },

  create: async ({ patientId, doctorId, medicalRecordId, notes, items }) => {
    const denorm = await withDenormalizedNames({ patientId, doctorId });
    const itemsWithNames = await Promise.all(items.map(async (item, i) => {
      const medSnap = await getDoc(doc(db, 'medicines', item.medicineId));
      if (!medSnap.exists()) throw new Error(`Item ${i + 1}: medicineId does not match an existing medicine.`);
      return {
        id: `item-${i}-${Date.now()}`,
        medicineId: item.medicineId,
        medicineName: medSnap.data().name,
        dosage: item.dosage, frequency: item.frequency, durationDays: item.durationDays || null,
        quantity: item.quantity, instructions: item.instructions || null,
        isDispensed: false, dispensedBy: null, dispensedAt: null,
      };
    }));

    const ref = await addDoc(collection(db, 'prescriptions'), {
      patientId, patientName: denorm.patientName, patientUserId: denorm.patientUserId,
      doctorId, doctorName: denorm.doctorName,
      medicalRecordId: medicalRecordId || null, notes: notes || null,
      status: 'pending', items: itemsWithNames,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    return prescriptionsService.get(ref.id);
  },

  cancel: async (id) => {
    const snap = await getDoc(doc(db, 'prescriptions', id));
    if (!snap.exists()) throw new Error('Prescription not found.');
    if (snap.data().status !== 'pending') throw new Error('Only a pending prescription can be cancelled.');
    await updateDoc(doc(db, 'prescriptions', id), { status: 'cancelled', updatedAt: serverTimestamp() });
    return prescriptionsService.get(id);
  },

  /**
   * FIFO stock dispensing. The candidate batches (which ones to pull
   * from, in expiry order) are found via a QUERY outside the
   * transaction, because - same constraint as appointments.service.js's
   * slotLocks - the Firestore client SDK's runTransaction() cannot run
   * a where()/orderBy() query inside the callback, only read/write
   * documents it already has a reference to.
   *
   * That does NOT make this unsafe: every batch the transaction
   * touches is re-read via tx.get() (fresh, live data) before being
   * decremented, and if a concurrent dispense already emptied a batch
   * between the outside query and this transaction running, that fresh
   * read reflects it and the transaction throws ("insufficient stock")
   * instead of overselling. The query only decides WHICH documents to
   * look at; the transaction is what makes touching them safe.
   */
  dispenseItem: async (prescriptionId, itemId) => {
    const prescriptionRef = doc(db, 'prescriptions', prescriptionId);
    const outsideSnap = await getDoc(prescriptionRef);
    if (!outsideSnap.exists()) throw new Error('Prescription not found.');
    const item = (outsideSnap.data().items || []).find((it) => it.id === itemId);
    if (!item) throw new Error('Prescription item not found.');
    if (item.isDispensed) throw new Error('This item has already been dispensed.');

    const batchQuery = query(
      collection(db, 'medicineStock'),
      where('medicineId', '==', item.medicineId),
      orderBy('expiryDate', 'asc')
    );
    const batchSnap = await getDocs(batchQuery);
    const candidateBatchIds = batchSnap.docs.map((d) => d.id);
    if (candidateBatchIds.length === 0) {
      throw new Error(`No stock batches exist for ${item.medicineName}.`);
    }

    await runTransaction(db, async (tx) => {
      // ALL reads first (Firestore transaction requirement).
      const freshPrescriptionSnap = await tx.get(prescriptionRef);
      if (!freshPrescriptionSnap.exists()) throw new Error('Prescription not found.');
      const freshBatchSnaps = [];
      for (const batchId of candidateBatchIds) {
        freshBatchSnaps.push(await tx.get(doc(db, 'medicineStock', batchId)));
      }

      let remaining = item.quantity;
      const batchUpdates = [];
      for (const batchSnapshot of freshBatchSnaps) {
        if (remaining <= 0) break;
        if (!batchSnapshot.exists()) continue;
        const available = batchSnapshot.data().quantity;
        if (available <= 0) continue;
        const take = Math.min(available, remaining);
        batchUpdates.push({ ref: batchSnapshot.ref, newQuantity: available - take });
        remaining -= take;
      }

      if (remaining > 0) {
        throw new Error(`Insufficient stock for ${item.medicineName}: need ${item.quantity}, only ${item.quantity - remaining} available across all batches.`);
      }

      // Now the writes.
      for (const { ref, newQuantity } of batchUpdates) {
        tx.update(ref, { quantity: newQuantity });
      }

      const items = freshPrescriptionSnap.data().items.map((it) =>
        it.id === itemId
          ? { ...it, isDispensed: true, dispensedBy: auth.currentUser?.uid || null, dispensedAt: new Date().toISOString() }
          : it
      );
      const allDispensed = items.every((it) => it.isDispensed);
      const anyDispensed = items.some((it) => it.isDispensed);
      const status = allDispensed ? 'dispensed' : anyDispensed ? 'partially_dispensed' : 'pending';

      tx.update(prescriptionRef, { items, status, updatedAt: serverTimestamp() });
      tx.update(doc(db, 'medicines', item.medicineId), { currentStock: increment(-item.quantity) });
    });

    await logAction({ action: 'PRESCRIPTION_ITEM_DISPENSED', entityType: 'prescription', entityId: prescriptionId, metadata: { itemId, medicineName: item.medicineName, quantity: item.quantity } });
    return prescriptionsService.get(prescriptionId);
  },
};
