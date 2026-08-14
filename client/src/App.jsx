// src/App.jsx
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import ProtectedRoute from './routes/ProtectedRoute';
import DashboardLayout from './components/layout/DashboardLayout';
import ErrorPage from './components/common/ErrorPage';

// Public site
import PublicLayout from './components/layout/PublicLayout';
import HomePage from './pages/public/HomePage';
import AboutPage from './pages/public/AboutPage';
import ServicesPage from './pages/public/ServicesPage';
import DepartmentsPublicPage from './pages/public/DepartmentsPublicPage';
import DoctorsPublicPage from './pages/public/DoctorsPublicPage';
import ContactPage from './pages/public/ContactPage';
import LoginPage from './pages/auth/LoginPage';

// App (authenticated)
import DashboardPage from './pages/dashboard/DashboardPage';
import UsersPage from './pages/users/UsersPage';
import PatientsPage from './pages/patients/PatientsPage';
import PatientDetailPage from './pages/patients/PatientDetailPage';
import DoctorsPage from './pages/doctors/DoctorsPage';
import DoctorAvailabilityPage from './pages/doctors/DoctorAvailabilityPage';
import DepartmentsPage from './pages/departments/DepartmentsPage';
import AppointmentsPage from './pages/appointments/AppointmentsPage';
import MedicalRecordsPage from './pages/medicalRecords/MedicalRecordsPage';
import PrescriptionsPage from './pages/prescriptions/PrescriptionsPage';
import VitalsPage from './pages/vitals/VitalsPage';
import PharmacyPage from './pages/pharmacy/PharmacyPage';
import LaboratoryPage from './pages/laboratory/LaboratoryPage';
import BillingPage from './pages/billing/BillingPage';
import ReportsPage from './pages/reports/ReportsPage';
import AuditLogsPage from './pages/audit/AuditLogsPage';
import ProfilePage from './pages/profile/ProfilePage';
import SettingsPage from './pages/settings/SettingsPage';

// Patient portal
import BookAppointmentPage from './pages/patientPortal/BookAppointmentPage';
import MyAppointmentsPage from './pages/patientPortal/MyAppointmentsPage';
import MyMedicalRecordsPage from './pages/patientPortal/MyMedicalRecordsPage';
import MyPrescriptionsPage from './pages/patientPortal/MyPrescriptionsPage';
import MyLabResultsPage from './pages/patientPortal/MyLabResultsPage';
import MyProfilePage from './pages/patientPortal/MyProfilePage';

const ALL_STAFF = ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_staff'];
const ALL_APP_ROLES = [...ALL_STAFF, 'patient'];

export default function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <Routes>
        {/* Public marketing site */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/departments" element={<DepartmentsPublicPage />} />
          <Route path="/doctors" element={<DoctorsPublicPage />} />
          <Route path="/contact" element={<ContactPage />} />
        </Route>

        <Route path="/login" element={<LoginPage />} />

        {/* Authenticated app */}
        <Route
          path="/app"
          element={
            <ProtectedRoute allowedRoles={ALL_APP_ROLES}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="profile" element={<ProfilePage />} />

          <Route
            path="users"
            element={<ProtectedRoute allowedRoles={['admin']}><UsersPage /></ProtectedRoute>}
          />
          <Route path="patients" element={<PatientsPage />} />
          <Route path="patients/:id" element={<PatientDetailPage />} />
          <Route path="doctors" element={<DoctorsPage />} />
          <Route
            path="doctor-availability"
            element={<ProtectedRoute allowedRoles={['admin', 'doctor']}><DoctorAvailabilityPage /></ProtectedRoute>}
          />
          <Route
            path="departments"
            element={<ProtectedRoute allowedRoles={['admin']}><DepartmentsPage /></ProtectedRoute>}
          />
          <Route
            path="appointments"
            element={<ProtectedRoute allowedRoles={['admin', 'doctor', 'nurse', 'receptionist']}><AppointmentsPage /></ProtectedRoute>}
          />
          <Route
            path="medical-records"
            element={<ProtectedRoute allowedRoles={['admin', 'doctor', 'nurse']}><MedicalRecordsPage /></ProtectedRoute>}
          />
          <Route
            path="prescriptions"
            element={<ProtectedRoute allowedRoles={['admin', 'doctor', 'nurse', 'pharmacist']}><PrescriptionsPage /></ProtectedRoute>}
          />
          <Route
            path="vitals"
            element={<ProtectedRoute allowedRoles={['admin', 'nurse']}><VitalsPage /></ProtectedRoute>}
          />
          <Route
            path="pharmacy"
            element={<ProtectedRoute allowedRoles={['admin', 'pharmacist', 'doctor', 'nurse']}><PharmacyPage /></ProtectedRoute>}
          />
          <Route
            path="laboratory"
            element={<ProtectedRoute allowedRoles={['admin', 'lab_staff', 'doctor', 'nurse']}><LaboratoryPage /></ProtectedRoute>}
          />
          <Route
            path="billing"
            element={<ProtectedRoute allowedRoles={['admin', 'receptionist']}><BillingPage /></ProtectedRoute>}
          />
          <Route
            path="reports"
            element={<ProtectedRoute allowedRoles={['admin']}><ReportsPage /></ProtectedRoute>}
          />
          <Route
            path="audit-logs"
            element={<ProtectedRoute allowedRoles={['admin']}><AuditLogsPage /></ProtectedRoute>}
          />
          <Route
            path="settings"
            element={<ProtectedRoute allowedRoles={['admin']}><SettingsPage /></ProtectedRoute>}
          />

          {/* Patient portal - self-service only, ownership enforced server-side */}
          <Route
            path="book-appointment"
            element={<ProtectedRoute allowedRoles={['patient']}><BookAppointmentPage /></ProtectedRoute>}
          />
          <Route
            path="my-appointments"
            element={<ProtectedRoute allowedRoles={['patient']}><MyAppointmentsPage /></ProtectedRoute>}
          />
          <Route
            path="my-medical-records"
            element={<ProtectedRoute allowedRoles={['patient']}><MyMedicalRecordsPage /></ProtectedRoute>}
          />
          <Route
            path="my-prescriptions"
            element={<ProtectedRoute allowedRoles={['patient']}><MyPrescriptionsPage /></ProtectedRoute>}
          />
          <Route
            path="my-lab-results"
            element={<ProtectedRoute allowedRoles={['patient']}><MyLabResultsPage /></ProtectedRoute>}
          />
          <Route
            path="my-profile"
            element={<ProtectedRoute allowedRoles={['patient']}><MyProfilePage /></ProtectedRoute>}
          />
        </Route>

        <Route path="*" element={<ErrorPage code={404} title="Page not found" />} />
      </Routes>
    </>
  );
}
