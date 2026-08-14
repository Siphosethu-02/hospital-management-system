// src/services/departments.service.js
import {
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, deleteDoc,
  runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { paginateClientSide, withLegacyAliases } from '../firebase/firestoreUtils';

/**
 * Moves one doctor into `newDepartmentId` (or out entirely, if null),
 * maintaining the denormalized doctorCount on both the old and new
 * department atomically - see FIRESTORE_SCHEMA.md for why doctorCount
 * exists at all (Firestore has no free live COUNT(*) over a query).
 */
async function reassignDoctorToDepartment(doctorId, newDepartmentId) {
  await runTransaction(db, async (tx) => {
    const doctorRef = doc(db, 'doctors', doctorId);
    const doctorSnap = await tx.get(doctorRef);
    if (!doctorSnap.exists()) throw new Error('Doctor not found.');
    const oldDepartmentId = doctorSnap.data().departmentId || null;

    if (oldDepartmentId === newDepartmentId) return; // no-op, nothing to move

    let newDeptName = null;
    if (newDepartmentId) {
      const newDeptRef = doc(db, 'departments', newDepartmentId);
      const newDeptSnap = await tx.get(newDeptRef);
      if (!newDeptSnap.exists()) throw new Error('Department not found.');
      newDeptName = newDeptSnap.data().name;
      tx.update(newDeptRef, { doctorCount: (newDeptSnap.data().doctorCount || 0) + 1 });
    }

    if (oldDepartmentId) {
      const oldDeptRef = doc(db, 'departments', oldDepartmentId);
      const oldDeptSnap = await tx.get(oldDeptRef);
      if (oldDeptSnap.exists()) {
        tx.update(oldDeptRef, { doctorCount: Math.max(0, (oldDeptSnap.data().doctorCount || 0) - 1) });
      }
    }

    tx.update(doctorRef, {
      departmentId: newDepartmentId,
      departmentName: newDeptName,
      updatedAt: serverTimestamp(),
    });
  });
}

export const departmentsService = {
  list: async ({ search, isActive, page = 1, limit = 10 } = {}) => {
    const snap = await getDocs(collection(db, 'departments'));
    let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (isActive !== undefined) rows = rows.filter((r) => r.isActive === isActive);
    return paginateClientSide(rows, { page, limit, search, searchFields: ['name', 'description'], sortBy: 'name', order: 'ASC' });
  },

  listAll: async () => {
    const q = query(collection(db, 'departments'), where('isActive', '==', true));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
    return { data: rows };
  },

  get: async (id) => {
    const snap = await getDoc(doc(db, 'departments', id));
    if (!snap.exists()) throw new Error('Department not found.');
    return { data: withLegacyAliases({ id, ...snap.data() }) };
  },

  create: async ({ name, description, headDoctorId, doctorIds }) => {
    if (!doctorIds || doctorIds.length === 0) {
      throw new Error('Select at least one doctor for this department.');
    }
    const existing = await getDocs(query(collection(db, 'departments'), where('name', '==', name)));
    if (!existing.empty) throw new Error('A department with this name already exists.');

    let headDoctorName = null;
    if (headDoctorId) {
      const headSnap = await getDoc(doc(db, 'doctors', headDoctorId));
      if (!headSnap.exists()) throw new Error('headDoctorId does not match an existing doctor.');
      headDoctorName = `${headSnap.data().firstName} ${headSnap.data().lastName}`;
    }

    const ref = await addDoc(collection(db, 'departments'), {
      name,
      description: description || null,
      headDoctorId: headDoctorId || null,
      headDoctorName,
      doctorCount: 0,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const doctorId of doctorIds) {
      await reassignDoctorToDepartment(doctorId, ref.id);
    }

    return departmentsService.get(ref.id);
  },

  update: async (id, payload) => {
    const fields = { updatedAt: serverTimestamp() };
    if (payload.name !== undefined) fields.name = payload.name;
    if (payload.description !== undefined) fields.description = payload.description;
    if (payload.isActive !== undefined) fields.isActive = payload.isActive;
    if (payload.headDoctorId !== undefined) {
      const headSnap = await getDoc(doc(db, 'doctors', payload.headDoctorId));
      if (!headSnap.exists()) throw new Error('headDoctorId does not match an existing doctor.');
      fields.headDoctorId = payload.headDoctorId;
      fields.headDoctorName = `${headSnap.data().firstName} ${headSnap.data().lastName}`;
    }
    await updateDoc(doc(db, 'departments', id), fields);
    return departmentsService.get(id);
  },

  remove: async (id) => {
    const snap = await getDoc(doc(db, 'departments', id));
    if (!snap.exists()) throw new Error('Department not found.');
    if ((snap.data().doctorCount || 0) > 0) {
      throw new Error('This department still has doctors assigned to it. Reassign them before deleting.');
    }
    await deleteDoc(doc(db, 'departments', id));
    return { data: null };
  },

  assignDoctor: async (id, doctorId) => {
    const doctorSnap = await getDoc(doc(db, 'doctors', doctorId));
    if (!doctorSnap.exists()) throw new Error('doctorId does not match an existing doctor.');
    if (doctorSnap.data().departmentId === id) {
      throw new Error('This doctor is already assigned to this department.');
    }
    await reassignDoctorToDepartment(doctorId, id);
    return departmentsService.get(id);
  },

  unassignDoctor: async (id, doctorId) => {
    const doctorSnap = await getDoc(doc(db, 'doctors', doctorId));
    if (!doctorSnap.exists() || doctorSnap.data().departmentId !== id) {
      throw new Error('This doctor is not currently assigned to this department.');
    }
    await reassignDoctorToDepartment(doctorId, null);
    return departmentsService.get(id);
  },
};
