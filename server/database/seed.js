// database/seed.js
// Seeds the database with:
//   1. Reference data (roles, departments, medicine categories) via seed.sql
//   2. One demo login per role (admin, doctor, nurse, receptionist,
//      pharmacist, lab_staff) with properly bcrypt-hashed passwords
//   3. A realistic demo dataset: medicines + stock, 50 patients,
//      appointments, medical records, prescriptions (with some items
//      actually dispensed through the real FIFO stock logic), lab tests
//      + results, invoices + payments, vitals, and notifications
//   4. DEMO_USERS.md at the project root, listing every login
//
// Usage: npm run db:seed  (also run automatically by the Docker
// backend's entrypoint on every container start - see
// server/docker-entrypoint.sh)
//
// IDEMPOTENCY
// -----------
// This script is safe to run repeatedly:
//   - The 6 demo accounts are looked up by email; only missing ones are
//     created (this mirrors the original admin-only seeding behavior).
//   - The entire "bulk" demo dataset (medicines, 50 patients,
//     appointments, records, prescriptions, lab tests, invoices,
//     notifications) is gated behind a single marker: a notification
//     row on the admin account titled MARKER_TITLE. If that marker
//     exists, the bulk step is skipped entirely - nothing further is
//     inserted, so re-running never creates duplicates.
//   - Overriding: to force the bulk dataset to be regenerated, delete
//     that one marker notification (or wipe the DB with
//     `docker compose down -v` and start fresh).
//
// This script reuses the SAME model layer the API itself uses
// (src/models/*), so patient codes, invoice numbers, and stock
// decrements are generated with exactly the same logic as real usage
// rather than a parallel, easy-to-drift copy of that logic.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const env = require('../src/config/env');
const { pool } = require('../src/config/db');
const { ROLES } = require('../src/utils/roles');

const userModel = require('../src/models/user.model');
const doctorModel = require('../src/models/doctor.model');
const departmentModel = require('../src/models/department.model');
const patientModel = require('../src/models/patient.model');
const appointmentModel = require('../src/models/appointment.model');
const medicalRecordModel = require('../src/models/medicalRecord.model');
const prescriptionModel = require('../src/models/prescription.model');
const medicineModel = require('../src/models/medicine.model');
const medicineStockModel = require('../src/models/medicineStock.model');
const labTestModel = require('../src/models/labTest.model');
const labResultModel = require('../src/models/labResult.model');
const invoiceModel = require('../src/models/invoice.model');
const notificationModel = require('../src/models/notification.model');
const vitalsModel = require('../src/models/vitals.model');
const doctorAvailabilityModel = require('../src/models/doctorAvailability.model');

const MARKER_TITLE = 'Demo Data Seed v1';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Demo@1234';
const CONSULTATION_FEE = 75.0;
const PATIENT_COUNT = 50;

// -----------------------------------------------------------------------
// Demo accounts - one per role. The admin account keeps its original
// email/password (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars, same
// as every earlier stage of this project) so nothing that already
// depends on it breaks; the other five are new.
// -----------------------------------------------------------------------
const DEMO_ACCOUNTS = [
  {
    role: ROLES.ADMIN,
    firstName: 'System',
    lastName: 'Administrator',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@hms.local',
    password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!',
    phone: '+1-555-0100',
  },
  {
    role: ROLES.DOCTOR,
    firstName: 'Sarah',
    lastName: 'Mitchell',
    email: 'doctor@medicarehms.demo',
    password: DEMO_PASSWORD,
    phone: '+1-555-0101',
  },
  {
    role: ROLES.NURSE,
    firstName: 'Emily',
    lastName: 'Johnson',
    email: 'nurse@medicarehms.demo',
    password: DEMO_PASSWORD,
    phone: '+1-555-0102',
  },
  {
    role: ROLES.RECEPTIONIST,
    firstName: 'Karen',
    lastName: 'Lewis',
    email: 'receptionist@medicarehms.demo',
    password: DEMO_PASSWORD,
    phone: '+1-555-0103',
  },
  {
    role: ROLES.PHARMACIST,
    firstName: 'David',
    lastName: 'Chen',
    email: 'pharmacist@medicarehms.demo',
    password: DEMO_PASSWORD,
    phone: '+1-555-0104',
  },
  {
    role: ROLES.LAB_STAFF,
    firstName: 'Michael',
    lastName: 'Brown',
    email: 'lab@medicarehms.demo',
    password: DEMO_PASSWORD,
    phone: '+1-555-0105',
  },
];

