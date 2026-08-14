// src/pages/dashboard/DashboardPage.jsx
import { useAuth } from '../../context/AuthContext';
import AdminDashboard from './AdminDashboard';
import GenericDashboard from './GenericDashboard';
import PatientDashboard from '../patientPortal/PatientDashboard';

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role_name || user?.role;

  if (role === 'admin') return <AdminDashboard />;
  if (role === 'patient') return <PatientDashboard />;
  return <GenericDashboard role={role} />;
}
