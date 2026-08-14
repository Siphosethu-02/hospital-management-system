// src/pages/audit/AuditLogsPage.jsx
import { useEffect, useState } from 'react';
import { auditLogsService } from '../../services/auditLogs.service';
import DataTable from '../../components/common/DataTable';

export default function AuditLogsPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setIsLoading(true);
    auditLogsService.list({ page, limit: 20 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  }, [page]);

  const columns = [
    { key: 'created_at', label: 'Timestamp', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'user', label: 'User', render: (r) => (r.first_name ? `${r.first_name} ${r.last_name}` : 'System') },
    { key: 'action', label: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
    { key: 'entity_type', label: 'Entity', render: (r) => r.entity_type ? `${r.entity_type} #${r.entity_id}` : '—' },
    { key: 'ip_address', label: 'IP', render: (r) => r.ip_address || '—' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Audit Logs</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">A full trail of who did what, and when.</p>
      </div>

      <DataTable columns={columns} rows={rows} isLoading={isLoading} meta={meta} onPageChange={setPage} />
    </div>
  );
}
