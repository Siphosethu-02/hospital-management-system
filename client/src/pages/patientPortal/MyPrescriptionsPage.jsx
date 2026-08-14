// src/pages/patientPortal/MyPrescriptionsPage.jsx
import { useEffect, useState } from 'react';
import { patientPortalService } from '../../services/patientPortal.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';

export default function MyPrescriptionsPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setIsLoading(true);
    patientPortalService.listPrescriptions({ status: statusFilter || undefined, page, limit: 10 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  }, [statusFilter, page]);

  const openDetail = async (row) => {
    const res = await patientPortalService.getPrescription(row.id);
    setSelected(res.data);
  };

  const columns = [
    { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: 'doctor', label: 'Prescribed By', render: (r) => `Dr. ${r.doctor_first_name} ${r.doctor_last_name}` },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">My Prescriptions</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Medicines prescribed to you, and their dispensing status.</p>
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
            {['pending', 'partially_dispensed', 'dispensed', 'cancelled'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        }
        emptyTitle="No prescriptions yet"
        rowActions={(row) => (
          <button className="btn-secondary px-3 py-1.5" onClick={() => openDetail(row)}>View</button>
        )}
      />

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={`Prescription #${selected?.id || ''}`} size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>Dr. {selected.doctor_first_name} {selected.doctor_last_name}</span>
              <StatusBadge status={selected.status} />
            </div>
            <div className="space-y-2">
              {selected.items.map((item) => (
                <div key={item.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.medicine_name}</p>
                    <StatusBadge status={item.is_dispensed ? 'dispensed' : 'pending'} />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {item.dosage} &middot; {item.frequency} &middot; Qty {item.quantity}
                    {item.duration_days ? ` \u00b7 ${item.duration_days} days` : ''}
                  </p>
                  {item.instructions && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.instructions}</p>}
                </div>
              ))}
            </div>
            {selected.notes && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-gray-400">Notes</h4>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{selected.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
