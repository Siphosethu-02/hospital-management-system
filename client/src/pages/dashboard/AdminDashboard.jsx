// src/pages/dashboard/AdminDashboard.jsx
import { useEffect, useState } from 'react';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import {
  FiUsers, FiBriefcase, FiCalendar, FiDollarSign, FiActivity, FiPackage,
} from 'react-icons/fi';
import { reportsService } from '../../services/reports.service';
import Loader from '../../components/common/Loader';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const CARD_CONFIG = [
  { key: 'totalActivePatients', label: 'Active Patients', icon: FiUsers, color: 'bg-blue-500' },
  { key: 'totalActiveDoctors', label: 'Active Doctors', icon: FiBriefcase, color: 'bg-purple-500' },
  { key: 'appointmentsToday', label: "Today's Appointments", icon: FiCalendar, color: 'bg-green-500' },
  { key: 'revenueThisMonth', label: 'Revenue This Month', icon: FiDollarSign, color: 'bg-emerald-500', money: true },
  { key: 'pendingLabTests', label: 'Pending Lab Tests', icon: FiActivity, color: 'bg-amber-500' },
  { key: 'lowStockMedicines', label: 'Low-Stock Medicines', icon: FiPackage, color: 'bg-red-500' },
];

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    reportsService.dashboard()
      .then((res) => setData(res.data))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <Loader />;
  if (!data) return null;

  const { summary, patientsOverTime, appointmentStats, revenueStats } = data;

  const lineData = {
    labels: revenueStats.map((r) => r.period),
    datasets: [
      {
        label: 'Revenue',
        data: revenueStats.map((r) => r.total),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        tension: 0.3,
        fill: true,
      },
    ],
  };

  const doughnutData = {
    labels: appointmentStats.byStatus.map((s) => s.status),
    datasets: [
      {
        data: appointmentStats.byStatus.map((s) => s.count),
        backgroundColor: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">A live snapshot of the hospital, right now.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {CARD_CONFIG.map(({ key, label, icon: Icon, color, money }) => (
          <div key={key} className="card p-4">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-800 dark:text-gray-100">
              {money ? `$${Number(summary[key]).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : summary[key]}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Revenue Trend</h3>
          <Line data={lineData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </div>
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Appointments by Status</h3>
          <Doughnut data={doughnutData} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">New Patient Registrations</h3>
        <p className="mb-4 text-xs text-gray-400">{patientsOverTime.length} data points</p>
        <div className="flex flex-wrap gap-2">
          {patientsOverTime.slice(-14).map((p) => (
            <div key={p.period} className="rounded-lg bg-gray-50 px-3 py-2 text-center dark:bg-gray-900/40">
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{p.count}</p>
              <p className="text-[10px] text-gray-400">{p.period}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
