// scripts/migrate-to-firestore.js
//
// One-off tool, NOT part of the deployed app: reads your existing
// MySQL database (the same one docker-compose.yml runs) and writes
// equivalent documents into Firestore, following the exact shapes in
// FIRESTORE_SCHEMA.md. Run this ONCE, from your own machine, before
// switching the deployed app over to the Firebase version.
//
// WHY THE ADMIN SDK IS SAFE TO USE HERE (read this if you're unsure
// whether this conflicts with the "zero Cloud Functions" design):
// this script runs on YOUR computer, once, as a plain Node.js process -
// it is not deployed, not hosted, and never runs as part of the live
// app. The Firebase Admin SDK itself costs nothing to use; what costs
// money is deploying server CODE that Google hosts and runs for you
// (Cloud Functions, Cloud Run). Running `node migrate-to-firestore.js`
// on your laptop is no different, cost-wise, from running any other
// local script against a cloud API - it is the same category of
// action as using the Firebase Console itself.
//
// SETUP:
//   1. Firebase Console -> Project Settings -> Service Accounts ->
//      "Generate new private key". Save the downloaded JSON as
//      scripts/serviceAccountKey.json (already in .gitignore - NEVER
//      commit this file, it grants full admin access to your project).
//   2. cd scripts && npm install
//   3. Make sure your MySQL database is running and reachable (e.g.
//      `docker compose up mysql -d` from the project root) and that
//      server/.env has the right DB_* values - this script reuses them.
//   4. From the project root: npm run migrate:firestore
//      (or `cd scripts && npm run migrate`)
//
// SCOPE, STATED PLAINLY: this migrates the demo/seed dataset your
// existing seed.js generates - accounts, patients, departments,
// doctors, availability, appointments, medical records, vitals,
// prescriptions, pharmacy inventory, lab tests, invoices,
// notifications, and audit logs. Passwords cannot be migrated (bcrypt
// hashes aren't compatible with Firebase Auth's format) - every
// migrated account gets a fresh password instead; the demo accounts
// get the SAME passwords already documented in DEMO_USERS.md, real
// staff accounts get a random one printed at the end for you to relay
// securely and have the person change on first login.
//
// Run this against a fresh/test Firebase project first if you have any
// doubt - it's straightforward to delete a Firestore database and
// start over, much less so to unwind a bad write against a live one.

require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(
    '\nMissing scripts/serviceAccountKey.json.\n' +
    'Firebase Console -> Project Settings -> Service Accounts -> Generate new private key,\n' +
    'save the file as scripts/serviceAccountKey.json, then re-run this script.\n'
  );
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)) });
const db = admin.firestore();
const authAdmin = admin.auth();

const DEMO_PASSWORDS = {
  'admin@hms.local': 'ChangeMe123!',
  'doctor@medicarehms.demo': 'Demo@1234',
  'nurse@medicarehms.demo': 'Demo@1234',
  'receptionist@medicarehms.demo': 'Demo@1234',
  'pharmacist@medicarehms.demo': 'Demo@1234',
  'lab@medicarehms.demo': 'Demo@1234',
  'patient@medicarehms.demo': 'Demo@1234',
};

function randomPassword() {
  return `Temp${Math.random().toString(36).slice(2, 10)}!1`;
}

// Old MySQL integer id -> new Firestore id (or Firebase Auth uid for
// users/doctors), built up as each step runs and consumed by every
// later step that needs to resolve a foreign key.
const idMaps = {
  users: new Map(),      // mysql users.id -> firebase uid
  patients: new Map(),   // mysql patients.id -> firestore patients/{id}
  departments: new Map(),// mysql departments.id -> firestore departments/{id}
  medicines: new Map(),  // mysql medicines.id -> firestore medicines/{id}
  categories: new Map(), // mysql medicine_categories.id -> firestore medicineCategories/{id}
};
const generatedPasswords = [];

async function connectMysql() {
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hospital_management_system',
  });
}

