// src/services/pharmacy.service.js
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, addDoc, updateDoc, deleteDoc,
  increment, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { paginateClientSide, withLegacyAliases } from '../firebase/firestoreUtils';

export const pharmacyService = {
  // --- Categories ---
  listCategories: async () => {
    const snap = await getDocs(collection(db, 'medicineCategories'));
    return { data: snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)) };
  },
  createCategory: async (payload) => {
    const ref = await addDoc(collection(db, 'medicineCategories'), { name: payload.name });
    return { data: { id: ref.id, name: payload.name } };
  },
  updateCategory: async (id, payload) => {
    await updateDoc(doc(db, 'medicineCategories', id), payload);
    return { data: { id, ...payload } };
  },
  removeCategory: async (id) => {
    await deleteDoc(doc(db, 'medicineCategories', id));
    return { data: null };
  },

  // --- Medicines ---
  listMedicines: async ({ search, categoryId, isActive, page = 1, limit = 10 } = {}) => {
    let q = collection(db, 'medicines');
    const clauses = [];
    if (categoryId) clauses.push(where('categoryId', '==', categoryId));
    if (isActive !== undefined) clauses.push(where('isActive', '==', isActive));
    if (clauses.length) q = query(q, ...clauses);
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return paginateClientSide(rows, { page, limit, search, searchFields: ['name', 'genericName'], sortBy: 'name', order: 'ASC' });
  },

  getMedicine: async (id) => {
    const snap = await getDoc(doc(db, 'medicines', id));
    if (!snap.exists()) throw new Error('Medicine not found.');
    return { data: withLegacyAliases({ id, ...snap.data() }) };
  },

  createMedicine: async (payload) => {
    let categoryName = null;
    const categoryId = payload.categoryId || null;
    if (categoryId) {
      const catSnap = await getDoc(doc(db, 'medicineCategories', categoryId));
      categoryName = catSnap.exists() ? catSnap.data().name : null;
    }
    const ref = await addDoc(collection(db, 'medicines'), {
      name: payload.name,
      categoryId,
      categoryName,
      genericName: payload.genericName || null,
      manufacturer: payload.manufacturer || null,
      unit: payload.unit || null,
      unitPrice: Number(payload.unitPrice) || 0,
      reorderLevel: Number(payload.reorderLevel) || 0,
      currentStock: 0,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return pharmacyService.getMedicine(ref.id);
  },

  updateMedicine: async (id, payload) => {
    const fields = { updatedAt: serverTimestamp() };
    if (payload.name !== undefined) fields.name = payload.name;
    if (payload.categoryId !== undefined) fields.categoryId = payload.categoryId || null;
    if (payload.genericName !== undefined) fields.genericName = payload.genericName || null;
    if (payload.manufacturer !== undefined) fields.manufacturer = payload.manufacturer || null;
    if (payload.unit !== undefined) fields.unit = payload.unit || null;
    if (payload.unitPrice !== undefined) fields.unitPrice = Number(payload.unitPrice) || 0;
    if (payload.reorderLevel !== undefined) fields.reorderLevel = Number(payload.reorderLevel) || 0;
    if (payload.isActive !== undefined) fields.isActive = payload.isActive;
    await updateDoc(doc(db, 'medicines', id), fields);
    return pharmacyService.getMedicine(id);
  },

  removeMedicine: async (id) => {
    await deleteDoc(doc(db, 'medicines', id));
    return { data: null };
  },

  // --- Stock ---
  listStock: async (medicineId) => {
    const q = query(collection(db, 'medicineStock'), where('medicineId', '==', medicineId), orderBy('expiryDate', 'asc'));
    const snap = await getDocs(q);
    return { data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  },

  // Atomic on the medicine's running total via increment() - no
  // transaction needed for a single-field numeric increment, Firestore
  // guarantees this is race-free on its own.
  receiveStock: async (medicineId, { batchNumber, quantity, expiryDate, supplier }) => {
    const medSnap = await getDoc(doc(db, 'medicines', medicineId));
    if (!medSnap.exists()) throw new Error('Medicine not found.');
    const ref = await addDoc(collection(db, 'medicineStock'), {
      medicineId, medicineName: medSnap.data().name, batchNumber, quantity,
      expiryDate, supplier: supplier || null,
      receivedAt: serverTimestamp(), createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'medicines', medicineId), { currentStock: increment(quantity), updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return { data: withLegacyAliases({ id: ref.id, ...snap.data() }) };
  },

  // --- Alerts ---
  // Firestore can't compare two fields to each other in a query
  // (currentStock <= reorderLevel isn't expressible), so low-stock is
  // computed by fetching active medicines and filtering client-side -
  // fine at this project's scale (a hospital's medicine catalog is
  // small, a few hundred entries at most).
  lowStockAlerts: async () => {
    const q = query(collection(db, 'medicines'), where('isActive', '==', true));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => (m.currentStock || 0) <= (m.reorderLevel || 0));
    return { data: rows };
  },

  expiringAlerts: async (withinDays = 30) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + Number(withinDays));
    const today = new Date().toISOString().slice(0, 10);
    const q = query(collection(db, 'medicineStock'), where('expiryDate', '<=', cutoff.toISOString().slice(0, 10)));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => b.expiryDate >= today && b.quantity > 0);
    return { data: rows };
  },

  expiredAlerts: async () => {
    const today = new Date().toISOString().slice(0, 10);
    const q = query(collection(db, 'medicineStock'), where('expiryDate', '<', today));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => b.quantity > 0);
    return { data: rows };
  },

  // Flattens dispensed items out of prescriptions - see the note on
  // embedded-array queries in FIRESTORE_SCHEMA.md; a cross-prescription
  // "history" view is exactly the case embedding trades away, computed
  // here client-side over a capped recent batch instead.
  dispensingHistory: async ({ page = 1, limit = 10 } = {}) => {
    const snap = await getDocs(query(collection(db, 'prescriptions'), where('status', 'in', ['dispensed', 'partially_dispensed'])));
    const rows = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      (data.items || []).filter((it) => it.isDispensed).forEach((it) => {
        rows.push({
          id: `${d.id}-${it.id}`, prescriptionId: d.id, patientName: data.patientName,
          medicineName: it.medicineName, quantity: it.quantity,
          dispensedBy: it.dispensedBy, dispensedAt: it.dispensedAt,
        });
      });
    });
    return paginateClientSide(rows, { page, limit, sortBy: 'dispensedAt', order: 'DESC' });
  },
};
