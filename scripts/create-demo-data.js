// scripts/create-demo-data.js
//
// Fills the hospital with realistic SAMPLE data so the demo accounts
// have something to show. Run create-demo-accounts.js FIRST.
//
// It adds (never deletes or changes your own records):
//   - 4 departments, with the demo doctor in General Medicine
//   - the demo doctor's profile details + weekly working hours
//     (Mon-Fri 08:00-12:00 and 13:00-16:00, 30-minute slots)
//   - 6 medicine categories, 12 medicines with stock batches
//     (one low on stock, one batch expiring soon)
//   - 12 sample patients (plus the demo patient account)
//   - for every patient: a past completed visit with vitals, a medical
//     record, a prescription and an invoice, and an upcoming appointment
//   - lab tests for about half the patients (some done, some waiting)
//   - welcome notifications for the demo accounts
//
// Every document it creates has isDemo: true, so you can tell sample
// data apart from real data. It only runs once - a marker document
// (demoMeta/seed-v1) stops it from adding a second copy. To add the
// data again, delete demoMeta/seed-v1 in the Firebase Console first.
//
// RUN:
//   cd scripts
//   node create-demo-data.js
// (needs scripts/serviceAccountKey.json - see create-demo-accounts.js)

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(KEY_PATH)) {
  console.error('\nMissing scripts/serviceAccountKey.json - see the top of create-demo-accounts.js.\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();
const auth = admin.auth();
const { Timestamp, FieldValue } = admin.firestore;
const now = FieldValue.serverTimestamp();
const YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

// Fixed-seed random numbers, so every run produces the same data.
let seed = 18;
function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function int(min, max) { return min + Math.floor(rand() * (max - min + 1)); }

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// A weekday N days from today (moves forward/back off weekends), at a
// slot time that matches the doctor's 30-minute working-hours grid.
// Uses this computer's local time - the same way the app's booking
// page works out slots - so these line up with what the app shows.
const SLOT_TIMES = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];
function slotOnWeekday(daysFromToday, time, direction) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + direction);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

async function nextCounter(name) {
  const ref = db.collection('counters').doc(name);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = (snap.exists ? snap.data().value : 0) + 1;
    tx.set(ref, { value: next }, { merge: true });
    return next;
  });
}

async function uidFor(email) {
  try { return (await auth.getUserByEmail(email)).uid; } catch { return null; }
}

// ---------------------------------------------------------------------
// Sample content
// ---------------------------------------------------------------------

const DEPARTMENTS = [
  { name: 'General Medicine', description: 'Everyday illnesses, check-ups and chronic condition follow-ups.' },
  { name: 'Cardiology', description: 'Heart and blood pressure care, ECGs and cardiac follow-ups.' },
  { name: 'Paediatrics', description: 'Medical care for babies, children and teenagers.' },
  { name: 'Orthopaedics', description: 'Bones, joints, sports injuries and fractures.' },
];

const CATEGORIES = ['Analgesics', 'Antibiotics', 'Antihypertensives', 'Antidiabetics', 'Antihistamines', 'Respiratory'];

// [name, category, genericName, unit, unitPrice (R), reorderLevel, batches: [qty, daysUntilExpiry]]
const MEDICINES = [
  ['Paracetamol 500mg', 'Analgesics', 'Paracetamol', 'tablet', 1.2, 200, [[800, 420], [400, 600]]],
  ['Ibuprofen 400mg', 'Analgesics', 'Ibuprofen', 'tablet', 1.8, 150, [[500, 380]]],
  ['Amoxicillin 500mg', 'Antibiotics', 'Amoxicillin', 'capsule', 3.5, 100, [[300, 250], [200, 20]]],
  ['Azithromycin 250mg', 'Antibiotics', 'Azithromycin', 'tablet', 9.0, 50, [[120, 300]]],
  ['Amlodipine 5mg', 'Antihypertensives', 'Amlodipine', 'tablet', 2.1, 120, [[450, 500]]],
  ['Enalapril 10mg', 'Antihypertensives', 'Enalapril', 'tablet', 1.9, 120, [[350, 480]]],
  ['Hydrochlorothiazide 12.5mg', 'Antihypertensives', 'Hydrochlorothiazide', 'tablet', 1.1, 100, [[300, 520]]],
  ['Metformin 500mg', 'Antidiabetics', 'Metformin', 'tablet', 1.5, 150, [[600, 450]]],
  ['Glibenclamide 5mg', 'Antidiabetics', 'Glibenclamide', 'tablet', 1.4, 80, [[200, 400]]],
  ['Cetirizine 10mg', 'Antihistamines', 'Cetirizine', 'tablet', 1.3, 100, [[250, 360]]],
  ['Salbutamol Inhaler 100mcg', 'Respiratory', 'Salbutamol', 'inhaler', 65.0, 20, [[8, 330]]], // low stock
  ['Prednisone 5mg', 'Respiratory', 'Prednisone', 'tablet', 1.6, 60, [[180, 410]]],
];

