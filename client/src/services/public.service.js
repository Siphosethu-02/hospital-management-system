// src/services/public.service.js
// Unauthenticated calls for the marketing site. No auth check happens
// here in code - firestore.rules is what actually allows an anonymous
// visitor to read these two collections (see the public-read tradeoff
// documented on the `doctors` and `departments` rules). This file
// curates which fields the PUBLIC PAGES display, as the closest
// available equivalent to what the old server's public.controller.js
// did by only ever returning a hand-picked subset - it is a display
// convention, not a security boundary; the boundary is firestore.rules.

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

export const publicService = {
  departments: async () => {
    const q = query(collection(db, 'departments'), where('isActive', '==', true));
    const snap = await getDocs(q);
    const rows = snap.docs
      .map((d) => ({ id: d.id, name: d.data().name, description: d.data().description }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { data: rows };
  },

  doctors: async ({ search, departmentId } = {}) => {
    let q = collection(db, 'doctors');
    if (departmentId) q = query(q, where('departmentId', '==', departmentId));
    const snap = await getDocs(q);
    let rows = snap.docs.map((d) => ({
      id: d.id,
      firstName: d.data().firstName,
      lastName: d.data().lastName,
      specialization: d.data().specialization,
      qualification: d.data().qualification,
      yearsOfExperience: d.data().yearsOfExperience,
      bio: d.data().bio,
      departmentName: d.data().departmentName,
    }));
    if (search) {
      const q2 = search.toLowerCase();
      rows = rows.filter((d) => `${d.firstName} ${d.lastName}`.toLowerCase().includes(q2) || d.specialization?.toLowerCase().includes(q2));
    }
    return { data: rows.sort((a, b) => a.lastName?.localeCompare(b.lastName)) };
  },
};
