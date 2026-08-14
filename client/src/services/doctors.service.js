// src/services/doctors.service.js
import {
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { paginateClientSide, withLegacyAliases } from '../firebase/firestoreUtils';
import { getAvailableSlotsForDoctor } from '../firebase/scheduling';

export const doctorsService = {
  list: async ({ search, departmentId, page = 1, limit = 10 } = {}) => {
    let q = collection(db, 'doctors');
    if (departmentId) q = query(q, where('departmentId', '==', departmentId));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return paginateClientSide(rows, {
      page, limit, search, searchFields: ['firstName', 'lastName', 'specialization'],
      sortBy: 'lastName', order: 'ASC',
    });
  },

  get: async (id) => {
    const snap = await getDoc(doc(db, 'doctors', id));
    if (!snap.exists()) throw new Error('Doctor not found.');
    return { data: withLegacyAliases({ id, ...snap.data() }) };
  },

  availability: async (id) => {
    const q = query(collection(db, 'doctorAvailability'), where('doctorId', '==', id));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
    return { data: rows };
  },

  addAvailability: async (id, { dayOfWeek, startTime, endTime, slotMinutes, isActive }) => {
    const ref = await addDoc(collection(db, 'doctorAvailability'), {
      doctorId: id,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      slot_minutes: slotMinutes || 30,
      is_active: isActive === undefined || isActive,
    });
    const snap = await getDoc(ref);
    return { data: withLegacyAliases({ id: ref.id, ...snap.data() }) };
  },

  updateAvailability: async (id, availabilityId, payload) => {
    const fields = {};
    if (payload.dayOfWeek !== undefined) fields.day_of_week = payload.dayOfWeek;
    if (payload.startTime !== undefined) fields.start_time = payload.startTime;
    if (payload.endTime !== undefined) fields.end_time = payload.endTime;
    if (payload.slotMinutes !== undefined) fields.slot_minutes = payload.slotMinutes;
    if (payload.isActive !== undefined) fields.is_active = payload.isActive;
    await updateDoc(doc(db, 'doctorAvailability', availabilityId), fields);
    const snap = await getDoc(doc(db, 'doctorAvailability', availabilityId));
    return { data: { id: availabilityId, ...snap.data() } };
  },

  removeAvailability: async (id, availabilityId) => {
    await deleteDoc(doc(db, 'doctorAvailability', availabilityId));
    return { data: null };
  },

  // Delegates to the shared scheduling module - the exact same slot
  // generator used by the transactional booking flow in
  // appointments.service.js, so what's shown here is guaranteed to be
  // what booking will actually accept.
  availableSlots: async (id, date) => {
    const slots = await getAvailableSlotsForDoctor(id, date);
    return { data: slots };
  },
};