// Real-looking but invented South African patients.
const PATIENTS = [
  ['Thabo', 'Mokoena', 'male', '1984-03-12', 'O+', 'Soshanguve', '072 418 5530', 'Hypertension'],
  ['Lerato', 'Nkosi', 'female', '1992-07-25', 'A+', 'Mabopane', '083 552 1907', null],
  ['Sipho', 'Ndlovu', 'male', '1976-11-02', 'B+', 'Pretoria North', '071 330 8812', 'Type 2 diabetes'],
  ['Naledi', 'Mahlangu', 'female', '2015-05-18', 'O-', 'Ga-Rankuwa', '079 904 2216', 'Asthma'],
  ['Kagiso', 'Molefe', 'male', '1999-01-30', 'A-', 'Akasia', '064 287 4410', null],
  ['Zanele', 'Khumalo', 'female', '1968-09-14', 'AB+', 'Soshanguve', '082 765 0093', 'Hypertension, Type 2 diabetes'],
  ['Bongani', 'Zulu', 'male', '1988-12-08', 'O+', 'Rosslyn', '073 619 2284', null],
  ['Palesa', 'Sithole', 'female', '2001-04-22', 'B-', 'Hammanskraal', '060 448 7731', null],
  ['Mandla', 'Dube', 'male', '1959-06-03', 'A+', 'Pretoria North', '081 237 9945', 'Hypertension'],
  ['Nomvula', 'Mthembu', 'female', '1995-10-11', 'O+', 'Mabopane', '076 552 3318', 'Seasonal allergies'],
  ['Tshepo', 'Maseko', 'male', '2012-02-27', 'B+', 'Ga-Rankuwa', '078 143 6620', null],
  ['Ayanda', 'Cele', 'female', '1980-08-19', 'A+', 'Akasia', '084 990 1157', null],
];

