// src/pages/patientPortal/MyAppointmentsPage.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiPlus, FiX } from 'react-icons/fi';
import { patientPortalService } from '../../services/patientPortal.service';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';

export default function MyAppointmentsPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = () => {
    setIsLoading(true);
    patientPortalService.listAppointments({ status: statusFilter || undefined, page, limit: 10, sortBy: 'scheduled_at', order: 'DESC' })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [statusFilter, page]);

  const onCancel = async (row) => {
    if (!window.confirm('Cancel this appointment?')) return;
    try {
      await patientPortalService.cancelAppointment(row.id, {});
      toast.success('Appointment cancelled');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel appointment');
    }
  };

  const columns = [
    { key: 'scheduled_at', label: 'Date/Time', render: (r) => new Date(r.scheduled_at).toLocaleString() },
    { key: 'doctor', label: 'Doctor', render: (r) => `Dr. ${r.doctor_first_name} ${r.doctor_last_name}` },
    { key: 'department_name', label: 'Department', render: (r) => r.department_name || '—' },
    { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">My Appointments</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Your upcoming and previous visits.</p>
        </div>
        <Link to="/app/book-appointment" className="btn-primary">
          <FiPlus /> Book Appointment
        </Link>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        meta={meta}
        onPageChange={setPage}
        actions={
          <select className="input w-44" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {['scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        }
        rowActions={(row) => (
          !['completed', 'cancelled', 'no_show'].includes(row.status) && (
            <button className="btn-danger px-3 py-1.5" onClick={() => onCancel(row)}>
              <FiX /> Cancel
            </button>
          )
        )}
        emptyTitle="No appointments yet"
        emptyMessage="Book your first appointment to get started."
      />
    </div>
  );
}
