// src/services/laboratory.service.js
import {
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { paginateClientSide, withLegacyAliases } from '../firebase/firestoreUtils';

const MAX_REPORT_BYTES = 500 * 1024; // see FIRESTORE_SCHEMA.md file-upload note

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const laboratoryService = {
  listTests: async ({ patientId, patientUserId, doctorId, status, page = 1, limit = 10 } = {}) => {
    let q = collection(db, 'labTests');
    const clauses = [];
    if (patientUserId) clauses.push(where('patientUserId', '==', patientUserId));
    else if (patientId) clauses.push(where('patientId', '==', patientId));
    if (doctorId) clauses.push(where('doctorId', '==', doctorId));
    if (status) clauses.push(where('status', '==', status));
    if (clauses.length) q = query(q, ...clauses);
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return paginateClientSide(rows, { page, limit, sortBy: 'requestedAt', order: 'DESC' });
  },

  getTest: async (id) => {
    const snap = await getDoc(doc(db, 'labTests', id));
    if (!snap.exists()) throw new Error('Lab test not found.');
    return { data: withLegacyAliases({ id, ...snap.data() }) };
  },

  createTest: async ({ patientId, doctorId, medicalRecordId, testName, testType, priority, notes }) => {
    const [patientSnap, doctorSnap] = await Promise.all([
      getDoc(doc(db, 'patients', patientId)),
      getDoc(doc(db, 'doctors', doctorId)),
    ]);
    if (!patientSnap.exists()) throw new Error('patientId does not match an existing patient.');
    if (!doctorSnap.exists()) throw new Error('doctorId does not match an existing doctor.');
    const patient = patientSnap.data();
    const doctorData = doctorSnap.data();

    const ref = await addDoc(collection(db, 'labTests'), {
      patientId, patientName: `${patient.firstName} ${patient.lastName}`, patientUserId: patient.userId || null,
      doctorId, doctorName: `${doctorData.firstName} ${doctorData.lastName}`,
      medicalRecordId: medicalRecordId || null,
      testName, testType: testType || null, priority: priority || 'routine', notes: notes || null,
      status: 'requested', result: null,
      requestedAt: serverTimestamp(),
    });
    return laboratoryService.getTest(ref.id);
  },

  updateStatus: async (id, status) => {
    await updateDoc(doc(db, 'labTests', id), { status });
    return laboratoryService.getTest(id);
  },

  uploadResult: async (id, { resultSummary, resultData, file }) => {
    let reportFileName = null;
    let reportFileData = null;
    if (file) {
      if (file.size > MAX_REPORT_BYTES) {
        throw new Error(`Report files must be under ${MAX_REPORT_BYTES / 1024}KB (Firebase Storage isn't available on the free tier - see FIRESTORE_SCHEMA.md). Enter the result as structured data instead, or attach a smaller file.`);
      }
      reportFileName = file.name;
      reportFileData = await fileToBase64(file);
    }
    await updateDoc(doc(db, 'labTests', id), {
      status: 'completed',
      result: {
        resultSummary: resultSummary || null,
        resultData: resultData || null,
        reportFileName, reportFileData,
        uploadedBy: auth.currentUser?.uid || null,
        uploadedAt: new Date().toISOString(),
        reviewedBy: null, reviewedByName: null, reviewedAt: null,
      },
    });
    return laboratoryService.getTest(id);
  },

  review: async (id) => {
    const snap = await getDoc(doc(db, 'labTests', id));
    if (!snap.exists()) throw new Error('Lab test not found.');
    const result = snap.data().result;
    if (!result) throw new Error('This test has no result to review yet.');
    await updateDoc(doc(db, 'labTests', id), {
      status: 'reviewed',
      result: { ...result, reviewedBy: auth.currentUser?.uid || null, reviewedAt: new Date().toISOString() },
    });
    return laboratoryService.getTest(id);
  },
};