// -----------------------------------------------------------------------
// Step 1: users + roles (roles fold into a `role` string field - see
// FIRESTORE_SCHEMA.md, there is no separate roles collection)
// -----------------------------------------------------------------------
async function migrateUsers(conn) {
  const [rows] = await conn.execute(
    `SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id`
  );
  console.log(`Migrating ${rows.length} users...`);

  for (const row of rows) {
    const password = DEMO_PASSWORDS[row.email] || randomPassword();
    if (!DEMO_PASSWORDS[row.email]) generatedPasswords.push({ email: row.email, password });

    let userRecord;
    try {
      userRecord = await authAdmin.createUser({
        email: row.email,
        password,
        displayName: `${row.first_name} ${row.last_name}`,
        disabled: !row.is_active,
      });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        userRecord = await authAdmin.getUserByEmail(row.email);
      } else {
        throw err;
      }
    }

    await db.collection('users').doc(userRecord.uid).set({
      role: row.role_name,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone || null,
      isActive: !!row.is_active,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(row.created_at)),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    idMaps.users.set(row.id, userRecord.uid);
  }
  console.log(`  -> ${idMaps.users.size} users migrated.`);
}

// -----------------------------------------------------------------------
// Step 2: doctors (doc id = same uid as their linked user)
// -----------------------------------------------------------------------
async function migrateDoctors(conn) {
  const [rows] = await conn.execute('SELECT * FROM doctors');
  console.log(`Migrating ${rows.length} doctors...`);

  for (const row of rows) {
    const uid = idMaps.users.get(row.user_id);
    if (!uid) { console.warn(`  Skipping doctor ${row.id}: no matching migrated user.`); continue; }
    const userDoc = await db.collection('users').doc(uid).get();

    await db.collection('doctors').doc(uid).set({
      firstName: userDoc.data().firstName,
      lastName: userDoc.data().lastName,
      departmentId: null, // resolved in migrateDepartments()
      departmentName: null,
      specialization: row.specialization || null,
      qualification: row.qualification || null,
      licenseNumber: row.license_number || null,
      yearsOfExperience: row.years_of_experience || null,
      consultationFee: row.consultation_fee ? Number(row.consultation_fee) : null,
      bio: row.bio || null,
      roomNumber: row.room_number || null,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }
  console.log(`  -> doctors migrated.`);
}

// -----------------------------------------------------------------------
// Step 3: departments, then back-fill each doctor's departmentId/Name
// -----------------------------------------------------------------------
async function migrateDepartments(conn) {
  const [rows] = await conn.execute('SELECT * FROM departments');
  console.log(`Migrating ${rows.length} departments...`);

  for (const row of rows) {
    const ref = db.collection('departments').doc();
    idMaps.departments.set(row.id, ref.id);

    let headDoctorUid = null;
    if (row.head_doctor_id) {
      const [[headDoctorRow]] = await conn.execute('SELECT user_id FROM doctors WHERE id = ?', [row.head_doctor_id]);
      headDoctorUid = headDoctorRow ? idMaps.users.get(headDoctorRow.user_id) || null : null;
    }

    await ref.set({
      name: row.name,
      description: row.description || null,
      headDoctorId: headDoctorUid,
      headDoctorName: null, // cosmetic only, left null - re-set it via the app's Departments page if needed
      doctorCount: 0, // recomputed below
      isActive: !!row.is_active,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }

  // Back-fill each doctor's department + recompute doctorCount, now
  // that department Firestore IDs exist.
  const [doctorRows] = await conn.execute('SELECT * FROM doctors WHERE department_id IS NOT NULL');
  const countByDept = new Map();
  for (const row of doctorRows) {
    const uid = idMaps.users.get(row.user_id);
    const deptId = idMaps.departments.get(row.department_id);
    if (!uid || !deptId) continue;
    const deptSnap = await db.collection('departments').doc(deptId).get();
    await db.collection('doctors').doc(uid).update({ departmentId: deptId, departmentName: deptSnap.data().name });
    countByDept.set(deptId, (countByDept.get(deptId) || 0) + 1);
  }
  for (const [deptId, count] of countByDept.entries()) {
    await db.collection('departments').doc(deptId).update({ doctorCount: count });
  }
  console.log(`  -> departments migrated and doctor counts recomputed.`);
}

// -----------------------------------------------------------------------
// Step 4: patients
// -----------------------------------------------------------------------
async function migratePatients(conn) {
  const [rows] = await conn.execute('SELECT * FROM patients');
  console.log(`Migrating ${rows.length} patients...`);

  for (const row of rows) {
    const ref = db.collection('patients').doc();
    idMaps.patients.set(row.id, ref.id);
    await ref.set({
      patientCode: row.patient_code,
      userId: row.user_id ? idMaps.users.get(row.user_id) || null : null,
      firstName: row.first_name,
      lastName: row.last_name,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      bloodGroup: row.blood_group || null,
      phone: row.phone || null,
      email: row.email || null,
      address: row.address || null,
      city: row.city || null,
      allergies: row.allergies || null,
      chronicConditions: row.chronic_conditions || null,
      emergencyContactName: row.emergency_contact_name || null,
      emergencyContactPhone: row.emergency_contact_phone || null,
      emergencyContactRelation: row.emergency_contact_relation || null,
      insuranceProvider: row.insurance_provider || null,
      insurancePolicyNumber: row.insurance_policy_number || null,
      profileImageData: null, // old system stored a file URL, not portable - see FIRESTORE_SCHEMA.md
      registeredBy: row.registered_by ? idMaps.users.get(row.registered_by) || null : null,
      isActive: !!row.is_active,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(row.created_at)),
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }
  console.log(`  -> ${idMaps.patients.size} patients migrated.`);
}

// -----------------------------------------------------------------------
// Step 5: doctor availability
// -----------------------------------------------------------------------
async function migrateAvailability(conn) {
  const [rows] = await conn.execute('SELECT a.*, d.user_id FROM doctor_availability a JOIN doctors d ON d.id = a.doctor_id');
  console.log(`Migrating ${rows.length} availability windows...`);
  for (const row of rows) {
    const uid = idMaps.users.get(row.user_id);
    if (!uid) continue;
    await db.collection('doctorAvailability').add({
      doctorId: uid,
      day_of_week: row.day_of_week,
      start_time: row.start_time.slice(0, 5),
      end_time: row.end_time.slice(0, 5),
      slot_minutes: row.slot_minutes,
      is_active: !!row.is_active,
    });
  }
  console.log(`  -> availability migrated.`);
}

// -----------------------------------------------------------------------
// Step 6: appointments (+ matching slotLocks for anything still
// blocking, so the migrated data is immediately booking-safe)
// -----------------------------------------------------------------------
async function migrateAppointments(conn) {
  const [rows] = await conn.execute(`
    SELECT a.*, p.first_name AS p_first, p.last_name AS p_last, p.user_id AS patient_user_id,
           du.first_name AS d_first, du.last_name AS d_last, doc.user_id AS doctor_user_id,
           dep.name AS dep_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors doc ON doc.id = a.doctor_id
    JOIN users du ON du.id = doc.user_id
    LEFT JOIN departments dep ON dep.id = a.department_id
  `);
  console.log(`Migrating ${rows.length} appointments...`);
  const BLOCKING = ['scheduled', 'confirmed', 'checked_in', 'completed', 'no_show'];

  for (const row of rows) {
    const patientId = idMaps.patients.get(row.patient_id);
    const doctorUid = idMaps.users.get(row.doctor_user_id);
    if (!patientId || !doctorUid) continue;

    const scheduledAt = admin.firestore.Timestamp.fromDate(new Date(row.scheduled_at));
    const ref = db.collection('appointments').doc();
    await ref.set({
      patientId, patientName: `${row.p_first} ${row.p_last}`,
      patientUserId: row.patient_user_id ? idMaps.users.get(row.patient_user_id) || null : null,
      doctorId: doctorUid, doctorName: `${row.d_first} ${row.d_last}`,
      departmentId: row.department_id ? idMaps.departments.get(row.department_id) || null : null,
      departmentName: row.dep_name || null,
      scheduledAt, durationMinutes: row.duration_minutes,
      reason: row.reason || null, status: row.status, cancellationReason: row.cancellation_reason || null,
      bookedBy: row.booked_by ? idMaps.users.get(row.booked_by) || null : null,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(row.created_at)),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    if (BLOCKING.includes(row.status)) {
      const lockId = `${doctorUid}_${new Date(row.scheduled_at).toISOString()}`;
      await db.collection('slotLocks').doc(lockId).set({
        appointmentId: ref.id, doctorId: doctorUid,
        scheduledAt: new Date(row.scheduled_at).toISOString(),
        createdAt: admin.firestore.Timestamp.now(),
      });
    }
  }
  console.log(`  -> appointments migrated.`);
}

// -----------------------------------------------------------------------
// Step 7: medical records + vitals
// -----------------------------------------------------------------------
async function migrateMedicalRecordsAndVitals(conn) {
  const [records] = await conn.execute(`
    SELECT mr.*, p.first_name AS p_first, p.last_name AS p_last, p.user_id AS patient_user_id,
           du.first_name AS d_first, du.last_name AS d_last, doc.user_id AS doctor_user_id
    FROM medical_records mr
    JOIN patients p ON p.id = mr.patient_id
    JOIN doctors doc ON doc.id = mr.doctor_id
    JOIN users du ON du.id = doc.user_id
  `);
  console.log(`Migrating ${records.length} medical records...`);
  for (const row of records) {
    const patientId = idMaps.patients.get(row.patient_id);
    const doctorUid = idMaps.users.get(row.doctor_user_id);
    if (!patientId || !doctorUid) continue;
    await db.collection('medicalRecords').add({
      patientId, patientName: `${row.p_first} ${row.p_last}`,
      patientUserId: row.patient_user_id ? idMaps.users.get(row.patient_user_id) || null : null,
      doctorId: doctorUid, doctorName: `${row.d_first} ${row.d_last}`,
      appointmentId: null, // not re-linked - appointment Firestore IDs are regenerated and not worth cross-mapping for demo data
      diagnosis: row.diagnosis, symptoms: row.symptoms || null, treatmentPlan: row.treatment_plan || null,
      doctorNotes: row.doctor_notes || null, followUpDate: row.follow_up_date || null,
      attachments: [], // old file URLs aren't portable - see FIRESTORE_SCHEMA.md
      createdAt: admin.firestore.Timestamp.fromDate(new Date(row.created_at)),
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }

  const [vitals] = await conn.execute('SELECT * FROM patient_vitals');
  console.log(`Migrating ${vitals.length} vitals records...`);
  for (const row of vitals) {
    const patientId = idMaps.patients.get(row.patient_id);
    if (!patientId) continue;
    await db.collection('vitals').add({
      patientId, appointmentId: null,
      recordedBy: row.recorded_by ? idMaps.users.get(row.recorded_by) || null : null,
      temperatureCelsius: row.temperature_celsius, heartRateBpm: row.heart_rate_bpm,
      bloodPressureSystolic: row.blood_pressure_systolic, bloodPressureDiastolic: row.blood_pressure_diastolic,
      respiratoryRate: row.respiratory_rate, oxygenSaturation: row.oxygen_saturation,
      weightKg: row.weight_kg, heightCm: row.height_cm, notes: row.notes || null,
      recordedAt: admin.firestore.Timestamp.fromDate(new Date(row.recorded_at)),
    });
  }
  console.log(`  -> medical records and vitals migrated.`);
}

// -----------------------------------------------------------------------
// Step 8: pharmacy (categories, medicines, stock, then prescriptions
// with embedded items)
// -----------------------------------------------------------------------
async function migratePharmacy(conn) {
  const [cats] = await conn.execute('SELECT * FROM medicine_categories');
  for (const row of cats) {
    const ref = db.collection('medicineCategories').doc();
    idMaps.categories.set(row.id, ref.id);
    await ref.set({ name: row.name });
  }

  const [meds] = await conn.execute('SELECT * FROM medicines');
  console.log(`Migrating ${meds.length} medicines...`);
  for (const row of meds) {
    const ref = db.collection('medicines').doc();
    idMaps.medicines.set(row.id, ref.id);
    await ref.set({
      name: row.name, categoryId: row.category_id ? idMaps.categories.get(row.category_id) || null : null,
      categoryName: null, genericName: row.generic_name || null, manufacturer: row.manufacturer || null,
      unit: row.unit, unitPrice: Number(row.unit_price), reorderLevel: row.reorder_level,
      isActive: !!row.is_active, currentStock: 0, // recomputed below from stock batches
      createdAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now(),
    });
  }

  const [stock] = await conn.execute('SELECT * FROM medicine_stock');
  console.log(`Migrating ${stock.length} stock batches...`);
  const stockByMedicine = new Map();
  for (const row of stock) {
    const medicineId = idMaps.medicines.get(row.medicine_id);
    if (!medicineId) continue;
    const medSnap = await db.collection('medicines').doc(medicineId).get();
    await db.collection('medicineStock').add({
      medicineId, medicineName: medSnap.data().name, batchNumber: row.batch_number,
      quantity: row.quantity, expiryDate: row.expiry_date, supplier: row.supplier || null,
      receivedAt: admin.firestore.Timestamp.fromDate(new Date(row.received_at)),
      createdAt: admin.firestore.Timestamp.now(),
    });
    stockByMedicine.set(medicineId, (stockByMedicine.get(medicineId) || 0) + row.quantity);
  }
  for (const [medicineId, total] of stockByMedicine.entries()) {
    await db.collection('medicines').doc(medicineId).update({ currentStock: total });
  }

  const [prescriptions] = await conn.execute(`
    SELECT pr.*, p.first_name AS p_first, p.last_name AS p_last, p.user_id AS patient_user_id,
           du.first_name AS d_first, du.last_name AS d_last, doc.user_id AS doctor_user_id
    FROM prescriptions pr
    JOIN patients p ON p.id = pr.patient_id
    JOIN doctors doc ON doc.id = pr.doctor_id
    JOIN users du ON du.id = doc.user_id
  `);
  console.log(`Migrating ${prescriptions.length} prescriptions...`);
  for (const row of prescriptions) {
    const patientId = idMaps.patients.get(row.patient_id);
    const doctorUid = idMaps.users.get(row.doctor_user_id);
    if (!patientId || !doctorUid) continue;

    const [items] = await conn.execute(
      `SELECT pi.*, m.name AS medicine_name FROM prescription_items pi JOIN medicines m ON m.id = pi.medicine_id WHERE pi.prescription_id = ?`,
      [row.id]
    );

    await db.collection('prescriptions').add({
      patientId, patientName: `${row.p_first} ${row.p_last}`,
      patientUserId: row.patient_user_id ? idMaps.users.get(row.patient_user_id) || null : null,
      doctorId: doctorUid, doctorName: `${row.d_first} ${row.d_last}`,
      medicalRecordId: null, status: row.status, notes: row.notes || null,
      items: items.map((it, i) => ({
        id: `migrated-${row.id}-${i}`, medicineId: idMaps.medicines.get(it.medicine_id) || null,
        medicineName: it.medicine_name, dosage: it.dosage, frequency: it.frequency,
        durationDays: it.duration_days || null, quantity: it.quantity, instructions: it.instructions || null,
        isDispensed: !!it.is_dispensed,
        dispensedBy: it.dispensed_by ? idMaps.users.get(it.dispensed_by) || null : null,
        dispensedAt: it.dispensed_at ? new Date(it.dispensed_at).toISOString() : null,
      })),
      createdAt: admin.firestore.Timestamp.fromDate(new Date(row.created_at)),
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }
  console.log(`  -> pharmacy data migrated.`);
}

// -----------------------------------------------------------------------
// Step 9: lab tests (+ embedded result)
// -----------------------------------------------------------------------
async function migrateLabTests(conn) {
  const [rows] = await conn.execute(`
    SELECT lt.*, p.first_name AS p_first, p.last_name AS p_last, p.user_id AS patient_user_id,
           du.first_name AS d_first, du.last_name AS d_last, doc.user_id AS doctor_user_id
    FROM laboratory_tests lt
    JOIN patients p ON p.id = lt.patient_id
    JOIN doctors doc ON doc.id = lt.doctor_id
    JOIN users du ON du.id = doc.user_id
  `);
  console.log(`Migrating ${rows.length} lab tests...`);
  for (const row of rows) {
    const patientId = idMaps.patients.get(row.patient_id);
    const doctorUid = idMaps.users.get(row.doctor_user_id);
    if (!patientId || !doctorUid) continue;

    const [[resultRow]] = await conn.execute('SELECT * FROM laboratory_results WHERE test_id = ?', [row.id]);

    await db.collection('labTests').add({
      patientId, patientName: `${row.p_first} ${row.p_last}`,
      patientUserId: row.patient_user_id ? idMaps.users.get(row.patient_user_id) || null : null,
      doctorId: doctorUid, doctorName: `${row.d_first} ${row.d_last}`,
      medicalRecordId: null, testName: row.test_name, testType: row.test_type || null,
      priority: row.priority, notes: row.notes || null, status: row.status,
      requestedAt: admin.firestore.Timestamp.fromDate(new Date(row.requested_at)),
      result: resultRow ? {
        resultSummary: resultRow.result_summary || null,
        resultData: resultRow.result_data ? JSON.parse(resultRow.result_data) : null,
        reportFileName: null, reportFileData: null, // old file URL not portable
        uploadedBy: resultRow.uploaded_by ? idMaps.users.get(resultRow.uploaded_by) || null : null,
        uploadedAt: resultRow.uploaded_at ? new Date(resultRow.uploaded_at).toISOString() : null,
        reviewedBy: resultRow.reviewed_by ? idMaps.users.get(resultRow.reviewed_by) || null : null,
        reviewedAt: resultRow.reviewed_at ? new Date(resultRow.reviewed_at).toISOString() : null,
      } : null,
    });
  }
  console.log(`  -> lab tests migrated.`);
}

// -----------------------------------------------------------------------
// Step 10: invoices (+ embedded items/payments)
// -----------------------------------------------------------------------
async function migrateInvoices(conn) {
  const [rows] = await conn.execute(`
    SELECT i.*, p.first_name AS p_first, p.last_name AS p_last
    FROM invoices i JOIN patients p ON p.id = i.patient_id
  `);
  console.log(`Migrating ${rows.length} invoices...`);
  for (const row of rows) {
    const patientId = idMaps.patients.get(row.patient_id);
    if (!patientId) continue;

    const [items] = await conn.execute('SELECT * FROM invoice_items WHERE invoice_id = ?', [row.id]);
    const [payments] = await conn.execute('SELECT * FROM payments WHERE invoice_id = ?', [row.id]);

    await db.collection('invoices').add({
      invoiceNumber: row.invoice_number, patientId, patientName: `${row.p_first} ${row.p_last}`,
      appointmentId: null,
      subtotal: Number(row.subtotal), discount: Number(row.discount), tax: Number(row.tax),
      total: Number(row.total), amountPaid: Number(row.amount_paid), status: row.status,
      dueDate: row.due_date || null,
      createdBy: row.created_by ? idMaps.users.get(row.created_by) || null : null,
      items: items.map((it) => ({
        description: it.description, itemType: it.item_type, referenceId: it.reference_id,
        quantity: it.quantity, unitPrice: Number(it.unit_price), lineTotal: Number(it.line_total),
      })),
      payments: payments.map((p) => ({
        amount: Number(p.amount), paymentMethod: p.payment_method, referenceNumber: p.reference_number || null,
        receivedBy: p.received_by ? idMaps.users.get(p.received_by) || null : null,
        paidAt: new Date(p.paid_at).toISOString(),
      })),
      createdAt: admin.firestore.Timestamp.fromDate(new Date(row.created_at)),
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }
  console.log(`  -> invoices migrated.`);
}

// -----------------------------------------------------------------------
// Step 11: notifications + audit logs
// -----------------------------------------------------------------------
async function migrateNotificationsAndAuditLogs(conn) {
  const [notifications] = await conn.execute('SELECT * FROM notifications');
  console.log(`Migrating ${notifications.length} notifications...`);
  for (const row of notifications) {
    const userId = idMaps.users.get(row.user_id);
    if (!userId) continue;
    await db.collection('notifications').add({
      userId, type: row.type, title: row.title, message: row.message, isRead: !!row.is_read,
      referenceType: row.reference_type || null, referenceId: row.reference_id || null,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(row.created_at)),
    });
  }

  const [logs] = await conn.execute('SELECT * FROM audit_logs');
  console.log(`Migrating ${logs.length} audit log entries...`);
  for (const row of logs) {
    const userId = row.user_id ? idMaps.users.get(row.user_id) : null;
    if (!userId) continue;
    const userDoc = await db.collection('users').doc(userId).get();
    await db.collection('auditLogs').add({
      userId, userName: userDoc.exists ? `${userDoc.data().firstName} ${userDoc.data().lastName}` : 'Unknown',
      action: row.action, entityType: row.entity_type, entityId: String(row.entity_id),
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(row.created_at)),
    });
  }
  console.log(`  -> notifications and audit logs migrated.`);
}

// -----------------------------------------------------------------------
async function run() {
  const conn = await connectMysql();
  console.log('Connected to MySQL. Starting migration...\n');

  try {
    await migrateUsers(conn);
    await migrateDoctors(conn);
    await migrateDepartments(conn);
    await migratePatients(conn);
    await migrateAvailability(conn);
    await migrateAppointments(conn);
    await migrateMedicalRecordsAndVitals(conn);
    await migratePharmacy(conn);
    await migrateLabTests(conn);
    await migrateInvoices(conn);
    await migrateNotificationsAndAuditLogs(conn);

    console.log('\nMigration complete.');
    if (generatedPasswords.length) {
      console.log(`\n${generatedPasswords.length} non-demo account(s) received a new random password (bcrypt hashes cannot be imported into Firebase Auth):`);
      generatedPasswords.forEach(({ email, password }) => console.log(`  ${email} -> ${password}`));
      console.log('Relay these securely and have each person change their password after first login.');
    }
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
