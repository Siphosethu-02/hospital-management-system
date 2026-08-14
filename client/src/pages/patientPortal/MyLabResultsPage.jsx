// src/pages/patientPortal/MyLabResultsPage.jsx
import { useEffect, useState } from 'react';
import { FiDownload } from 'react-icons/fi';
import { patientPortalService } from '../../services/patientPortal.service';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';

export default function MyLabResultsPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setIsLoading(true);
    patientPortalService.listLabResults({ page, limit: 10 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  }, [page]);

  const columns = [
    { key: 'requested_at', label: 'Date', render: (r) => new Date(r.requested_at).toLocaleDateString() },
    { key: 'test_name', label: 'Test' },
    { key: 'doctor', label: 'Requested By', render: (r) => `Dr. ${r.doctor_first_name} ${r.doctor_last_name}` },
    { key: 'result_summary', label: 'Result', render: (r) => r.result?.result_summary || '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">My Laboratory Results</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Completed test results ordered by your care team.</p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        meta={meta}
        onPageChange={setPage}
        emptyTitle="No completed results yet"
        emptyMessage="Results appear here once your laboratory test is completed and reviewed."
        rowActions={(row) => (
          row.result?.report_file_url && (
            <a href={row.result.report_file_url} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1.5">
              <FiDownload /> Report
            </a>
          )
        )}
      />
    </div>
  );
}
