// src/firebase/audit.js
// Client-side replacement for the old server's logAction() helper -
// see the "Important trust difference" note in FIRESTORE_SCHEMA.md's
// auditLogs section for the honest limitation here: this write happens
// from the same browser session performing the action, not from
// trusted server code, so it's a record of what the UI reported doing
// rather than an unforgeable guarantee. firestore.rules still enforces
// that an entry can only ever be self-attributed and, once written,
// can never be edited or deleted by anyone, including admins.

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './config';

export async function logAction({ action, entityType, entityId, metadata }) {
  const user = auth.currentUser;
  if (!user) return; // best-effort - never block or throw on a logging failure

  try {
    await addDoc(collection(db, 'auditLogs'), {
      userId: user.uid,
      userName: user.displayName || user.email || user.uid,
      action,
      entityType,
      entityId: String(entityId),
      metadata: metadata || null,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Logging must never break the action it's describing.
  }
}