// -----------------------------------------------------------------------
// Demo medicines, grouped so each maps to one of the reference
// categories already inserted by seed.sql.
// -----------------------------------------------------------------------
const DEMO_MEDICINES = [
  { name: 'Paracetamol 500mg', category: 'Analgesics', generic: 'Acetaminophen', unit: 'tablet', price: 0.1, reorder: 50 },
  { name: 'Ibuprofen 400mg', category: 'Analgesics', generic: 'Ibuprofen', unit: 'tablet', price: 0.15, reorder: 50 },
  { name: 'Amoxicillin 500mg', category: 'Antibiotics', generic: 'Amoxicillin', unit: 'capsule', price: 0.3, reorder: 40 },
  { name: 'Azithromycin 250mg', category: 'Antibiotics', generic: 'Azithromycin', unit: 'tablet', price: 0.8, reorder: 30 },
  { name: 'Cetirizine 10mg', category: 'Antihistamines', generic: 'Cetirizine', unit: 'tablet', price: 0.12, reorder: 40 },
  { name: 'Loratadine 10mg', category: 'Antihistamines', generic: 'Loratadine', unit: 'tablet', price: 0.14, reorder: 40 },
  { name: 'Lisinopril 10mg', category: 'Antihypertensives', generic: 'Lisinopril', unit: 'tablet', price: 0.2, reorder: 30 },
  { name: 'Amlodipine 5mg', category: 'Antihypertensives', generic: 'Amlodipine', unit: 'tablet', price: 0.18, reorder: 30 },
  { name: 'Metformin 500mg', category: 'Antidiabetics', generic: 'Metformin', unit: 'tablet', price: 0.1, reorder: 50 },
  { name: 'Insulin Glargine', category: 'Antidiabetics', generic: 'Insulin Glargine', unit: 'vial', price: 25.0, reorder: 10, lowStock: true },
  { name: 'Vitamin D3 1000IU', category: 'Vitamins & Supplements', generic: 'Cholecalciferol', unit: 'tablet', price: 0.08, reorder: 60 },
  { name: 'Omeprazole 20mg', category: 'Gastrointestinal', generic: 'Omeprazole', unit: 'capsule', price: 0.22, reorder: 40 },
  { name: 'Salbutamol Inhaler', category: 'Respiratory', generic: 'Salbutamol', unit: 'inhaler', price: 8.5, reorder: 15, expiringSoon: true },
];

// -----------------------------------------------------------------------
// Diagnoses, each mapped to plausible symptoms/treatment text and the
// demo medicines a doctor would realistically prescribe for it.
// -----------------------------------------------------------------------
const DIAGNOSES = [
  { name: 'Hypertension', symptoms: 'Elevated blood pressure on repeat readings, occasional headaches.', treatment: 'Lifestyle modification counseling and antihypertensive therapy.', medicines: ['Lisinopril 10mg', 'Amlodipine 5mg'] },
  { name: 'Upper Respiratory Tract Infection', symptoms: 'Cough, sore throat, mild fever for 3 days.', treatment: 'Rest, fluids, and symptomatic treatment.', medicines: ['Paracetamol 500mg', 'Azithromycin 250mg'] },
  { name: 'Type 2 Diabetes Mellitus', symptoms: 'Increased thirst and fatigue; elevated fasting glucose.', treatment: 'Dietary counseling and glucose-lowering medication.', medicines: ['Metformin 500mg'] },
  { name: 'Seasonal Allergic Rhinitis', symptoms: 'Sneezing, nasal congestion, itchy watery eyes.', treatment: 'Antihistamines and allergen avoidance.', medicines: ['Cetirizine 10mg', 'Loratadine 10mg'] },
  { name: 'Gastroesophageal Reflux Disease', symptoms: 'Heartburn and regurgitation after meals.', treatment: 'Proton pump inhibitor and dietary changes.', medicines: ['Omeprazole 20mg'] },
  { name: 'Acute Bronchitis', symptoms: 'Persistent cough, chest discomfort, mild wheeze.', treatment: 'Bronchodilator and supportive care.', medicines: ['Salbutamol Inhaler', 'Paracetamol 500mg'] },
  { name: 'Osteoarthritis', symptoms: 'Joint pain and stiffness, worse with activity.', treatment: 'Analgesics and physical therapy referral.', medicines: ['Ibuprofen 400mg'] },
  { name: 'Urinary Tract Infection', symptoms: 'Burning on urination, urinary frequency.', treatment: 'Course of oral antibiotics.', medicines: ['Amoxicillin 500mg'] },
  { name: 'Vitamin D Deficiency', symptoms: 'Generalized fatigue and mild bone discomfort.', treatment: 'Vitamin D supplementation.', medicines: ['Vitamin D3 1000IU'] },
  { name: 'Migraine', symptoms: 'Recurrent throbbing headache with light sensitivity.', treatment: 'Analgesics and trigger avoidance counseling.', medicines: ['Ibuprofen 400mg', 'Paracetamol 500mg'] },
];

