// src/firebase/scheduling.js
// The single source of truth for "what slots are open for this doctor
// on this date" - used by doctors.service.js (display) AND
// appointments.service.js's booking transaction (final re-check right
// before the write), so what's shown is guaranteed to match what
// booking will accept.
//
// IMPORTANT: this queries `slotLocks`, not `appointments`, to
// determine which times are taken - and that's a deliberate fix, not
// the original design. Checking slot availability means seeing WHICH
// times are occupied for a doctor, including times booked by OTHER
// patients - but firestore.rules only lets a patient read appointment
// documents that are their OWN (resource.data.patientUserId ==
// request.auth.uid). A patient's availability query would need to see
// other patients' appointment documents just to know a time is taken,
// which Firestore's rule engine can't verify is safe for an arbitrary
// query and rejects outright ("Missing or insufficient permissions") -
// and even if it could, exposing another patient's full appointment
// document (their name, their reason for visit) just to check a time
// slot would be a real privacy leak.
//
// slotLocks solves both problems: each lock document contains ONLY
// {appointmentId, doctorId, scheduledAt, createdAt} - no patient-
// identifying information at all - and its read rule
// (`isStaff() || isPatient()`) doesn't depend on resource.data, so any
// signed-in staff member or patient can safely read the whole
// collection to check occupancy without ever seeing whose booking it
// is. A lock's mere existence for an exact scheduledAt means that
// slot is taken; deleting it (done on cancellation - see
// appointments.service.js) is what frees it again. Because slots are
// always generated from a fixed, non-overlapping grid (overlapping
// availability windows are rejected at creation), checking for an
// exact scheduledAt match is sufficient - no interval/duration overlap
// math is needed the way it would be with arbitrary appointment times.

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './config';

/**
 * @param {string} doctorId
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {Promise<Array<{startsAt: string, durationMinutes: number}>>}
 */
export async function getAvailableSlotsForDoctor(doctorId, dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = date.getDay();

  const availQuery = query(
    collection(db, 'doctorAvailability'),
    where('doctorId', '==', doctorId),
    where('day_of_week', '==', dayOfWeek),
    where('is_active', '==', true)
  );
  const availSnap = await getDocs(availQuery);
  const windows = availSnap.docs.map((d) => d.data());
  if (windows.length === 0) return [];

  // ISO strings for the same calendar day sort/compare correctly as
  // plain strings, so this range filter works without needing
  // Timestamp conversion - slotLocks.scheduledAt is stored as a string
  // (see appointments.service.js), not a Firestore Timestamp.
  const dayStartISO = new Date(`${dateStr}T00:00:00`).toISOString();
  const dayEndISO = new Date(`${dateStr}T23:59:59.999`).toISOString();
  const lockQuery = query(
    collection(db, 'slotLocks'),
    where('doctorId', '==', doctorId),
    where('scheduledAt', '>=', dayStartISO),
    where('scheduledAt', '<=', dayEndISO)
  );
  const lockSnap = await getDocs(lockQuery);
  const takenTimes = new Set(lockSnap.docs.map((d) => d.data().scheduledAt));

  const now = Date.now();
  const isToday = dateStr === new Date().toISOString().slice(0, 10);

  const slots = [];
  for (const win of windows) {
    const slotMs = win.slot_minutes * 60000;
    let cursor = new Date(`${dateStr}T${win.start_time}`).getTime();
    const windowEnd = new Date(`${dateStr}T${win.end_time}`).getTime();

    while (cursor + slotMs <= windowEnd) {
      const startsAt = new Date(cursor).toISOString();
      const isPast = isToday && cursor <= now;
      if (!takenTimes.has(startsAt) && !isPast) {
        slots.push({ startsAt, durationMinutes: win.slot_minutes });
      }
      cursor += slotMs;
    }
  }

  return slots;
}