// Past visit templates: what the doctor found and prescribed.
const VISITS = [
  { reason: 'Headache and fever for 3 days', symptoms: 'Fever, headache, body aches', diagnosis: 'Viral upper respiratory tract infection',
    plan: 'Rest, fluids and paracetamol. Return if fever lasts more than 5 days.', meds: [['Paracetamol 500mg', '1g', 'Three times a day', 5, 30]], lab: null },
  { reason: 'Sore throat and cough', symptoms: 'Sore throat, productive cough, mild fever', diagnosis: 'Acute bacterial pharyngitis',
    plan: 'Complete the full antibiotic course.', meds: [['Amoxicillin 500mg', '500mg', 'Three times a day', 7, 21], ['Paracetamol 500mg', '500mg', 'When needed for pain', 5, 10]],
    lab: ['Throat swab culture', 'Microbiology', 'Group A Streptococcus detected - sensitive to amoxicillin.'] },
  { reason: 'Blood pressure follow-up', symptoms: 'Occasional headaches, no chest pain', diagnosis: 'Essential hypertension - not well controlled',
    plan: 'Start amlodipine, cut down on salt, recheck BP in 4 weeks.', meds: [['Amlodipine 5mg', '5mg', 'Once a day', 30, 30]],
    lab: ['Kidney function (U&E)', 'Chemistry', 'Creatinine 88 umol/L, potassium 4.2 mmol/L - normal.'] },
  { reason: 'Diabetes check-up', symptoms: 'Increased thirst, tiredness', diagnosis: 'Type 2 diabetes mellitus',
    plan: 'Continue metformin, diet advice given, HbA1c in 3 months.', meds: [['Metformin 500mg', '500mg', 'Twice a day with meals', 30, 60]],
    lab: ['HbA1c', 'Chemistry', 'HbA1c 7.4% - above target, continue treatment.'] },
  { reason: 'Wheezing and shortness of breath', symptoms: 'Wheeze, tight chest at night', diagnosis: 'Mild persistent asthma',
    plan: 'Inhaler technique shown. Use reliever when needed.', meds: [['Salbutamol Inhaler 100mcg', '2 puffs', 'When needed', 30, 1]], lab: null },
  { reason: 'Itchy eyes and sneezing', symptoms: 'Sneezing, runny nose, itchy eyes', diagnosis: 'Allergic rhinitis',
    plan: 'Antihistamine daily during spring.', meds: [['Cetirizine 10mg', '10mg', 'Once a day', 14, 14]], lab: null },
  { reason: 'Knee pain after soccer', symptoms: 'Swollen right knee, pain when walking', diagnosis: 'Right knee sprain',
    plan: 'Rest, ice, compression, elevation. Physio if not better in 2 weeks.', meds: [['Ibuprofen 400mg', '400mg', 'Three times a day after meals', 5, 15]],
    lab: ['Full blood count', 'Haematology', 'Haemoglobin 14.1 g/dL, white cells 6.8 - normal.'] },
  { reason: 'Routine check-up', symptoms: 'No complaints', diagnosis: 'Healthy adult - routine screening',
    plan: 'Keep up exercise. Next check-up in 12 months.', meds: [], lab: ['Lipid profile', 'Chemistry', 'Total cholesterol 4.6 mmol/L - normal.'] },
];

const UPCOMING_REASONS = ['Follow-up visit', 'Blood pressure review', 'Collect test results', 'Medication review', 'General check-up', 'Follow-up on treatment'];

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