const LAB_TESTS = [
  { name: 'Complete Blood Count', type: 'blood' },
  { name: 'Lipid Panel', type: 'blood' },
  { name: 'Fasting Blood Glucose', type: 'blood' },
  { name: 'Urinalysis', type: 'urine' },
  { name: 'Liver Function Test', type: 'blood' },
  { name: 'Thyroid Stimulating Hormone', type: 'blood' },
  { name: 'Chest X-Ray', type: 'imaging' },
  { name: 'COVID-19 PCR', type: 'swab' },
];

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Daniel', 'Lisa',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris',
];
const CITIES = ['Springfield', 'Riverside', 'Franklin', 'Greenville', 'Fairview', 'Salem', 'Georgetown', 'Madison', 'Clinton', 'Arlington'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];
const ALLERGIES = ['None known', 'Penicillin', 'Peanuts', 'Latex', 'Sulfa drugs', 'None known', 'Shellfish', 'None known'];
const CHRONIC_CONDITIONS = ['None', 'Hypertension', 'Type 2 Diabetes', 'Asthma', 'None', 'Hyperlipidemia', 'None', 'Arthritis'];
const RELATIONS = ['Spouse', 'Parent', 'Sibling', 'Friend', 'Child'];
const INSURERS = ['BlueCross BlueShield', 'Aetna', 'UnitedHealthcare', 'Cigna', null];

// -----------------------------------------------------------------------
// Small deterministic helpers
// -----------------------------------------------------------------------
function pick(arr, i) {
  return arr[i % arr.length];
}

function daysFromToday(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function log(message) {
  console.log(`[db:seed] ${message}`);
}

// -----------------------------------------------------------------------
// Step 1: reference data (roles, departments, medicine categories) -
// unchanged from earlier stages, run as raw multi-statement SQL since
// it's simpler than the model layer for a batch of INSERT IGNOREs.
// -----------------------------------------------------------------------
async function seedReferenceData() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hospital_management_system',
    multipleStatements: true,
  });

  try {
    const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    log('Inserting reference data (roles, departments, medicine categories)...');
    await connection.query(seedSql);
  } finally {
    await connection.end();
  }
}

// -----------------------------------------------------------------------
// Step 2: the six demo accounts. Each is created only if missing; a
// doctor also gets (and keeps up to date) a full `doctors` profile row.
// -----------------------------------------------------------------------
async function ensureDemoAccounts() {
  const accounts = {};

  for (const def of DEMO_ACCOUNTS) {
    let user = await userModel.findByEmail(def.email);

    if (user) {
      log(`Account already exists: ${def.email} (${def.role}) - leaving as-is.`);
    } else {
      const roleRecord = await userModel.findRoleByName(def.role);
      if (!roleRecord) throw new Error(`Role "${def.role}" not found - did seed.sql run correctly?`);

      const passwordHash = await bcrypt.hash(def.password, env.bcrypt.saltRounds);
      user = await userModel.create({
        roleId: roleRecord.id,
        firstName: def.firstName,
        lastName: def.lastName,
        email: def.email,
        passwordHash,
        phone: def.phone,
      });
      log(`Created account: ${def.email} (${def.role}).`);
    }

    accounts[def.role] = { ...def, id: user.id };
  }

  // Give the demo doctor a real profile (specialization, fee, etc.) so
  // they show up properly in the doctor directory and booking screens.
  // updateProfile() is a plain UPDATE, so re-running this is harmless.
  const generalMedicine = await departmentModel.findByName('General Medicine');

  let doctorProfile = await doctorModel.findByUserId(accounts[ROLES.DOCTOR].id);
  if (!doctorProfile) {
    doctorProfile = await doctorModel.createMinimal(accounts[ROLES.DOCTOR].id, generalMedicine ? generalMedicine.id : null);
  }
  doctorProfile = await doctorModel.updateProfile(accounts[ROLES.DOCTOR].id, {
    department_id: generalMedicine ? generalMedicine.id : null,
    specialization: 'Internal Medicine',
    qualification: 'MD, Board Certified',
    license_number: 'MD-DEMO-0001',
    years_of_experience: 12,
    consultation_fee: CONSULTATION_FEE,
    bio: 'Dr. Mitchell is a general internal medicine physician with a focus on preventive care and chronic disease management.',
    room_number: '204',
  });

  accounts[ROLES.DOCTOR].doctorId = doctorProfile.id;
  accounts[ROLES.DOCTOR].departmentId = generalMedicine ? generalMedicine.id : null;

  await ensureDemoDoctorAvailability(doctorProfile.id);

  return accounts;
}

/**
 * Monday-Friday, 08:00-17:00, 30-minute slots for the demo doctor - so
 * the appointment booking flow has something to actually book against
 * immediately after installation, without any manual setup. Idempotent:
 * if this doctor already has ANY availability windows (e.g. an admin
 * has since customized their schedule), this does nothing rather than
 * re-adding or duplicating rows.
 */
async function ensureDemoDoctorAvailability(doctorId) {
  const existing = await doctorAvailabilityModel.listByDoctor(doctorId);
  if (existing.length > 0) {
    log('Demo doctor already has availability configured - leaving as-is.');
    return;
  }

  const WEEKDAYS = [1, 2, 3, 4, 5]; // Monday-Friday
  for (const dayOfWeek of WEEKDAYS) {
    await doctorAvailabilityModel.create({
      doctorId,
      dayOfWeek,
      startTime: '08:00',
      endTime: '17:00',
      slotMinutes: 30,
      isActive: true,
    });
  }
  log('Created Monday-Friday 08:00-17:00 availability (30-minute slots) for the demo doctor.');
}

