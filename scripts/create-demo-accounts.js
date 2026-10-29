// scripts/create-demo-accounts.js
//
// Creates (or repairs) the 7 demo login accounts in Firebase, so the
// credentials in README.md / DEMO_USERS.md actually work. Does NOT need
// MySQL - unlike migrate-to-firestore.js, this talks to Firebase only.
//
// For each demo account it:
//   - creates the Firebase Auth login, or if it already exists, resets
//     its password to the documented demo password and re-enables it
//   - writes the users/{uid} profile with the right role (keeps any
//     existing name/phone)
//   - doctor: makes sure a doctors/{uid} profile exists
//   - patient: makes sure a linked patients record exists
//
// Safe to run more than once.
//
// SETUP (one time):
//   1. Firebase Console -> Project settings (gear) -> Service accounts
//      -> "Generate new private key". Save the file into this scripts
//      folder as serviceAccountKey.json. NEVER upload or share it - it
//      is ignored by git already.
//   2. cd scripts
//      npm install
//      node create-demo-accounts.js

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(KEY_PATH)) {
  console.error(
    '\nMissing scripts/serviceAccountKey.json\n' +
    'Firebase Console -> Project settings -> Service accounts -> Generate new private key,\n' +
    'save it in the scripts folder as serviceAccountKey.json, then run this again.\n'
  );
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();
const auth = admin.auth();
const now = admin.firestore.FieldValue.serverTimestamp();

const DEMO_ACCOUNTS = [
  { email: 'admin@hms.local', password: 'ChangeMe123!', role: 'admin', firstName: 'System', lastName: 'Administrator' },
  { email: 'doctor@medicarehms.demo', password: 'Demo@1234', role: 'doctor', firstName: 'Sarah', lastName: 'Mitchell' },
  { email: 'nurse@medicarehms.demo', password: 'Demo@1234', role: 'nurse', firstName: 'Demo', lastName: 'Nurse' },
  { email: 'receptionist@medicarehms.demo', password: 'Demo@1234', role: 'receptionist', firstName: 'Demo', lastName: 'Receptionist' },
  { email: 'pharmacist@medicarehms.demo', password: 'Demo@1234', role: 'pharmacist', firstName: 'Demo', lastName: 'Pharmacist' },
  { email: 'lab@medicarehms.demo', password: 'Demo@1234', role: 'lab_staff', firstName: 'Demo', lastName: 'Lab Staff' },
  { email: 'patient@medicarehms.demo', password: 'Demo@1234', role: 'patient', firstName: 'Demo', lastName: 'Patient' },
];

async function upsertAuthUser(acc) {
  try {
    const existing = await auth.getUserByEmail(acc.email);
    await auth.updateUser(existing.uid, { password: acc.password, disabled: false });
    return { uid: existing.uid, created: false };
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    const created = await auth.createUser({
      email: acc.email,
      password: acc.password,
      displayName: `${acc.firstName} ${acc.lastName}`,
    });
    return { uid: created.uid, created: true };
  }
}

async function upsertUserDoc(uid, acc) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const old = snap.exists ? snap.data() : {};
  await ref.set({
    role: acc.role,
    firstName: old.firstName || acc.firstName,
    lastName: old.lastName || acc.lastName,
    email: acc.email,
    phone: old.phone || null,
    isActive: true,
    createdAt: old.createdAt || now,
    updatedAt: now,
  });
  return { first: old.firstName || acc.firstName, last: old.lastName || acc.lastName };
}

async function ensureDoctorProfile(uid, name) {
  const ref = db.collection('doctors').doc(uid);
  if ((await ref.get()).exists) return;
  await ref.set({
    firstName: name.first, lastName: name.last,
    departmentId: null, departmentName: null, specialization: 'General Practice',
    qualification: null, licenseNumber: null, yearsOfExperience: null,
    consultationFee: null, bio: null, roomNumber: null,
    createdAt: now, updatedAt: now,
  });
}

async function ensurePatientRecord(uid, acc, name) {
  const linked = await db.collection('patients').where('userId', '==', uid).limit(1).get();
  if (!linked.empty) return linked.docs[0].data().patientCode;

  return db.runTransaction(async (tx) => {
    const year = new Date().getFullYear();
    const counterRef = db.collection('counters').doc(`patients-${year}`);
    const counterSnap = await tx.get(counterRef);
    const next = (counterSnap.exists ? counterSnap.data().value : 0) + 1;
    const patientCode = `PT-${year}-${String(next).padStart(6, '0')}`;
    tx.set(counterRef, { value: next }, { merge: true });
    tx.set(db.collection('patients').doc(uid), {
      patientCode, userId: uid,
      firstName: name.first, lastName: name.last,
      dateOfBirth: '1995-01-01', gender: 'other', bloodGroup: null,
      phone: null, email: acc.email, address: null, city: null,
      allergies: null, chronicConditions: null,
      emergencyContactName: null, emergencyContactPhone: null, emergencyContactRelation: null,
      insuranceProvider: null, insurancePolicyNumber: null, profileImageData: null,
      registeredBy: uid, registeredByName: 'Demo setup script',
      isActive: true, createdAt: now, updatedAt: now,
    });
    return patientCode;
  });
}

(async () => {
  console.log('\nSetting up demo accounts...\n');
  for (const acc of DEMO_ACCOUNTS) {
    try {
      const { uid, created } = await upsertAuthUser(acc);
      const name = await upsertUserDoc(uid, acc);
      let extra = '';
      if (acc.role === 'doctor') await ensureDoctorProfile(uid, name);
      if (acc.role === 'patient') extra = `  (patient ${await ensurePatientRecord(uid, acc, name)})`;
      console.log(`  OK  ${acc.role.padEnd(12)} ${acc.email.padEnd(32)} ${created ? 'created' : 'password reset'}${extra}`);
    } catch (err) {
      console.log(`  FAILED  ${acc.email}: ${err.message}`);
    }
  }
  console.log('\nDone. Sign in at your site with the emails and passwords in README.md.\n');
  process.exit(0);
})();
