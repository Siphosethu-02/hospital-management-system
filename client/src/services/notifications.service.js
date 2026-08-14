// src/services/notifications.service.js
import {
  collection, doc, getDocs, query, where, writeBatch, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { paginateClientSide } from '../firebase/firestoreUtils';

async function myNotifications() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(collection(db, 'notifications'), where('userId', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export const notificationsService = {
  list: async ({ page = 1, limit = 10 } = {}) => {
    const rows = await myNotifications();
    return paginateClientSide(rows, { page, limit, sortBy: 'createdAt', order: 'DESC' });
  },

  unreadCount: async () => {
    const rows = await myNotifications();
    return { data: { count: rows.filter((n) => !n.isRead).length } };
  },

  markRead: async (id) => {
    await updateDoc(doc(db, 'notifications', id), { isRead: true });
    return { data: null };
  },

  // No bulk-update endpoint anymore (no server) - a Firestore
  // writeBatch commits up to 500 writes atomically in one round trip,
  // which is the direct client-side equivalent.
  markAllRead: async () => {
    const rows = await myNotifications();
    const unread = rows.filter((n) => !n.isRead);
    if (unread.length === 0) return { data: null };
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { isRead: true }));
    await batch.commit();
    return { data: null };
  },

  remove: async (id) => {
    await deleteDoc(doc(db, 'notifications', id));
    return { data: null };
  },
};