const DEMO_PATIENT_EMAIL = 'patient@medicarehms.demo';

/**
 * Grants portal access to the very first patient in the system (lowest
 * id), independent of whether the bulk demo dataset was freshly created
 * this run or already existed from a prior run - resolving "which
 * patient" by lowest id (rather than an array index only available
 * inside the bulk-generation branch) means this step works and stays
 * idempotent on every single boot, not just the first one.
 */
async function ensureDemoPatientAccount() {
  const [rows] = await pool.execute('SELECT * FROM patients ORDER BY id ASC LIMIT 1');
  const firstPatient = rows[0];
  if (!firstPatient) {
    log('No patients exist yet - skipping demo patient portal account.');
    return null;
  }

  if (firstPatient.user_id) {
    const existingUser = await userModel.findById(firstPatient.user_id);
    log(`Demo patient portal account already exists (patient ${firstPatient.patient_code}) - leaving as-is.`);
    return { patientCode: firstPatient.patient_code, email: existingUser.email, password: DEMO_PASSWORD };
  }

  if (await userModel.emailExists(DEMO_PATIENT_EMAIL)) {
    log(`Cannot create demo patient account: ${DEMO_PATIENT_EMAIL} is already in use by a different account.`);
    return null;
  }

  const roleRecord = await userModel.findRoleByName(ROLES.PATIENT);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, env.bcrypt.saltRounds);
  const user = await userModel.create({
    roleId: roleRecord.id,
    firstName: firstPatient.first_name,
    lastName: firstPatient.last_name,
    email: DEMO_PATIENT_EMAIL,
    passwordHash,
    phone: firstPatient.phone,
  });
  await patientModel.linkUserAccount(firstPatient.id, user.id);

  log(`Granted demo portal access to patient ${firstPatient.patient_code} (${DEMO_PATIENT_EMAIL}).`);
  return { patientCode: firstPatient.patient_code, email: DEMO_PATIENT_EMAIL, password: DEMO_PASSWORD };
}

// -----------------------------------------------------------------------
// Step 3: idempotency gate for everything below this point.
// -----------------------------------------------------------------------
async function bulkDatasetAlreadySeeded(adminUserId) {
  const [rows] = await pool.execute(
    'SELECT id FROM notifications WHERE user_id = :userId AND title = :title LIMIT 1',
    { userId: adminUserId, title: MARKER_TITLE }
  );
  return rows.length > 0;
}

// -----------------------------------------------------------------------
// Step 4: demo medicines + starting stock.
// -----------------------------------------------------------------------
async function seedMedicines() {
  log('Seeding demo medicines and stock batches...');
  const byName = {};

  for (const def of DEMO_MEDICINES) {
    let medicine = await medicineModel.findByName(def.name);
    if (medicine) {
      // findByName only returns { id } - fetch the full row (unit,
      // unit_price, etc.) since downstream code needs those fields.
      medicine = await medicineModel.findById(medicine.id);
    } else {
      const category = await pool.execute('SELECT id FROM medicine_categories WHERE name = :name LIMIT 1', { name: def.category });
      const categoryId = category[0][0] ? category[0][0].id : null;

      medicine = await medicineModel.create({
        name: def.name,
        categoryId,
        genericName: def.generic,
        manufacturer: 'MediCare Generics Ltd.',
        unit: def.unit,
        unitPrice: def.price,
        reorderLevel: def.reorder,
      });

      if (def.lowStock) {
        // Deliberately below reorder level, to demonstrate the
        // low-stock alert on the pharmacy dashboard.
        await medicineStockModel.receiveBatch({
          medicineId: medicine.id,
          batchNumber: 'DEMO-LOW-1',
          quantity: 5,
          expiryDate: toDateOnly(daysFromToday(300)),
          supplier: 'MediCare Distribution Co.',
        });
      } else if (def.expiringSoon) {
        // One batch expiring soon (demonstrates the expiry alert) plus
        // a healthy longer-dated batch so it isn't also low-stock.
        await medicineStockModel.receiveBatch({
          medicineId: medicine.id,
          batchNumber: 'DEMO-EXP-1',
          quantity: 40,
          expiryDate: toDateOnly(daysFromToday(20)),
          supplier: 'MediCare Distribution Co.',
        });
        await medicineStockModel.receiveBatch({
          medicineId: medicine.id,
          batchNumber: 'DEMO-STD-1',
          quantity: 200,
          expiryDate: toDateOnly(daysFromToday(365)),
          supplier: 'MediCare Distribution Co.',
        });
      } else {
        await medicineStockModel.receiveBatch({
          medicineId: medicine.id,
          batchNumber: 'DEMO-STD-1',
          quantity: 500,
          expiryDate: toDateOnly(daysFromToday(365)),
          supplier: 'MediCare Distribution Co.',
        });
      }
    }

    byName[def.name] = medicine;
  }

  return byName;
}

