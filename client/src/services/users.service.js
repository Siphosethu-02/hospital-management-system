// src/services/users.service.js
// Firestore-backed replacement for the old /users Express routes.
// Same exported method names/shapes as before.

import {
  collection, doc, getDoc, getDocs, query, where, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { paginateClientSide, FETCH_CAP, withLegacyAliases } from '../firebase/firestoreUtils';
import { logAction } from '../firebase/audit';

const STAFF_ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_staff'];

export const usersService = {
  list: async ({ search, role, page = 1, limit = 10 } = {}) => {
    // Staff management never lists patient accounts - matches the old
    // backend, which only ever exposed staff through this endpoint
    // (patients are managed via the separate patients.service.js).
    const roleFilter = role ? [role] : STAFF_ROLES;
    const q = query(collection(db, 'users'), where('role', 'in', roleFilter));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), role_name: d.data().role }));

    return paginateClientSide(rows, {
      page, limit, search, searchFields: ['firstName', 'lastName', 'email'],
      sortBy: 'lastName', order: 'ASC',
    });
  },

  get: async (id) => {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) throw new Error('User not found.');
    return { data: withLegacyAliases({ id, ...snap.data(), role_name: snap.data().role }) };
  },

  update: async (id, payload) => {
    // Mirrors the backend's own self-role/self-deactivate guard from
    // the old user.controller.js - kept here too since there is no
    // server to fall back on if the UI ever allowed it through.
    if (id === auth.currentUser?.uid && (payload.role !== undefined || payload.isActive === false)) {
      throw new Error('You cannot change your own role or deactivate your own account.');
    }
    const fields = { updatedAt: serverTimestamp() };
    if (payload.firstName !== undefined) fields.firstName = payload.firstName;
    if (payload.lastName !== undefined) fields.lastName = payload.lastName;
    if (payload.phone !== undefined) fields.phone = payload.phone;
    if (payload.role !== undefined) fields.role = payload.role;
    await updateDoc(doc(db, 'users', id), fields);

    // Keep the denormalized name on doctors/{uid} in sync - see
    // FIRESTORE_SCHEMA.md's note on why it's duplicated there at all.
    if ((payload.firstName !== undefined || payload.lastName !== undefined)) {
      const doctorSnap = await getDoc(doc(db, 'doctors', id));
      if (doctorSnap.exists()) {
        const doctorFields = { updatedAt: serverTimestamp() };
        if (payload.firstName !== undefined) doctorFields.firstName = payload.firstName;
        if (payload.lastName !== undefined) doctorFields.lastName = payload.lastName;
        await updateDoc(doc(db, 'doctors', id), doctorFields);
      }
    }

    if (payload.role !== undefined) {
      await logAction({ action: 'USER_ROLE_CHANGED', entityType: 'user', entityId: id, metadata: { newRole: payload.role } });
    }
    return usersService.get(id);
  },

  deactivate: async (id) => {
    if (id === auth.currentUser?.uid) throw new Error("You cannot deactivate your own account.");
    await updateDoc(doc(db, 'users', id), { isActive: false, updatedAt: serverTimestamp() });
    await logAction({ action: 'USER_DEACTIVATED', entityType: 'user', entityId: id });
    return usersService.get(id);
  },

  activate: async (id) => {
    await updateDoc(doc(db, 'users', id), { isActive: true, updatedAt: serverTimestamp() });
    await logAction({ action: 'USER_ACTIVATED', entityType: 'user', entityId: id });
    return usersService.get(id);
  },

  remove: async (id) => {
    await deleteDoc(doc(db, 'users', id));
    return { data: null };
  },

  updateOwnProfile: async (payload) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not signed in.');
    const fields = { updatedAt: serverTimestamp() };
    if (payload.firstName !== undefined) fields.firstName = payload.firstName;
    if (payload.lastName !== undefined) fields.lastName = payload.lastName;
    if (payload.phone !== undefined) fields.phone = payload.phone;
    await updateDoc(doc(db, 'users', uid), fields);
    return usersService.get(uid);
  },
};
