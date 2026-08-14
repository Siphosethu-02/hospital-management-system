// src/pages/patientPortal/PatientDashboard.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCalendar, FiFileText, FiClipboard, FiActivity, FiUser, FiPlus, FiClock } from 'react-icons/fi';
import { patientPortalService } from '../../services/patientPortal.service';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/common/Loader';
import StatusBadge from '../../components/common/StatusBadge';

const QUICK_ACTIONS = [
  { to: '/app/book-appointment', label: 'Book Appointment', icon: FiPlus },
  { to: '/app/my-appointments', label: 'My Appointments', icon: FiCalendar },
  { to: '/app/my-medical-records', label: 'My Medical Records', icon: FiFileText },
  { to: '/app/my-prescriptions', label: 'My Prescriptions', icon: FiClipboard },
  { to: '/app/my-lab-results', label: 'My Laboratory Results', icon: FiActivity },
  { to: '/app/my-profile', label: 'My Profile', icon: FiUser },
];

export default function PatientDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [upcoming, setUpcoming] = useState(null);
  const [recentAppointments, setRecentAppointments] = useState([]);
  const [recentRecords, setRecentRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      patientPortalService.getProfile(),
      patientPortalService.listAppointments({ dateFrom: today, sortBy: 'scheduled_at', order: 'ASC', limit: 5 }),
      patientPortalService.listAppointments({ dateTo: today, sortBy: 'scheduled_at', order: 'DESC', limit: 5 }),
      patientPortalService.listMedicalRecords({ limit: 3 }),
    ]).then(([p, upcomingRes, recentRes, recordsRes]) => {
      setProfile(p.data);
      const nextActive = upcomingRes.data.find((a) => !['cancelled', 'no_show'].includes(a.status));
      setUpcoming(nextActive || null);
      setRecentAppointments(recentRes.data);
      setRecentRecords(recordsRes.data);
    }).finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <Loader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Welcome back, {user?.first_name}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {profile?.patient_code} &middot; {profile?.first_name} {profile?.last_name}
        </p>
      </div>

      {/* Upcoming appointment */}
      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Upcoming Appointment</h3>
        {upcoming ? (
          <div className="flex items-center justify-between rounded-lg bg-primary-50 p-4 dark:bg-primary-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-600">
                <FiClock className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">
                  Dr. {upcoming.doctor_first_name} {upcoming.doctor_last_name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(upcoming.scheduled_at).toLocaleString()}</p>
              </div>
            </div>
            <StatusBadge status={upcoming.status} />
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-dashed border-gray-300 p-4 dark:border-gray-600">
            <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming appointments.</p>
            <Link to="/app/book-appointment" className="btn-primary">Book Now</Link>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="card flex flex-col items-center gap-2 p-4 text-center transition hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40">
                <Icon className="h-4 w-4 text-primary-600 dark:text-primary-300" />
              </div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{label}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent appointments */}
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Recent Appointments</h3>
          {recentAppointments.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No past appointments yet.</p>
          ) : (
            <div className="space-y-2">
              {recentAppointments.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-900/40">
                  <div>
                    <p className="font-medium text-gray-700 dark:text-gray-200">Dr. {a.doctor_first_name} {a.doctor_last_name}</p>
                    <p className="text-xs text-gray-400">{new Date(a.scheduled_at).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent medical info */}
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Recent Medical Information</h3>
          {recentRecords.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No medical records on file yet.</p>
          ) : (
            <div className="space-y-2">
              {recentRecords.map((r) => (
                <div key={r.id} className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-900/40">
                  <p className="font-medium text-gray-700 dark:text-gray-200">{r.diagnosis}</p>
                  <p className="text-xs text-gray-400">Dr. {r.doctor_first_name} {r.doctor_last_name} &middot; {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Basic profile summary */}
      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Basic Profile Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-gray-400">Blood Group</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{profile?.blood_group}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Phone</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{profile?.phone || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Email</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{profile?.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">City</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{profile?.city || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
