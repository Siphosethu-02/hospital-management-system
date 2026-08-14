// src/pages/dashboard/GenericDashboard.jsx
// A lighter, role-appropriate dashboard for doctor/nurse/receptionist/
// pharmacist/lab_staff - each just pulls a couple of relevant counts
// from list endpoints rather than the full admin analytics payload
// (which those roles can't access).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCalendar, FiUsers, FiClipboard, FiActivity, FiPackage, FiArrowRight } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { appointmentsService } from '../../services/appointments.service';
import { prescriptionsService } from '../../services/medicalRecords.service';
import { laboratoryService } from '../../services/laboratory.service';
import { pharmacyService } from '../../services/pharmacy.service';
import { ROLE_LABELS } from '../../routes/roleNav';
import Loader from '../../components/common/Loader';

const WIDGETS_BY_ROLE = {
  doctor: [
    { key: 'appointments', label: "Today's Appointments", icon: FiCalendar, to: '/app/appointments', fetch: () => appointmentsService.list({ dateFrom: new Date().toISOString().slice(0, 10), limit: 1 }) },
    { key: 'prescriptions', label: 'Pending Prescriptions', icon: FiClipboard, to: '/app/prescriptions', fetch: () => prescriptionsService.list({ status: 'pending', limit: 1 }) },
    { key: 'labs', label: 'Lab Requests', icon: FiActivity, to: '/app/laboratory', fetch: () => laboratoryService.listTests({ limit: 1 }) },
  ],
  nurse: [
    { key: 'appointments', label: "Today's Appointments", icon: FiCalendar, to: '/app/appointments', fetch: () => appointmentsService.list({ dateFrom: new Date().toISOString().slice(0, 10), limit: 1 }) },
  ],
  receptionist: [
    { key: 'appointments', label: "Today's Appointments", icon: FiCalendar, to: '/app/appointments', fetch: () => appointmentsService.list({ dateFrom: new Date().toISOString().slice(0, 10), limit: 1 }) },
  ],
  pharmacist: [
    { key: 'prescriptions', label: 'Pending Prescriptions', icon: FiClipboard, to: '/app/prescriptions', fetch: () => prescriptionsService.list({ status: 'pending', limit: 1 }) },
    { key: 'lowStock', label: 'Low-Stock Medicines', icon: FiPackage, to: '/app/pharmacy', fetch: () => pharmacyService.lowStockAlerts().then((r) => ({ data: { meta: { total: r.data.length } } })) },
  ],
  lab_staff: [
    { key: 'labs', label: 'Pending Lab Tests', icon: FiActivity, to: '/app/laboratory', fetch: () => laboratoryService.listTests({ status: 'requested', limit: 1 }) },
  ],
};

export default function GenericDashboard({ role }) {
  const { user } = useAuth();
  const widgets = WIDGETS_BY_ROLE[role] || [];
  const [counts, setCounts] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all(
      widgets.map((w) =>
        w.fetch()
          .then((res) => [w.key, res.data.meta ? res.data.meta.total : (res.data.length ?? 0)])
          .catch(() => [w.key, '-'])
      )
    ).then((entries) => {
      setCounts(Object.fromEntries(entries));
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Welcome back, {user?.first_name}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{ROLE_LABELS[role] || role} dashboard</p>
      </div>

      {isLoading ? (
        <Loader />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {widgets.map(({ key, label, icon: Icon, to }) => (
            <Link key={key} to={to} className="card flex items-center justify-between p-5 transition hover:shadow-md">
              <div>
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{counts[key]}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Icon className="h-6 w-6 text-primary-500" />
                <FiArrowRight className="h-4 w-4 text-gray-300" />
              </div>
            </Link>
          ))}
          <Link to="/app/patients" className="card flex items-center justify-between p-5 transition hover:shadow-md">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Look up a patient</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Search by name, code, or phone</p>
            </div>
            <FiUsers className="h-6 w-6 text-primary-500" />
          </Link>
        </div>
      )}
    </div>
  );
}
