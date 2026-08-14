-- =====================================================================
-- Static reference data. Safe to re-run (uses INSERT IGNORE).
-- The default admin USER is created separately by `npm run db:seed`
-- (database/seed.js) so its password can be properly bcrypt-hashed
-- rather than hardcoded here.
-- =====================================================================

USE hospital_management_system;

INSERT IGNORE INTO roles (name, description) VALUES
  ('admin',        'Full system access - manages users, settings, and reports'),
  ('doctor',       'Views patients, writes diagnoses and prescriptions, requests lab tests'),
  ('nurse',        'Records vitals, updates patient status, assists doctors'),
  ('receptionist', 'Registers patients, books and manages appointments'),
  ('pharmacist',   'Dispenses medicine and manages pharmacy inventory'),
  ('lab_staff',    'Processes laboratory requests and uploads results'),
  ('patient',      'Self-service portal: own appointments, records, prescriptions, and lab results');

INSERT IGNORE INTO departments (name, description) VALUES
  ('General Medicine', 'Primary care and general checkups'),
  ('Cardiology',        'Heart and cardiovascular care'),
  ('Pediatrics',         'Care for infants, children, and adolescents'),
  ('Orthopedics',        'Bones, joints, and musculoskeletal system'),
  ('Radiology',          'Diagnostic imaging services'),
  ('Emergency',          'Urgent and emergency care'),
  ('Obstetrics & Gynecology', 'Pregnancy, childbirth, and women''s health'),
  ('Dermatology',        'Skin, hair, and nail conditions');

INSERT IGNORE INTO medicine_categories (name) VALUES
  ('Analgesics'), ('Antibiotics'), ('Antihistamines'), ('Antihypertensives'),
  ('Antidiabetics'), ('Vitamins & Supplements'), ('Gastrointestinal'), ('Respiratory');