(async () => {
  const marker = db.collection('demoMeta').doc('seed-v1');
  if ((await marker.get()).exists) {
    console.log('\nDemo data was already added before - nothing to do.');
    console.log('(To add it again, delete demoMeta/seed-v1 in the Firebase Console, then re-run.)\n');
    process.exit(0);
  }

  const ids = {};
  for (const [key, email] of Object.entries({
    admin: 'admin@hms.local', doctor: 'doctor@medicarehms.demo', nurse: 'nurse@medicarehms.demo',
    receptionist: 'receptionist@medicarehms.demo', pharmacist: 'pharmacist@medicarehms.demo',
    lab: 'lab@medicarehms.demo', patient: 'patient@medicarehms.demo',
  })) {
    ids[key] = await uidFor(email);
    if (!ids[key]) {
      console.error(`\nDemo account ${email} not found. Run "node create-demo-accounts.js" first.\n`);
      process.exit(1);
    }
  }
  const doctorSnap = await db.collection('doctors').doc(ids.doctor).get();
  const doctorName = `${doctorSnap.data()?.firstName || 'Sarah'} ${doctorSnap.data()?.lastName || 'Mitchell'}`;
  const staffName = async (uid) => {
    const u = (await db.collection('users').doc(uid).get()).data() || {};
    return `${u.firstName || ''} ${u.lastName || ''}`.trim();
  };
  const nurseName = await staffName(ids.nurse);
  const receptionistName = await staffName(ids.receptionist);
  const pharmacistName = await staffName(ids.pharmacist);
  const labName = await staffName(ids.lab);

  console.log('\nAdding demo data...');

  // --- Departments --------------------------------------------------
  const deptIds = {};
  for (const d of DEPARTMENTS) {
    const isGM = d.name === 'General Medicine';
    const ref = await db.collection('departments').add({
      name: d.name, description: d.description,
      headDoctorId: isGM ? ids.doctor : null, headDoctorName: isGM ? `Dr. ${doctorName}` : null,
      doctorCount: isGM ? 1 : 0, isActive: true, isDemo: true, createdAt: now, updatedAt: now,
    });
    deptIds[d.name] = ref.id;
  }
  console.log(`  ${DEPARTMENTS.length} departments`);

  // --- Demo doctor profile + working hours --------------------------
  // Only fills in fields that are still empty, and only joins a
  // department if the doctor isn't already in one.
  const doc0 = doctorSnap.data() || {};
  const doctorUpdate = {
    specialization: doc0.specialization && doc0.specialization !== 'General Practice' ? doc0.specialization : 'General Practitioner',
    qualification: doc0.qualification || 'MBChB (University of Pretoria)',
    licenseNumber: doc0.licenseNumber || 'MP 0712345',
    yearsOfExperience: doc0.yearsOfExperience || 9,
    consultationFee: doc0.consultationFee || 450,
    bio: doc0.bio || 'Family doctor with a special interest in chronic disease care - hypertension, diabetes and asthma.',
    roomNumber: doc0.roomNumber || 'GM-104',
    updatedAt: now,
  };
  if (!doc0.departmentId) {
    doctorUpdate.departmentId = deptIds['General Medicine'];
    doctorUpdate.departmentName = 'General Medicine';
  } else {
    // Doctor already belongs to a department - don't double-count them.
    await db.collection('departments').doc(deptIds['General Medicine']).update({ doctorCount: 0 });
  }
  await db.collection('doctors').doc(ids.doctor).set(doctorUpdate, { merge: true });
  const deptId = doctorUpdate.departmentId || doc0.departmentId;
  const deptName = doctorUpdate.departmentName || doc0.departmentName;

  const existingHours = await db.collection('doctorAvailability').where('doctorId', '==', ids.doctor).limit(1).get();
  if (existingHours.empty) {
    for (let day = 1; day <= 5; day++) {
      for (const [start, end] of [['08:00', '12:00'], ['13:00', '16:00']]) {
        await db.collection('doctorAvailability').add({
          doctorId: ids.doctor, day_of_week: day, start_time: start, end_time: end,
          slot_minutes: 30, is_active: true, isDemo: true,
        });
      }
    }
    console.log('  doctor working hours (Mon-Fri)');
  } else {
    console.log('  doctor already has working hours - kept them');
  }

  // --- Pharmacy -------------------------------------------------------
  const catIds = {};
  for (const name of CATEGORIES) {
    catIds[name] = (await db.collection('medicineCategories').add({ name, isDemo: true })).id;
  }
  const medIds = {};
  const stockBatches = {}; // medicine name -> [{ref, qty}]
  for (const [name, cat, generic, unit, price, reorder, batches] of MEDICINES) {
    const total = batches.reduce((s, [q]) => s + q, 0);
    const ref = await db.collection('medicines').add({
      name, categoryId: catIds[cat], categoryName: cat, genericName: generic,
      manufacturer: pick(['Aspen Pharmacare', 'Adcock Ingram', 'Cipla SA', 'Pharma Dynamics']),
      unit, unitPrice: price, reorderLevel: reorder, currentStock: total,
      isActive: true, isDemo: true, createdAt: now, updatedAt: now,
    });
    medIds[name] = ref.id;
    stockBatches[name] = [];
    let b = 1;
    for (const [qty, days] of batches) {
      const exp = new Date(); exp.setDate(exp.getDate() + days);
      const sref = await db.collection('medicineStock').add({
        medicineId: ref.id, medicineName: name,
        batchNumber: `${generic.slice(0, 3).toUpperCase()}-${YEAR}-${String(b++).padStart(3, '0')}`,
        quantity: qty, expiryDate: ymd(exp), supplier: 'Demo Pharma Supplies',
        receivedAt: now, createdAt: now, isDemo: true,
      });
      stockBatches[name].push({ ref: sref, qty, days });
    }
  }
  console.log(`  ${CATEGORIES.length} medicine categories, ${MEDICINES.length} medicines with stock`);

  // Takes dispensed tablets out of stock, earliest-expiring batch first
  // (the same order the app's Dispense button uses).
  async function takeFromStock(medName, qty) {
    const batches = stockBatches[medName].slice().sort((a, b) => a.days - b.days);
    let left = qty;
    for (const bt of batches) {
      if (left <= 0) break;
      const take = Math.min(bt.qty, left);
      bt.qty -= take; left -= take;
      await bt.ref.update({ quantity: bt.qty });
    }
    await db.collection('medicines').doc(medIds[medName]).update({ currentStock: FieldValue.increment(-(qty - left)) });
  }

  // --- Patients -------------------------------------------------------
  const patients = [];
  for (const [first, last, gender, dob, blood, city, phone, chronic] of PATIENTS) {
    const n = await nextCounter(`patients-${YEAR}`);
    const ref = await db.collection('patients').add({
      patientCode: `PT-${YEAR}-${String(n).padStart(6, '0')}`, userId: null,
      firstName: first, lastName: last, dateOfBirth: dob, gender, bloodGroup: blood,
      phone, email: `${first}.${last}@example.com`.toLowerCase(), address: `${int(10, 980)} ${pick(['Mokoena', 'Church', 'Main', 'Lebelo', 'Rose'])} Street`, city,
      allergies: rand() < 0.25 ? pick(['Penicillin', 'Sulfa drugs', 'Peanuts', 'Latex']) : null,
      chronicConditions: chronic,
      emergencyContactName: `${pick(['Grace', 'John', 'Mary', 'Peter', 'Lindiwe', 'David'])} ${last}`,
      emergencyContactPhone: `07${int(1, 9)} ${int(100, 999)} ${int(1000, 9999)}`,
      emergencyContactRelation: pick(['Spouse', 'Parent', 'Sibling', 'Child']),
      insuranceProvider: rand() < 0.5 ? pick(['Discovery Health', 'Bonitas', 'Momentum Health', 'GEMS']) : null,
      insurancePolicyNumber: null, profileImageData: null,
      registeredBy: ids.receptionist, registeredByName: receptionistName,
      isActive: true, isDemo: true, createdAt: now, updatedAt: now,
    });
    patients.push({ id: ref.id, name: `${first} ${last}`, userId: null, chronic });
  }
  // The demo patient's own record gets the same history, so the patient
  // portal has appointments, prescriptions and lab results to show.
  const demoPatient = await db.collection('patients').where('userId', '==', ids.patient).limit(1).get();
  if (!demoPatient.empty) {
    const d = demoPatient.docs[0];
    patients.unshift({ id: d.id, name: `${d.data().firstName} ${d.data().lastName}`, userId: ids.patient, chronic: null, isDemoAccount: true });
  }
  console.log(`  ${PATIENTS.length} sample patients`);

  // --- Visits ---------------------------------------------------------
  const usedSlots = new Set();
  function freeSlot(daysFromToday, direction) {
    for (let tries = 0; tries < 60; tries++) {
      const d = slotOnWeekday(daysFromToday + Math.floor(tries / SLOT_TIMES.length) * direction, pick(SLOT_TIMES), direction);
      const iso = d.toISOString();
      if (!usedSlots.has(iso)) { usedSlots.add(iso); return d; }
    }
    throw new Error('Could not find a free slot');
  }

  let counts = { past: 0, upcoming: 0, records: 0, rx: 0, labs: 0, invoices: 0 };

  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    // Chronic patients get the matching visit; others get a random one.
    let visit;
    if (p.chronic?.includes('diabetes')) visit = VISITS[3];
    else if (p.chronic?.includes('Hypertension')) visit = VISITS[2];
    else if (p.chronic?.includes('Asthma')) visit = VISITS[4];
    else if (p.chronic?.includes('allerg')) visit = VISITS[5];
    else if (p.isDemoAccount) visit = VISITS[1];
    else visit = VISITS[[0, 1, 6, 7, 0, 1][i % 6]];

    const base = {
      patientId: p.id, patientName: p.name, patientUserId: p.userId,
      doctorId: ids.doctor, doctorName: `Dr. ${doctorName}`,
    };

    // Past, completed appointment
    const pastAt = freeSlot(-int(3, 45), -1);
    const apptRef = await db.collection('appointments').add({
      ...base, departmentId: deptId, departmentName: deptName,
      scheduledAt: Timestamp.fromDate(pastAt), durationMinutes: 30,
      reason: visit.reason, status: 'completed', cancellationReason: null,
      bookedBy: ids.receptionist, isDemo: true, createdAt: Timestamp.fromDate(pastAt), updatedAt: now,
    });
    counts.past++;

    // Vitals taken by the nurse
    const hyper = visit === VISITS[2];
    await db.collection('vitals').add({
      patientId: p.id, appointmentId: apptRef.id, recordedBy: ids.nurse, recordedByName: nurseName,
      temperatureCelsius: visit === VISITS[0] || visit === VISITS[1] ? 38.2 : 36.7,
      heartRateBpm: int(64, 92), bloodPressureSystolic: hyper ? int(148, 162) : int(112, 128),
      bloodPressureDiastolic: hyper ? int(92, 100) : int(70, 84), respiratoryRate: int(14, 20),
      oxygenSaturation: visit === VISITS[4] ? 95 : int(97, 99), weightKg: int(52, 96), heightCm: int(152, 186),
      notes: null, isDemo: true, recordedAt: Timestamp.fromDate(pastAt),
    });

    // Medical record
    const follow = new Date(pastAt); follow.setDate(follow.getDate() + 28);
    const recRef = await db.collection('medicalRecords').add({
      ...base, appointmentId: apptRef.id,
      diagnosis: visit.diagnosis, symptoms: visit.symptoms, treatmentPlan: visit.plan,
      doctorNotes: 'Patient counselled and understands the plan.', followUpDate: ymd(follow),
      attachments: [], isDemo: true, createdAt: Timestamp.fromDate(pastAt), updatedAt: now,
    });
    counts.records++;

    // Prescription - most older visits are already dispensed
    if (visit.meds.length) {
      const dispensed = i % 3 !== 0;
      const items = [];
      for (let k = 0; k < visit.meds.length; k++) {
        const [medName, dosage, frequency, days, qty] = visit.meds[k];
        items.push({
          id: `item-${k}-${apptRef.id}`, medicineId: medIds[medName], medicineName: medName,
          dosage, frequency, durationDays: days, quantity: qty, instructions: null,
          isDispensed: dispensed, dispensedBy: dispensed ? ids.pharmacist : null,
          dispensedAt: dispensed ? pastAt.toISOString() : null,
        });
        if (dispensed) await takeFromStock(medName, qty);
      }
      await db.collection('prescriptions').add({
        ...base, medicalRecordId: recRef.id, notes: null,
        status: dispensed ? 'dispensed' : 'pending', items,
        isDemo: true, createdAt: Timestamp.fromDate(pastAt), updatedAt: now,
      });
      counts.rx++;
    }

    // Lab test
    if (visit.lab) {
      const [testName, testType, summary] = visit.lab;
      const done = i % 4 !== 1;
      await db.collection('labTests').add({
        ...base, medicalRecordId: recRef.id, testName, testType,
        priority: i % 5 === 0 ? 'urgent' : 'routine', notes: null,
        status: done ? 'completed' : 'requested',
        requestedAt: Timestamp.fromDate(pastAt),
        result: done ? {
          resultSummary: summary, result_summary: summary, resultData: null,
          reportFileName: null, reportFileData: null,
          uploadedBy: ids.lab, uploadedByName: labName, uploadedAt: pastAt.toISOString(),
          reviewedBy: null, reviewedByName: null, reviewedAt: null,
        } : null,
        isDemo: true,
      });
      counts.labs++;
    }

    // Invoice for the visit - a mix of paid, partly paid and unpaid
    const lines = [{ description: 'Consultation - General Medicine', itemType: 'consultation', referenceId: apptRef.id, quantity: 1, unitPrice: 450 }];
    for (const [medName, , , , qty] of visit.meds) {
      const price = MEDICINES.find((m) => m[0] === medName)[4];
      lines.push({ description: medName, itemType: 'medicine', referenceId: medIds[medName], quantity: qty, unitPrice: price });
    }
    if (visit.lab) lines.push({ description: visit.lab[0], itemType: 'lab_test', referenceId: null, quantity: 1, unitPrice: 320 });
    const items = lines.map((l) => ({ ...l, lineTotal: Math.round(l.quantity * l.unitPrice * 100) / 100 }));
    const subtotal = Math.round(items.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const total = subtotal;
    const mode = i % 3; // 0 paid, 1 partial, 2 unpaid
    const amountPaid = mode === 0 ? total : mode === 1 ? Math.round(total / 2) : 0;
    const payments = amountPaid ? [{
      amount: amountPaid, paymentMethod: pick(['cash', 'card', 'insurance', 'bank_transfer']), referenceNumber: null,
      receivedBy: ids.receptionist, receivedByName: receptionistName, paidAt: pastAt.toISOString(),
    }] : [];
    const due = new Date(pastAt); due.setDate(due.getDate() + 30);
    const invNo = await nextCounter(`invoices-${YEAR}`);
    await db.collection('invoices').add({
      invoiceNumber: `INV-${YEAR}-${String(invNo).padStart(6, '0')}`,
      patientId: p.id, patientName: p.name, appointmentId: apptRef.id,
      subtotal, discount: 0, tax: 0, total, amountPaid,
      status: mode === 0 ? 'paid' : mode === 1 ? 'partial' : 'unpaid', dueDate: ymd(due),
      createdBy: ids.receptionist, createdByName: receptionistName, items, payments,
      isDemo: true, createdAt: Timestamp.fromDate(pastAt), updatedAt: now,
    });
    counts.invoices++;

    // Upcoming appointment, with its slot lock so the time can't be
    // double-booked from the app
    const nextAt = freeSlot(int(1, 14), 1);
    const nextRef = db.collection('appointments').doc();
    await db.collection('slotLocks').doc(`${ids.doctor}_${nextAt.toISOString()}`).set({
      appointmentId: nextRef.id, doctorId: ids.doctor, scheduledAt: nextAt.toISOString(), createdAt: now,
    });
    await nextRef.set({
      ...base, departmentId: deptId, departmentName: deptName,
      scheduledAt: Timestamp.fromDate(nextAt), durationMinutes: 30,
      reason: pick(UPCOMING_REASONS), status: i % 4 === 0 ? 'confirmed' : 'scheduled', cancellationReason: null,
      bookedBy: p.userId || ids.receptionist, isDemo: true, createdAt: now, updatedAt: now,
    });
    counts.upcoming++;
  }

  // --- Notifications ----------------------------------------------------
  const welcome = {
    admin: 'Demo data has been loaded. Explore Patients, Reports and Billing.',
    doctor: 'You have upcoming appointments this week - see Appointments.',
    nurse: 'Vitals history is available for every demo patient.',
    receptionist: 'Some invoices are still unpaid - see Billing.',
    pharmacist: 'Some prescriptions are waiting to be dispensed. Salbutamol inhalers are low on stock.',
    lab: 'Some lab requests are waiting for results.',
    patient: 'Welcome to MediCare HMS. Your next appointment is under My Appointments.',
  };
  for (const [key, message] of Object.entries(welcome)) {
    await db.collection('notifications').add({
      userId: ids[key], type: 'system', title: 'Welcome to the demo', message,
      isRead: false, referenceType: null, referenceId: null, isDemo: true, createdAt: now,
    });
  }

  await marker.set({ addedAt: now, counts });

  console.log(`  ${counts.past} past visits (with vitals and medical records)`);
  console.log(`  ${counts.rx} prescriptions, ${counts.labs} lab tests, ${counts.invoices} invoices`);
  console.log(`  ${counts.upcoming} upcoming appointments`);
  console.log('\nDone! Sign in with any demo account to see the data.\n');
  process.exit(0);
})().catch((err) => {
  console.error('\nSomething went wrong:', err.message, '\n');
  process.exit(1);
});
