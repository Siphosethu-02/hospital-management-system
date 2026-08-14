// src/services/auth.service.js
// Same exported shape as the old Axios version (login/logout/me/register/
// changePassword, each resolving to { data: ... }) so the ~69 existing
// page components that call authService.* don't need to change - only
// what happens underneath does. Firebase Auth replaces the old
// JWT-issuing Express endpoints entirely; there is no server anywhere
// in this call path.

import {
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  reauthenticateWithCredential,
  updatePassword,
  EmailAuthProvider,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { auth, db, getSecondaryAuth } from '../firebase/config';
import { withLegacyAliases } from '../firebase/firestoreUtils';

/** Builds the same { role, role_name, doctorProfile, patientProfile, ... } shape the old /auth/me returned, from Firestore. */
async function buildUserProfile(uid) {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) {
    throw new Error('No profile found for this account. Contact an administrator.');
  }
  const userData = userSnap.data();
  const profile = withLegacyAliases({
    id: uid,
    ...userData,
    role_name: userData.role, // kept for the handful of components that read role_name directly off OTHER users' rows
  });

  if (userData.role === 'doctor') {
    const doctorSnap = await getDoc(doc(db, 'doctors', uid));
    profile.doctorProfile = doctorSnap.exists() ? { id: uid, ...doctorSnap.data() } : null;
  }

  if (userData.role === 'patient') {
    const q = query(collection(db, 'patients'), where('userId', '==', uid));
    const snap = await getDocs(q);
    profile.patientProfile = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  return profile;
}

export const authService = {
  login: async (email, password, rememberMe) => {
    // Mirrors the old 30-day-vs-7-day "remember me" distinction: local
    // persistence survives closing the browser, session persistence
    // does not.
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const profile = await buildUserProfile(credential.user.uid);
    if (profile.isActive === false) {
      await signOut(auth);
      throw new Error('This account has been deactivated. Contact an administrator.');
    }
    return { data: { user: profile } };
  },

  logout: async () => {
    await signOut(auth);
    return { data: null };
  },

  me: async () => {
    if (!auth.currentUser) throw new Error('Not signed in.');
    const profile = await buildUserProfile(auth.currentUser.uid);
    return { data: profile };
  },

  /**
   * Admin-only staff account creation - the replacement for
   * POST /auth/register. Uses a throwaway secondary Firebase App
   * instance to create the Auth user WITHOUT signing the current admin
   * out of their own session (see firebase/config.js for why). The
   * users/{uid} Firestore document is then written using the admin's
   * own (default app) credentials, which is what firestore.rules
   * actually checks - isAdmin() on the DEFAULT auth context.
   */
  register: async ({ email, password, firstName, lastName, phone, role }) => {
    const secondaryAuth = getSecondaryAuth();
    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = credential.user.uid;

      await setDoc(doc(db, 'users', uid), {
        role,
        firstName,
        lastName,
        email,
        phone: phone || null,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // A doctor account is never left without a matching profile
      // document - every appointment/prescription/record/lab-test
      // creation reads a doctor's name and department straight from
      // doctors/{uid} (see FIRESTORE_SCHEMA.md's note on why firstName/
      // lastName are duplicated here), so it has to exist from the
      // moment the account does, even with the doctor-specific fields
      // still unset until an admin fills them in via the Doctors page.
      if (role === 'doctor') {
        await setDoc(doc(db, 'doctors', uid), {
          firstName,
          lastName,
          departmentId: null,
          departmentName: null,
          specialization: null,
          qualification: null,
          licenseNumber: null,
          yearsOfExperience: null,
          consultationFee: null,
          bio: null,
          roomNumber: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      return { data: { id: uid, role, firstName, lastName, email, phone } };
    } finally {
      await signOut(secondaryAuth);
    }
  },

  changePassword: async ({ currentPassword, newPassword }) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in.');
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    return { data: null };
  },
};

export { buildUserProfile };