// -----------------------------------------------------------------------
// Step 5: 50 demo patients.
// -----------------------------------------------------------------------
async function seedPatients(registeredBy) {
  log(`Seeding ${PATIENT_COUNT} demo patients...`);
  const patients = [];

  for (let i = 0; i < PATIENT_COUNT; i += 1) {
    const firstName = pick(FIRST_NAMES, i);
    const lastName = pick(LAST_NAMES, i * 3 + 1);
    const genderRoll = i % 17;
    const gender = genderRoll === 0 ? 'other' : i % 2 === 0 ? 'male' : 'female';
    const age = 18 + ((i * 7) % 65);
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - age);
    dob.setMonth((i * 5) % 12);
    dob.setDate(1 + (i % 28));

    const insurer = pick(INSURERS, i);

    const patient = await patientModel.create({
      firstName,
      lastName,
      dateOfBirth: toDateOnly(dob),
      gender,
      bloodGroup: pick(BLOOD_GROUPS, i),
      phone: `+1-555-02${String(i).padStart(2, '0')}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
      address: `${100 + i} Main Street`,
      city: pick(CITIES, i),
      allergies: pick(ALLERGIES, i),
      chronicConditions: pick(CHRONIC_CONDITIONS, i),
      emergencyContactName: `${pick(FIRST_NAMES, i + 5)} ${lastName}`,
      emergencyContactPhone: `+1-555-03${String(i).padStart(2, '0')}`,
      emergencyContactRelation: pick(RELATIONS, i),
      insuranceProvider: insurer,
      insurancePolicyNumber: insurer ? `POL-${100000 + i}` : null,
      registeredBy,
    });

    patients.push(patient);

    if ((i + 1) % 10 === 0) log(`  ...${i + 1}/${PATIENT_COUNT} patients created`);
  }

  return patients;
}

// -----------------------------------------------------------------------
// Step 6: the clinical + financial story for each patient - one past
// (completed) visit with a medical record, often a prescription (some
// items actually dispensed) and/or a lab test, plus an invoice; and one
// upcoming appointment.
// -----------------------------------------------------------------------
async function seedClinicalData(patients, staff, medicines) {
  log('Seeding appointments, medical records, prescriptions, lab tests, invoices, and vitals...');

  const doctor = staff[ROLES.DOCTOR];
  const nurse = staff[ROLES.NURSE];
  const receptionist = staff[ROLES.RECEPTIONIST];
  const pharmacist = staff[ROLES.PHARMACIST];
  const labStaff = staff[ROLES.LAB_STAFF];

  const summary = { appointments: 0, medicalRecords: 0, prescriptions: 0, dispensedItems: 0, labTests: 0, invoices: 0, payments: 0, vitals: 0 };

  for (let i = 0; i < patients.length; i += 1) {
    const patient = patients[i];
    const diagnosis = pick(DIAGNOSES, i);

    // --- Past, completed appointment -----------------------------------
    const pastAppointment = await appointmentModel.create({
      patientId: patient.id,
      doctorId: doctor.doctorId,
      departmentId: doctor.departmentId,
      scheduledAt: daysFromToday(-1 * (7 + (i % 45))),
      durationMinutes: 30,
      reason: `Consultation for ${diagnosis.name.toLowerCase()}`,
      bookedBy: receptionist.id,
    });
    await appointmentModel.updateStatus(pastAppointment.id, 'completed');
    summary.appointments += 1;

    // --- Vitals recorded by the nurse for that visit --------------------
    await vitalsModel.create({
      patientId: patient.id,
      appointmentId: pastAppointment.id,
      recordedBy: nurse.id,
      temperatureCelsius: (36.4 + (i % 5) * 0.2).toFixed(1),
      heartRateBpm: 65 + (i % 25),
      bloodPressureSystolic: 110 + (i % 30),
      bloodPressureDiastolic: 70 + (i % 15),
      respiratoryRate: 14 + (i % 6),
      oxygenSaturation: (96 + (i % 4)).toFixed(1),
      weightKg: (60 + (i % 40)).toFixed(1),
      heightCm: (155 + (i % 35)).toFixed(1),
      notes: 'Routine vitals check prior to consultation.',
    });
    summary.vitals += 1;

    // --- Medical record ---------------------------------------------------
    const record = await medicalRecordModel.create({
      patientId: patient.id,
      doctorId: doctor.doctorId,
      appointmentId: pastAppointment.id,
      diagnosis: diagnosis.name,
      symptoms: diagnosis.symptoms,
      treatmentPlan: diagnosis.treatment,
      doctorNotes: `Patient counseled on ${diagnosis.name.toLowerCase()} management. Follow-up advised if symptoms persist or worsen.`,
      followUpDate: toDateOnly(daysFromToday(30)),
    });
    summary.medicalRecords += 1;

    // --- Prescription (most, not all, visits result in one) -------------
    let dispensedLineItemsCost = 0;
    if (i % 7 !== 0) {
      const items = diagnosis.medicines
        .map((name) => medicines[name])
        .filter(Boolean)
        .map((medicine) => {
          const dosageByUnit = {
            tablet: '1 tablet',
            capsule: '1 capsule',
            vial: '10 units',
            inhaler: '2 puffs',
          };
          return {
            medicineId: medicine.id,
            dosage: dosageByUnit[medicine.unit] || '1 dose',
            frequency: medicine.unit === 'vial' ? 'once daily' : 'twice a day',
            durationDays: 7,
            quantity: medicine.unit === 'vial' ? 10 : medicine.unit === 'inhaler' ? 1 : 14,
            instructions: 'Take with food.',
          };
        });

      if (items.length > 0) {
        const prescription = await prescriptionModel.create({
          patientId: patient.id,
          doctorId: doctor.doctorId,
          medicalRecordId: record.id,
          notes: `Prescribed for ${diagnosis.name}.`,
          items,
        });
        summary.prescriptions += 1;

        // Dispense roughly half of these prescriptions through the same
        // FIFO stock-decrement logic the pharmacist UI uses for real.
        if (i % 2 === 0) {
          for (const item of prescription.items) {
            try {
              await prescriptionModel.dispenseItem(item.id, pharmacist.id);
              const medicine = Object.values(medicines).find((m) => m.id === item.medicine_id);
              dispensedLineItemsCost += item.quantity * (medicine ? Number(medicine.unit_price) : 0);
              summary.dispensedItems += 1;
            } catch (err) {
              // Insufficient stock is possible in theory for the
              // deliberately-low-stock demo medicine - skip gracefully.
              log(`  (skipped dispensing item ${item.id}: ${err.message})`);
            }
          }
        }
      }
    }

    // --- Lab test (roughly every other patient) --------------------------
    let labInvoiceItem = null;
    if (i % 2 === 0) {
      const testDef = pick(LAB_TESTS, i);
      const labTest = await labTestModel.create({
        patientId: patient.id,
        doctorId: doctor.doctorId,
        medicalRecordId: record.id,
        testName: testDef.name,
        testType: testDef.type,
        priority: i % 11 === 0 ? 'urgent' : 'routine',
        notes: `Requested as part of workup for ${diagnosis.name.toLowerCase()}.`,
      });
      summary.labTests += 1;

      // Most demo lab tests are completed with a result; a few are left
      // in progress to show a non-empty "pending" queue too.
      if (i % 5 !== 0) {
        await labTestModel.updateStatus(labTest.id, 'completed');
        await labResultModel.create({
          laboratoryTestId: labTest.id,
          resultSummary: `${testDef.name} within normal limits.`,
          resultData: { status: 'normal', reviewedAutomatically: false },
          uploadedBy: labStaff.id,
        });
        if (i % 3 === 0) {
          await labResultModel.markReviewed(labTest.id, doctor.id);
        }
        labInvoiceItem = { description: `Laboratory: ${testDef.name}`, itemType: 'lab_test', referenceId: labTest.id, quantity: 1, unitPrice: 25.0 };
      } else {
        await labTestModel.updateStatus(labTest.id, 'in_progress');
      }
    }

    // --- Invoice for the visit -------------------------------------------
    const invoiceItems = [
      { description: `Consultation - Dr. ${doctor.firstName} ${doctor.lastName}`, itemType: 'consultation', referenceId: pastAppointment.id, quantity: 1, unitPrice: CONSULTATION_FEE },
    ];
    if (labInvoiceItem) invoiceItems.push(labInvoiceItem);
    if (dispensedLineItemsCost > 0) {
      invoiceItems.push({ description: 'Dispensed medication', itemType: 'medicine', quantity: 1, unitPrice: Number(dispensedLineItemsCost.toFixed(2)) });
    }

    const invoice = await invoiceModel.create({
      patientId: patient.id,
      appointmentId: pastAppointment.id,
      dueDate: toDateOnly(daysFromToday(14)),
      createdBy: receptionist.id,
      items: invoiceItems,
    });
    summary.invoices += 1;

    // Vary payment status: ~60% paid in full, ~25% partially paid, ~15% unpaid.
    const paymentRoll = i % 20;
    if (paymentRoll < 12) {
      await invoiceModel.recordPayment(invoice.id, {
        amount: invoice.total,
        paymentMethod: pick(['cash', 'card', 'insurance', 'mobile_money'], i),
        receivedBy: receptionist.id,
      });
      summary.payments += 1;
    } else if (paymentRoll < 17) {
      await invoiceModel.recordPayment(invoice.id, {
        amount: Number((invoice.total / 2).toFixed(2)),
        paymentMethod: 'cash',
        receivedBy: receptionist.id,
      });
      summary.payments += 1;
    }

    // --- Upcoming appointment (not yet completed) -------------------------
    const upcomingStatus = i % 13 === 0 ? 'cancelled' : i % 3 === 0 ? 'confirmed' : 'scheduled';
    const upcomingAppointment = await appointmentModel.create({
      patientId: patient.id,
      doctorId: doctor.doctorId,
      departmentId: doctor.departmentId,
      scheduledAt: daysFromToday(1 + (i % 21)),
      durationMinutes: 30,
      reason: 'Follow-up visit',
      bookedBy: receptionist.id,
    });
    if (upcomingStatus !== 'scheduled') {
      await appointmentModel.updateStatus(upcomingAppointment.id, upcomingStatus === 'cancelled' ? 'cancelled' : upcomingStatus, upcomingStatus === 'cancelled' ? 'Rescheduling requested by patient' : null);
    }
    summary.appointments += 1;

    // A notification for the doctor about the first ten upcoming visits,
    // mirroring what the real booking flow does automatically.
    if (i < 10 && upcomingStatus !== 'cancelled') {
      await notificationModel.create({
        userId: doctor.id,
        type: 'appointment_reminder',
        title: 'Upcoming appointment',
        message: `${patient.first_name} ${patient.last_name} is scheduled with you on ${new Date(upcomingAppointment.scheduled_at).toLocaleString()}.`,
        referenceType: 'appointment',
        referenceId: upcomingAppointment.id,
      });
    }

    if ((i + 1) % 10 === 0) log(`  ...clinical data for ${i + 1}/${patients.length} patients`);
  }

  return summary;
}

// -----------------------------------------------------------------------
// Step 7: a starter notification in every demo inbox, so each role has
// something to see immediately after logging in.
// -----------------------------------------------------------------------
async function seedWelcomeNotifications(staff) {
  log('Seeding welcome notifications for each demo account...');

  const messages = {
    [ROLES.ADMIN]: 'Welcome to the MediCare HMS demo environment. Explore Users, Reports, and Audit Logs to see the admin view.',
    [ROLES.DOCTOR]: 'Welcome, Dr. Mitchell. Your appointments, patients, and lab requests are ready to explore.',
    [ROLES.NURSE]: 'Welcome. Recent patients and vitals history are available from the Patients and Vitals pages.',
    [ROLES.RECEPTIONIST]: 'Welcome. Appointments and billing for today are ready in your dashboard.',
    [ROLES.PHARMACIST]: 'Welcome. Pending prescriptions and low-stock alerts are waiting in Pharmacy.',
    [ROLES.LAB_STAFF]: 'Welcome. Pending lab requests are ready for processing in Laboratory.',
  };

  for (const role of Object.keys(messages)) {
    const account = staff[role];
    if (!account) continue;
    await notificationModel.create({
      userId: account.id,
      type: 'system',
      title: 'Welcome to MediCare HMS',
      message: messages[role],
    });
  }
}

async function writeMarker(adminUserId) {
  await notificationModel.create({
    userId: adminUserId,
    type: 'system',
    title: MARKER_TITLE,
    message: 'Marks that the demo dataset (50 patients + related records) has been generated. Delete this notification to allow it to be regenerated.',
  });
}

// -----------------------------------------------------------------------
// Step 8: DEMO_USERS.md at the project root - always (re)written, even
// on runs where the bulk dataset was already present, so the file never
// drifts from the actual seeded accounts.
// -----------------------------------------------------------------------
async function writeDemoUsersDoc(staff, patientAccount) {
  const [[{ total: patientTotal }]] = await pool.query('SELECT COUNT(*) AS total FROM patients');

  const ROLE_LABELS = {
    [ROLES.ADMIN]: 'Administrator',
    [ROLES.DOCTOR]: 'Doctor',
    [ROLES.NURSE]: 'Nurse',
    [ROLES.RECEPTIONIST]: 'Receptionist',
    [ROLES.PHARMACIST]: 'Pharmacist',
    [ROLES.LAB_STAFF]: 'Laboratory Staff',
  };

  const ROLE_NOTES = {
    [ROLES.ADMIN]: 'Full system access - Users, Departments, Reports, Audit Logs, and everything else.',
    [ROLES.DOCTOR]: "Dr. Sarah Mitchell - has patients, appointments, medical records, prescriptions, and lab requests already on file.",
    [ROLES.NURSE]: 'Can look up patients and record vitals; has demo vitals history already recorded.',
    [ROLES.RECEPTIONIST]: 'Can register patients, book/cancel/reschedule appointments, and manage billing.',
    [ROLES.PHARMACIST]: 'Has pending prescriptions to dispense and can see the low-stock / expiring-soon alerts.',
    [ROLES.LAB_STAFF]: 'Has pending and completed lab requests to work through.',
  };

  const rows = DEMO_ACCOUNTS.map((def) => {
    const account = staff[def.role];
    return `| ${ROLE_LABELS[def.role]} | \`${account.email}\` | \`${def.password}\` | ${ROLE_NOTES[def.role]} |`;
  }).join('\n');

  const patientRow = patientAccount
    ? `| Patient | \`${patientAccount.email}\` | \`${patientAccount.password}\` | Portal login for patient ${patientAccount.patientCode} - has real appointments, medical records, prescriptions, and lab results already on file. |`
    : '';

  const content = `# Demo Login Credentials

This file is generated automatically by \`server/database/seed.js\` (via \`npm run db:seed\`) and always reflects the accounts that script creates. **These are demo credentials only - never reuse them, or this seeding approach, for a real deployment.**

## Accounts

| Role | Email | Password | Notes |
|------|-------|----------|-------|
${rows}
${patientRow}

## What's in the demo dataset

- **${patientTotal} patients**, each with realistic demographics, allergies, chronic conditions, emergency contacts, and insurance info
- Each patient has **one completed past visit** (with recorded vitals, a medical record, and an invoice) and **one upcoming appointment**
- Most visits include a **prescription** for a condition-appropriate medicine; roughly half of those prescriptions have been **dispensed** through the real pharmacy stock-decrement logic
- About half of all patients have a **laboratory test** on file, most with results already uploaded (a few left "in progress" so the lab queue isn't empty)
- Invoices are a realistic mix of **paid, partially paid, and unpaid**
- **13 medicines** across every reference category, including one deliberately low on stock and one with a batch expiring soon - so the Pharmacy dashboard's alerts have something to show immediately
- Each demo account has a **welcome notification**, and the doctor account has a handful of appointment-reminder notifications

## Re-seeding

\`npm run db:seed\` is idempotent - running it again will:
- leave all six accounts untouched if they already exist
- **skip** regenerating the bulk dataset entirely once it detects it already ran (it checks for a marker notification on the admin account)

To force the bulk dataset to regenerate, delete that marker (a notification titled "${MARKER_TITLE}" on the admin account), or reset the whole database (\`docker compose down -v\` if you're using Docker).

---
_Generated: ${new Date().toISOString()}_
`;

  const outputPath = resolveDemoUsersOutputPath();

  try {
    fs.writeFileSync(outputPath, content, 'utf8');
    log(`Wrote ${outputPath}`);
  } catch (err) {
    // Never let a filesystem quirk (e.g. no writable bind mount for
    // this path in some container setup) take down the whole seed run
    // or hide the credentials - print them straight to the logs too.
    log(`Could not write ${outputPath} (${err.message}). Printing credentials here instead:`);
    console.log(rows);
  }
}

