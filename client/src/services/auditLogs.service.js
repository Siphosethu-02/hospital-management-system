// src/services/auditLogs.service.js
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { paginateClientSide } from '../firebase/firestoreUtils';

export const auditLogsService = {
  // admin-only per firestore.rules - a non-admin calling this simply
  // gets a permission-denied error from Firestore, same effective
  // result as the old 403 from the Express middleware.
  list: async ({ userId, entityType, page = 1, limit = 20 } = {}) => {
    let q = collection(db, 'auditLogs');
    const clauses = [];
    if (userId) clauses.push(where('userId', '==', userId));
    if (entityType) clauses.push(where('entityType', '==', entityType));
    if (clauses.length) q = query(q, ...clauses);
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return paginateClientSide(rows, { page, limit, sortBy: 'createdAt', order: 'DESC' });
  },
};
