// src/firebase/config.js
// Single Firebase app initialization for the whole client. All Firebase
// config values are public by design (they identify your project, they
// are not secrets - see https://firebase.google.com/docs/projects/api-keys)
// and are read from Vite env vars so nothing is hard-coded, per the
// migration requirement not to hard-code secrets. Real access control
// lives entirely in firestore.rules, not in keeping this config hidden.

import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  // Fails loudly and immediately at app startup rather than letting
  // every Firestore call fail mysteriously one at a time - see
  // client/.env.example for what needs to be set.
  throw new Error(
    'Firebase config is missing. Copy client/.env.example to client/.env and fill in your Firebase project\'s config values (Firebase Console -> Project Settings -> General -> Your apps).'
  );
}

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Persistent local cache (IndexedDB) with multi-tab support - lets
// already-fetched data render instantly on repeat visits/tab switches
// and reduces redundant reads against the free tier's daily quota. This
// replaces what would have been a browser-side "offline-friendly"
// concern in the old system; Firestore handles it natively.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

/**
 * A SECOND, independent Firebase app instance - used exclusively for
 * admin-initiated account creation (POST /auth/register and
 * POST /patients/:id/portal-access in the old backend).
 *
 * Why this exists: createUserWithEmailAndPassword() on the DEFAULT auth
 * instance immediately signs the browser in as the newly created user,
 * which would silently log the acting admin out of their own session
 * mid-workflow. Creating the new account on a throwaway second app
 * instance (which is never used for anything else and is discarded
 * right after) avoids that entirely - the admin's own session on the
 * default `auth` instance is never touched.
 */
export function getSecondaryAuth() {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  return getAuth(secondaryApp);
}

export function getExistingApps() {
  return getApps();
}
