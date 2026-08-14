// src/pages/reports/ReportsPage.jsx
import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiDownload, FiFileText } from 'react-icons/fi';
import { reportsService } from '../../services/reports.service';

const REPORTS = [
  { key: 'patients', label: 'Patients Report', description: 'All active patients with contact details.' },
  { key: 'doctors', label: 'Doctor Workload Report', description: 'Appointment counts and completion rates per doctor.' },
  { key: 'appointments', label: 'Appointments Report', description: 'Appointment history within a date range.' },
  { key: 'revenue', label: 'Revenue Report', description: 'Collected payments grouped by day.' },
  { key: 'medicine-inventory', label: 'Medicine Inventory Report', description: 'Current stock levels for every active medicine.' },
  { key: 'laboratory', label: 'Laboratory Report', description: 'Lab test volume broken down by test type.' },
];

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [downloading, setDownloading] = useState('');

  const download = async (reportKey) => {
    setDownloading(reportKey);
    try {
      await reportsService.downloadReportPdf(reportKey, {
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      });
    } catch (err) {
      toast.error('Failed to generate report PDF');
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Reports</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Generate and export PDF reports.</p>
      </div>

      <div className="card flex flex-wrap items-end gap-4 p-4">
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <p className="pb-2 text-xs text-gray-400">Applies to reports with a date range (revenue, appointments, doctors, laboratory).</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <div key={r.key} className="card p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/40">
              <FiFileText className="h-5 w-5 text-primary-600 dark:text-primary-300" />
            </div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">{r.label}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{r.description}</p>
            <button
              className="btn-secondary mt-4 w-full justify-center"
              disabled={downloading === r.key}
              onClick={() => download(r.key)}
            >
              <FiDownload /> {downloading === r.key ? 'Generating...' : 'Export PDF'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
