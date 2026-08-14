-- =====================================================================
-- Hospital Management System - MySQL Schema
-- =====================================================================
-- Engine: InnoDB (foreign keys + transactions)
-- Charset: utf8mb4 (full unicode, incl. emoji in free-text fields)
--
-- Run with:  mysql -u root -p < database/schema.sql
-- or:        npm run db:init
-- =====================================================================

CREATE DATABASE IF NOT EXISTS hospital_management_system
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE hospital_management_system;

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. ROLES  &  USERS
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS roles;
CREATE TABLE roles (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(50) NOT NULL UNIQUE,   -- admin, doctor, nurse, receptionist, pharmacist, lab_staff
  description   VARCHAR(255) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id         INT UNSIGNED NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  phone           VARCHAR(30) NULL,
  avatar_url      VARCHAR(500) NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  token_version   INT UNSIGNED NOT NULL DEFAULT 0,   -- bump to invalidate all issued JWTs
  last_login_at   DATETIME NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
  INDEX idx_users_role (role_id),
  INDEX idx_users_email (email)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. DEPARTMENTS
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS departments;
CREATE TABLE departments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL UNIQUE,   -- Cardiology, Radiology, ...
  description   TEXT NULL,
  head_doctor_id INT UNSIGNED NULL,              -- set after doctors table exists (FK added below)
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. DOCTORS  (1:1 extension of users where role = doctor)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS doctors;
CREATE TABLE doctors (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             INT UNSIGNED NOT NULL UNIQUE,
  department_id       INT UNSIGNED NULL,
  specialization      VARCHAR(150) NULL,
  qualification        VARCHAR(255) NULL,
  license_number      VARCHAR(100) NULL UNIQUE,
  years_of_experience SMALLINT UNSIGNED NULL,
  consultation_fee    DECIMAL(10,2) NULL,
  bio                 TEXT NULL,
  room_number         VARCHAR(20) NULL,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_doctors_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_doctors_department (department_id)
) ENGINE=InnoDB;

ALTER TABLE departments
  ADD CONSTRAINT fk_departments_head_doctor
  FOREIGN KEY (head_doctor_id) REFERENCES doctors(id) ON DELETE SET NULL;

-- Weekly recurring availability, used by the appointment scheduler.
DROP TABLE IF EXISTS doctor_availability;
CREATE TABLE doctor_availability (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doctor_id     INT UNSIGNED NOT NULL,
  day_of_week   TINYINT UNSIGNED NOT NULL,   -- 0=Sunday .. 6=Saturday
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  slot_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_availability_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  INDEX idx_availability_doctor_day (doctor_id, day_of_week)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. PATIENTS
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS patients;
CREATE TABLE patients (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_code          VARCHAR(20) NOT NULL UNIQUE,   -- e.g. PT-2026-000123, generated at insert time
  user_id               INT UNSIGNED NULL UNIQUE,       -- optional: set if patient has portal login access
  first_name            VARCHAR(100) NOT NULL,
  last_name             VARCHAR(100) NOT NULL,
  date_of_birth         DATE NOT NULL,
  gender                ENUM('male', 'female', 'other') NOT NULL,
  blood_group           ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown') NOT NULL DEFAULT 'unknown',
  phone                 VARCHAR(30) NULL,
  email                 VARCHAR(150) NULL,
  address               VARCHAR(500) NULL,
  city                  VARCHAR(100) NULL,
  allergies             TEXT NULL,
  chronic_conditions    TEXT NULL,
  emergency_contact_name  VARCHAR(150) NULL,
  emergency_contact_phone VARCHAR(30) NULL,
  emergency_contact_relation VARCHAR(50) NULL,
  insurance_provider    VARCHAR(150) NULL,
  insurance_policy_number VARCHAR(100) NULL,
  profile_image_url     VARCHAR(500) NULL,
  registered_by         INT UNSIGNED NULL,   -- receptionist/admin user id
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_patients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_patients_registered_by FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_patients_name (last_name, first_name),
  INDEX idx_patients_phone (phone)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. APPOINTMENTS
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS appointments;
CREATE TABLE appointments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id        INT UNSIGNED NOT NULL,
  doctor_id         INT UNSIGNED NOT NULL,
  department_id     INT UNSIGNED NULL,
  scheduled_at      DATETIME NOT NULL,
  duration_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  reason            VARCHAR(500) NULL,
  status            ENUM('scheduled','confirmed','checked_in','completed','cancelled','no_show')
                    NOT NULL DEFAULT 'scheduled',
  cancellation_reason VARCHAR(500) NULL,
  booked_by         INT UNSIGNED NULL,   -- receptionist/user id
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_appt_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  CONSTRAINT fk_appt_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_appt_booked_by FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_appt_doctor_time (doctor_id, scheduled_at),
  INDEX idx_appt_patient_time (patient_id, scheduled_at),
  INDEX idx_appt_status (status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. VITALS  (recorded by nurses)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS patient_vitals;
CREATE TABLE patient_vitals (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id          INT UNSIGNED NOT NULL,
  appointment_id      INT UNSIGNED NULL,
  recorded_by         INT UNSIGNED NOT NULL,   -- nurse user id
  temperature_celsius DECIMAL(4,1) NULL,
  heart_rate_bpm      SMALLINT UNSIGNED NULL,
  blood_pressure_systolic  SMALLINT UNSIGNED NULL,
  blood_pressure_diastolic SMALLINT UNSIGNED NULL,
  respiratory_rate    SMALLINT UNSIGNED NULL,
  oxygen_saturation   DECIMAL(4,1) NULL,
  weight_kg           DECIMAL(5,2) NULL,
  height_cm           DECIMAL(5,2) NULL,
  notes               TEXT NULL,
  recorded_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vitals_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_vitals_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  CONSTRAINT fk_vitals_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_vitals_patient (patient_id, recorded_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. MEDICAL RECORDS  (diagnosis / treatment / notes per encounter)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS medical_records;
CREATE TABLE medical_records (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id        INT UNSIGNED NOT NULL,
  doctor_id         INT UNSIGNED NOT NULL,
  appointment_id    INT UNSIGNED NULL,
  diagnosis         TEXT NOT NULL,
  symptoms          TEXT NULL,
  treatment_plan    TEXT NULL,
  doctor_notes      TEXT NULL,
  follow_up_date    DATE NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_records_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_records_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT,
  CONSTRAINT fk_records_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  INDEX idx_records_patient (patient_id, created_at)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS medical_record_attachments;
CREATE TABLE medical_record_attachments (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medical_record_id   INT UNSIGNED NOT NULL,
  file_name           VARCHAR(255) NOT NULL,
  file_url            VARCHAR(500) NOT NULL,
  file_type           VARCHAR(100) NULL,
  uploaded_by         INT UNSIGNED NULL,
  uploaded_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attachment_record FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachment_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. MEDICINES  &  PRESCRIPTIONS
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS medicine_categories;
CREATE TABLE medicine_categories (
  id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name    VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

DROP TABLE IF EXISTS medicines;
CREATE TABLE medicines (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id     INT UNSIGNED NULL,
  name            VARCHAR(200) NOT NULL,
  generic_name    VARCHAR(200) NULL,
  manufacturer    VARCHAR(150) NULL,
  unit            VARCHAR(50) NOT NULL DEFAULT 'tablet',   -- tablet, ml, capsule, vial ...
  unit_price      DECIMAL(10,2) NOT NULL DEFAULT 0,
  reorder_level   INT UNSIGNED NOT NULL DEFAULT 20,        -- triggers low-stock alert
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_medicines_category FOREIGN KEY (category_id) REFERENCES medicine_categories(id) ON DELETE SET NULL,
  INDEX idx_medicines_name (name)
) ENGINE=InnoDB;

-- Batch-level stock so expiry tracking is accurate per batch received.
DROP TABLE IF EXISTS medicine_stock;
CREATE TABLE medicine_stock (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medicine_id     INT UNSIGNED NOT NULL,
  batch_number    VARCHAR(100) NULL,
  quantity        INT NOT NULL DEFAULT 0,
  expiry_date     DATE NOT NULL,
  received_at     DATE NOT NULL DEFAULT (CURRENT_DATE),
  supplier        VARCHAR(150) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE,
  INDEX idx_stock_medicine (medicine_id),
  INDEX idx_stock_expiry (expiry_date)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS prescriptions;
CREATE TABLE prescriptions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id        INT UNSIGNED NOT NULL,
  doctor_id         INT UNSIGNED NOT NULL,
  medical_record_id INT UNSIGNED NULL,
  status            ENUM('pending','partially_dispensed','dispensed','cancelled') NOT NULL DEFAULT 'pending',
  notes             TEXT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prescriptions_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_prescriptions_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT,
  CONSTRAINT fk_prescriptions_record FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL,
  INDEX idx_prescriptions_patient (patient_id, created_at)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS prescription_items;
CREATE TABLE prescription_items (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prescription_id  INT UNSIGNED NOT NULL,
  medicine_id      INT UNSIGNED NOT NULL,
  dosage           VARCHAR(100) NOT NULL,        -- e.g. "500mg"
  frequency        VARCHAR(100) NOT NULL,        -- e.g. "twice a day"
  duration_days    SMALLINT UNSIGNED NULL,
  quantity         INT UNSIGNED NOT NULL,
  instructions     VARCHAR(500) NULL,
  is_dispensed     TINYINT(1) NOT NULL DEFAULT 0,
  dispensed_by     INT UNSIGNED NULL,
  dispensed_at     TIMESTAMP NULL,
  CONSTRAINT fk_items_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE RESTRICT,
  CONSTRAINT fk_items_dispensed_by FOREIGN KEY (dispensed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. LABORATORY
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS laboratory_tests;
CREATE TABLE laboratory_tests (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id      INT UNSIGNED NOT NULL,
  doctor_id       INT UNSIGNED NOT NULL,
  medical_record_id INT UNSIGNED NULL,
  test_name       VARCHAR(200) NOT NULL,
  test_type       VARCHAR(100) NULL,             -- blood, urine, imaging ...
  priority        ENUM('routine','urgent','stat') NOT NULL DEFAULT 'routine',
  status          ENUM('requested','sample_collected','in_progress','completed','cancelled')
                  NOT NULL DEFAULT 'requested',
  requested_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes           TEXT NULL,
  CONSTRAINT fk_labtest_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_labtest_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT,
  CONSTRAINT fk_labtest_record FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL,
  INDEX idx_labtest_patient (patient_id),
  INDEX idx_labtest_status (status)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS laboratory_results;
CREATE TABLE laboratory_results (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  laboratory_test_id  INT UNSIGNED NOT NULL UNIQUE,
  result_summary      TEXT NULL,
  result_data         JSON NULL,        -- structured key/value results, e.g. { "WBC": "6.2", "RBC": "4.8" }
  report_file_url     VARCHAR(500) NULL,
  uploaded_by          INT UNSIGNED NOT NULL,    -- lab staff user id
  reviewed_by          INT UNSIGNED NULL,        -- doctor who acknowledged the result
  reviewed_at          TIMESTAMP NULL,
  uploaded_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_labresult_test FOREIGN KEY (laboratory_test_id) REFERENCES laboratory_tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_labresult_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_labresult_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 10. BILLING
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS invoices;
CREATE TABLE invoices (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_number    VARCHAR(30) NOT NULL UNIQUE,   -- e.g. INV-2026-000123
  patient_id        INT UNSIGNED NOT NULL,
  appointment_id    INT UNSIGNED NULL,
  subtotal          DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount          DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax               DECIMAL(12,2) NOT NULL DEFAULT 0,
  total             DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_paid       DECIMAL(12,2) NOT NULL DEFAULT 0,
  status            ENUM('unpaid','partially_paid','paid','void') NOT NULL DEFAULT 'unpaid',
  due_date          DATE NULL,
  created_by        INT UNSIGNED NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoices_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  CONSTRAINT fk_invoices_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_invoices_patient (patient_id),
  INDEX idx_invoices_status (status)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS invoice_items;
CREATE TABLE invoice_items (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id    INT UNSIGNED NOT NULL,
  description   VARCHAR(255) NOT NULL,     -- "Consultation - Dr. Smith", "Paracetamol x10", "CBC Test"
  item_type     ENUM('consultation','medicine','lab_test','procedure','other') NOT NULL DEFAULT 'other',
  reference_id  INT UNSIGNED NULL,          -- id in the related table (medicine_id, laboratory_test_id, ...)
  quantity      INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price    DECIMAL(10,2) NOT NULL,
  line_total    DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

DROP TABLE IF EXISTS payments;
CREATE TABLE payments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id      INT UNSIGNED NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  payment_method  ENUM('cash','card','bank_transfer','insurance','mobile_money') NOT NULL DEFAULT 'cash',
  reference_number VARCHAR(100) NULL,
  received_by     INT UNSIGNED NULL,
  paid_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_received_by FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_payments_invoice (invoice_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 11. NOTIFICATIONS
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS notifications;
CREATE TABLE notifications (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  type          ENUM('appointment_reminder','lab_result','prescription','billing','system') NOT NULL,
  title         VARCHAR(200) NOT NULL,
  message       VARCHAR(1000) NOT NULL,
  is_read       TINYINT(1) NOT NULL DEFAULT 0,
  reference_type VARCHAR(50) NULL,    -- e.g. 'appointment', 'invoice'
  reference_id   INT UNSIGNED NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user_unread (user_id, is_read)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 12. AUDIT LOGS
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS audit_logs;
CREATE TABLE audit_logs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NULL,           -- nullable: system-generated events have no actor
  action        VARCHAR(100) NOT NULL,       -- e.g. 'LOGIN', 'PATIENT_CREATED', 'PRESCRIPTION_DISPENSED'
  entity_type   VARCHAR(100) NULL,           -- e.g. 'patient', 'invoice'
  entity_id     INT UNSIGNED NULL,
  ip_address    VARCHAR(45) NULL,
  user_agent    VARCHAR(255) NULL,
  metadata      JSON NULL,                   -- arbitrary before/after diff or extra context
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
