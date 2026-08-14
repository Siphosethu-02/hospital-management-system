// src/services/patients.service.js
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit as fbLimit,
  addDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { paginateClientSide, withLegacyAliases } from '../firebase/firestoreUtils';
import { logAction } from '../firebase/audit';

const MAX_IMAGE_BYTES = 500 * 1024; // 500KB - see FIRESTORE_SCHEMA.md's file-upload note

/** Generates the next sequential PT-YYYY-###### code inside a transaction, so two concurrent registrations can never collide - the client-side equivalent of the old SQL "FOR UPDATE" counter lock. */
async function generatePatientCode(tx) {
  const year = new Date().getFullYear();
  const counterRef = doc(db, 'counters', `patients-${year}`);
  const counterSnap = await tx.get(counterRef);
  const next = (counterSnap.exists() ? counterSnap.data().value : 0) + 1;
  tx.set(counterRef, { value: next }, { merge: true });
  return `PT-${year}-${String(next).padStart(6, '0')}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const patientsService = {
  list: async ({ search, gender, bloodGroup, isActive, page = 1, limit = 10 } = {}) => {
    let q = collection(db, 'patients');
    const clauses = [];
    if (gender) clauses.push(where('gender', '==', gender));
    if (bloodGroup) clauses.push(where('bloodGroup', '==', bloodGroup));
    if (isActive !== undefined) clauses.push(where('isActive', '==', isActive));
    if (clauses.length) q = query(q, ...clauses);

    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return paginateClientSide(rows, {
      page, limit, search,
      searchFields: ['firstName', 'lastName', 'patientCode', 'phone', 'email'],
      sortBy: 'lastName', order: 'ASC',
    });
  },

  get: async (id) => {
    const snap = await getDoc(doc(db, 'patients', id));
    if (!snap.exists()) throw new Error('Patient not found.');
    return { data: withLegacyAliases({ id, ...snap.data() }) };
  },

  create: async (payload) => {
    const patientData = { ...payload };
    let newId;
    await runTransaction(db, async (tx) => {
      const patientCode = await generatePatientCode(tx);
      const ref = doc(collection(db, 'patients'));
      newId = ref.id;
      tx.set(ref, {
        patientCode,
        userId: null,
        firstName: patientData.firstName,
        lastName: patientData.lastName,
        dateOfBirth: patientData.dateOfBirth,
        gender: patientData.gender,
        bloodGroup: patientData.bloodGroup || null,
        phone: patientData.phone || null,
        email: patientData.email || null,
        address: patientData.address || null,
        city: patientData.city || null,
        allergies: patientData.allergies || null,
        chronicConditions: patientData.chronicConditions || null,
        emergencyContactName: patientData.emergencyContactName || null,
        emergencyContactPhone: patientData.emergencyContactPhone || null,
        emergencyContactRelation: patientData.emergencyContactRelation || null,
        insuranceProvider: patientData.insuranceProvider || null,
        insurancePolicyNumber: patientData.insurancePolicyNumber || null,
        profileImageData: null,
        registeredBy: auth.currentUser?.uid || null,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await logAction({ action: 'PATIENT_CREATED', entityType: 'patient', entityId: newId, metadata: { patientCode: patientData.patientCode } });
    return patientsService.get(newId);
  },

  update: async (id, payload) => {
    await updateDoc(doc(db, 'patients', id), { ...payload, updatedAt: serverTimestamp() });
    return patientsService.get(id);
  },

  uploadImage: async (id, file) => {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image must be under ${MAX_IMAGE_BYTES / 1024}KB (Firebase Storage isn't available on the free tier - see FIRESTORE_SCHEMA.md). Please choose a smaller photo.`);
    }
    const base64 = await fileToBase64(file);
    await updateDoc(doc(db, 'patients', id), { profileImageData: base64, updatedAt: serverTimestamp() });
    return patientsService.get(id);
  },

  deactivate: async (id) => {
    await updateDoc(doc(db, 'patients', id), { isActive: false, updatedAt: serverTimestamp() });
    return patientsService.get(id);
  },

  activate: async (id) => {
    await updateDoc(doc(db, 'patients', id), { isActive: true, updatedAt: serverTimestamp() });
    return patientsService.get(id);
  },

  remove: async (id) => {
    await deleteDoc(doc(db, 'patients', id));
    return { data: null };
  },

  // Admin/receptionist grants portal access - creates the Auth user +
  // users/{uid} doc via the secondary-app pattern, then links it.
  grantPortalAccess: async (id, { email, password }) => {
    const { createUserWithEmailAndPassword, signOut } = await import('firebase/auth');
    const { getSecondaryAuth } = await import('../firebase/config');

    const patientSnap = await getDoc(doc(db, 'patients', id));
    if (!patientSnap.exists()) throw new Error('Patient not found.');
    const patient = patientSnap.data();
    if (patient.userId) throw new Error('This patient already has portal access.');

    const secondaryAuth = getSecondaryAuth();
    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = credential.user.uid;

      await import('firebase/firestore').then(({ setDoc }) =>
        setDoc(doc(db, 'users', uid), {
          role: 'patient',
          firstName: patient.firstName,
          lastName: patient.lastName,
          email,
          phone: patient.phone || null,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );

      await updateDoc(doc(db, 'patients', id), { userId: uid, updatedAt: serverTimestamp() });
      await logAction({ action: 'PATIENT_PORTAL_ACCESS_GRANTED', entityType: 'patient', entityId: id, metadata: { email } });
      return patientsService.get(id);
    } finally {
      await signOut(secondaryAuth);
    }
  },
};
