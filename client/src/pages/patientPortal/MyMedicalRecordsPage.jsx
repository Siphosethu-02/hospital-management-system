// src/pages/patientPortal/MyMedicalRecordsPage.jsx
// Read-only by design: no create/edit/delete actions exist anywhere on
// this page, and the backend rejects write attempts from the patient
// role at the route level regardless.
import { useEffect, useState } from 'react';
import { patientPortalService } from '../../services/patientPortal.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';

export default function MyMedicalRecordsPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setIsLoading(true);
    patientPortalService.listMedicalRecords({ page, limit: 10 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  }, [page]);

  const openDetail = async (row) => {
    const res = await patientPortalService.getMedicalRecord(row.id);
    setSelected(res.data);
  };

  const columns = [
    { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: 'diagnosis', label: 'Diagnosis' },
    { key: 'doctor', label: 'Doctor', render: (r) => `Dr. ${r.doctor_first_name} ${r.doctor_last_name}` },
    { key: 'follow_up_date', label: 'Follow-up', render: (r) => r.follow_up_date ? new Date(r.follow_up_date).toLocaleDateString() : '—' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">My Medical Records</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Read-only view of your diagnosis and treatment history.</p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        meta={meta}
        onPageChange={setPage}
        emptyTitle="No medical records yet"
        emptyMessage="Your visit history will appear here after your first appointment."
        rowActions={(row) => (
          <button className="btn-secondary px-3 py-1.5" onClick={() => openDetail(row)}>View</button>
        )}
      />

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Medical Record" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>Dr. {selected.doctor_first_name} {selected.doctor_last_name}</span>
              <span>{new Date(selected.created_at).toLocaleDateString()}</span>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase text-gray-400">Diagnosis</h4>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{selected.diagnosis}</p>
            </div>
            {selected.symptoms && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-gray-400">Symptoms</h4>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{selected.symptoms}</p>
              </div>
            )}
            {selected.treatment_plan && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-gray-400">Treatment Plan</h4>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{selected.treatment_plan}</p>
              </div>
            )}
            {selected.follow_up_date && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-gray-400">Follow-up Date</h4>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{new Date(selected.follow_up_date).toLocaleDateString()}</p>
              </div>
            )}
            {selected.attachments?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-gray-400">Attachments</h4>
                <ul className="mt-1 space-y-1">
                  {selected.attachments.map((a) => (
                    <li key={a.id}>
                      <a href={a.file_url} target="_blank" rel="noreferrer" className="text-sm text-primary-600 hover:underline">
                        {a.file_name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
