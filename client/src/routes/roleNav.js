// src/routes/roleNav.js
// Single source of truth for which sidebar links each role sees, and
// what their default landing page is after login. Icons are react-icons
// components, resolved once here rather than per-render in Sidebar.

import {
  FiGrid, FiUsers, FiUserPlus, FiCalendar, FiFileText, FiHeart, FiClipboard,
  FiPackage, FiActivity, FiDollarSign, FiBarChart2, FiSettings, FiShield, FiBriefcase, FiClock,
} from 'react-icons/fi';

export const NAV_BY_ROLE = {
  admin: [
    { to: '/app/dashboard', label: 'Dashboard', icon: FiGrid },
    { to: '/app/users', label: 'Manage Users', icon: FiUsers },
    { to: '/app/patients', label: 'Patients', icon: FiUserPlus },
    { to: '/app/doctors', label: 'Doctors', icon: FiBriefcase },
    { to: '/app/doctor-availability', label: 'Doctor Availability', icon: FiClock },
    { to: '/app/departments', label: 'Departments', icon: FiClipboard },
    { to: '/app/appointments', label: 'Appointments', icon: FiCalendar },
    { to: '/app/pharmacy', label: 'Pharmacy', icon: FiPackage },
    { to: '/app/laboratory', label: 'Laboratory', icon: FiActivity },
    { to: '/app/billing', label: 'Billing', icon: FiDollarSign },
    { to: '/app/reports', label: 'Reports', icon: FiBarChart2 },
    { to: '/app/audit-logs', label: 'Audit Logs', icon: FiShield },
    { to: '/app/settings', label: 'Settings', icon: FiSettings },
  ],
  doctor: [
    { to: '/app/dashboard', label: 'Dashboard', icon: FiGrid },
    { to: '/app/appointments', label: 'My Appointments', icon: FiCalendar },
    { to: '/app/doctor-availability', label: 'My Availability', icon: FiClock },
    { to: '/app/patients', label: 'Patients', icon: FiUserPlus },
    { to: '/app/medical-records', label: 'Medical Records', icon: FiFileText },
    { to: '/app/prescriptions', label: 'Prescriptions', icon: FiClipboard },
    { to: '/app/laboratory', label: 'Lab Requests', icon: FiActivity },
  ],
  nurse: [
    { to: '/app/dashboard', label: 'Dashboard', icon: FiGrid },
    { to: '/app/patients', label: 'Patients', icon: FiUserPlus },
    { to: '/app/vitals', label: 'Record Vitals', icon: FiHeart },
    { to: '/app/appointments', label: 'Appointments', icon: FiCalendar },
  ],
  receptionist: [
    { to: '/app/dashboard', label: 'Dashboard', icon: FiGrid },
    { to: '/app/patients', label: 'Patients', icon: FiUserPlus },
    { to: '/app/appointments', label: 'Appointments', icon: FiCalendar },
    { to: '/app/billing', label: 'Billing', icon: FiDollarSign },
  ],
  pharmacist: [
    { to: '/app/dashboard', label: 'Dashboard', icon: FiGrid },
    { to: '/app/prescriptions', label: 'Prescriptions', icon: FiClipboard },
    { to: '/app/pharmacy', label: 'Inventory', icon: FiPackage },
  ],
  lab_staff: [
    { to: '/app/dashboard', label: 'Dashboard', icon: FiGrid },
    { to: '/app/laboratory', label: 'Lab Requests', icon: FiActivity },
  ],
  patient: [
    { to: '/app/dashboard', label: 'Dashboard', icon: FiGrid },
    { to: '/app/book-appointment', label: 'Book Appointment', icon: FiCalendar },
    { to: '/app/my-appointments', label: 'My Appointments', icon: FiClock },
    { to: '/app/my-medical-records', label: 'My Medical Records', icon: FiFileText },
    { to: '/app/my-prescriptions', label: 'My Prescriptions', icon: FiClipboard },
    { to: '/app/my-lab-results', label: 'My Lab Results', icon: FiActivity },
    { to: '/app/my-profile', label: 'My Profile', icon: FiUserPlus },
  ],
};

export const ROLE_LABELS = {
  admin: 'Administrator',
  doctor: 'Doctor',
  nurse: 'Nurse',
  receptionist: 'Receptionist',
  pharmacist: 'Pharmacist',
  lab_staff: 'Laboratory Staff',
  patient: 'Patient',
};