/**
 * Two directories up from server/database/ is the real project root
 * ONLY when running outside Docker (npm run db:seed locally) - that's
 * where docker-compose.yml lives. Inside the backend container, only
 * server/'s contents are copied in as /app, so the same "up two
 * levels" arithmetic lands on the container's filesystem root ("/"),
 * which is unwritable and wrong. Detect which case we're in by
 * checking for docker-compose.yml, rather than assuming.
 */
function resolveDemoUsersOutputPath() {
  if (process.env.DEMO_USERS_MD_PATH) return process.env.DEMO_USERS_MD_PATH;

  const projectRootCandidate = path.join(__dirname, '..', '..');
  const looksLikeRealProjectRoot = fs.existsSync(path.join(projectRootCandidate, 'docker-compose.yml'));

  if (looksLikeRealProjectRoot) {
    return path.join(projectRootCandidate, 'DEMO_USERS.md');
  }

  // Docker container context: write inside /app instead. If
  // docker-compose.yml bind-mounts ./DEMO_USERS.md to /app/DEMO_USERS.md
  // (see docker-compose.yml), this write is transparently visible on
  // the host too.
  return path.join(__dirname, '..', 'DEMO_USERS.md');
}

// -----------------------------------------------------------------------
// Orchestration
// -----------------------------------------------------------------------
async function run() {
  try {
    await seedReferenceData();

    const staff = await ensureDemoAccounts();

    const alreadySeeded = await bulkDatasetAlreadySeeded(staff[ROLES.ADMIN].id);

    if (alreadySeeded) {
      log('Demo dataset already present (marker notification found) - skipping bulk generation.');
    } else {
      const medicines = await seedMedicines();
      const patients = await seedPatients(staff[ROLES.RECEPTIONIST].id);
      const summary = await seedClinicalData(patients, staff, medicines);
      await seedWelcomeNotifications(staff);
      await writeMarker(staff[ROLES.ADMIN].id);

      log('Bulk demo dataset created:');
      log(`  Patients:              ${patients.length}`);
      log(`  Appointments:          ${summary.appointments}`);
      log(`  Medical records:       ${summary.medicalRecords}`);
      log(`  Prescriptions:         ${summary.prescriptions}`);
      log(`  Dispensed items:       ${summary.dispensedItems}`);
      log(`  Lab tests:             ${summary.labTests}`);
      log(`  Invoices:              ${summary.invoices}`);
      log(`  Payments recorded:     ${summary.payments}`);
      log(`  Vitals recorded:       ${summary.vitals}`);
    }

    const patientAccount = await ensureDemoPatientAccount();

    await writeDemoUsersDoc(staff, patientAccount);

    log('Done.');
  } catch (err) {
    console.error('[db:seed] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
