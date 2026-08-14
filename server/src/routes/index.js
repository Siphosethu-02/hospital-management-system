// src/routes/index.js
// Root router. As each module is built in later stages (patients,
// appointments, medical records, pharmacy, lab, billing, etc.) it gets
// mounted here, one line at a time - keeping app.js untouched.

const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const patientRoutes = require('./patient.routes');
const patientPortalRoutes = require('./patientPortal.routes');
const departmentRoutes = require('./department.routes');
const doctorRoutes = require('./doctor.routes');
const appointmentRoutes = require('./appointment.routes');
const medicalRecordRoutes = require('./medicalRecord.routes');
const vitalsRoutes = require('./vitals.routes');
const prescriptionRoutes = require('./prescription.routes');
const pharmacyRoutes = require('./pharmacy.routes');
const laboratoryRoutes = require('./laboratory.routes');
const billingRoutes = require('./billing.routes');
const reportRoutes = require('./report.routes');
const notificationRoutes = require('./notification.routes');
const auditLogRoutes = require('./auditLog.routes');
const publicRoutes = require('./public.routes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'API is healthy', timestamp: new Date().toISOString() });
});

router.use('/public', publicRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/patients', patientRoutes);
router.use('/patient', patientPortalRoutes);
router.use('/departments', departmentRoutes);
router.use('/doctors', doctorRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/medical-records', medicalRecordRoutes);
router.use('/vitals', vitalsRoutes);
router.use('/prescriptions', prescriptionRoutes);
router.use('/pharmacy', pharmacyRoutes);
router.use('/laboratory', laboratoryRoutes);
router.use('/billing', billingRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit-logs', auditLogRoutes);

module.exports = router;
