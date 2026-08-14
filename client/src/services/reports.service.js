// src/services/reports.service.js
// Client-side aggregation, replacing the old server's SQL GROUP BY
// queries. Firestore has no free-form server-side aggregation beyond
// count()/sum()/average() on a single collection - nothing like a
// SQL JOIN + GROUP BY across collections - so every figure here is
// computed by fetching a bounded batch of documents and reducing them
// in the browser. This is explicitly a demo-scale design (same caveat
// as FIRESTORE_SCHEMA.md's other client-aggregation notes): fine for
// a few hundred records, not a substitute for real analytics
// infrastructure at genuine hospital data volumes.

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { generateReportPdf } from '../firebase/pdf';
import { pharmacyService } from './pharmacy.service';

async function fetchAll(collectionName, ...clauses) {
  const q = clauses.length ? query(collection(db, collectionName), ...clauses) : collection(db, collectionName);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function groupCount(rows, keyFn) {
  const map = new Map();
  rows.forEach((r) => {
    const key = keyFn(r);
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].map(([key, count]) => ({ key, count }));
}

export const reportsService = {
  dashboard: async () => {
    const [patients, doctorUsers, appointments, labTests, lowStock, invoices] = await Promise.all([
      fetchAll('patients', where('isActive', '==', true)),
      fetchAll('users', where('role', '==', 'doctor'), where('isActive', '==', true)),
      fetchAll('appointments'),
      fetchAll('labTests'),
      pharmacyService.lowStockAlerts().then((r) => r.data),
      fetchAll('invoices'),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const appointmentsToday = appointments.filter((a) =>
      a.scheduledAt?.toDate().toISOString().slice(0, 10) === today && a.status !== 'cancelled'
    ).length;

    const pendingLabTests = labTests.filter((t) => !['completed', 'reviewed'].includes(t.status)).length;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let revenueThisMonth = 0;
    const dailyRevenue = new Map();
    invoices.forEach((inv) => {
      (inv.payments || []).forEach((p) => {
        const paidAt = new Date(p.paidAt);
        if (paidAt >= monthStart) revenueThisMonth += p.amount;
        const day = paidAt.toISOString().slice(0, 10);
        dailyRevenue.set(day, (dailyRevenue.get(day) || 0) + p.amount);
      });
    });
    const revenueStats = [...dailyRevenue.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([period, total]) => ({ period, total }));

    const dailyPatients = new Map();
    patients.forEach((p) => {
      const day = p.createdAt?.toDate ? p.createdAt.toDate().toISOString().slice(0, 10) : null;
      if (day) dailyPatients.set(day, (dailyPatients.get(day) || 0) + 1);
    });
    const patientsOverTime = [...dailyPatients.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30)
      .map(([period, count]) => ({ period, count }));

    const byStatus = groupCount(appointments, (a) => a.status).map(({ key, count }) => ({ status: key, count }));

    return {
      data: {
        summary: {
          totalActivePatients: patients.length,
          totalActiveDoctors: doctorUsers.length,
          appointmentsToday,
          revenueThisMonth,
          pendingLabTests,
          lowStockMedicines: lowStock.length,
        },
        patientsOverTime,
        appointmentStats: { byStatus },
        revenueStats,
      },
    };
  },

  // Replaces the old server-rendered PDF endpoints - generates each
  // report as a real PDF in the browser via jsPDF (see firebase/pdf.js).
  downloadReportPdf: async (reportKey, { dateFrom, dateTo } = {}) => {
    const inRange = (isoDate) => {
      if (!isoDate) return true;
      if (dateFrom && isoDate < dateFrom) return false;
      if (dateTo && isoDate > dateTo) return false;
      return true;
    };

    if (reportKey === 'patients') {
      const patients = await fetchAll('patients', where('isActive', '==', true));
      generateReportPdf('Patients Report', [
        { key: 'patientCode', label: 'Code' }, { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
      ], patients.map((p) => ({ ...p, name: `${p.firstName} ${p.lastName}` })));
      return;
    }

    if (reportKey === 'doctors') {
      const [doctors, appointments] = await Promise.all([fetchAll('doctors'), fetchAll('appointments')]);
      const rows = doctors.map((doc) => {
        const mine = appointments.filter((a) => a.doctorId === doc.id);
        const completed = mine.filter((a) => a.status === 'completed').length;
        return {
          name: `${doc.firstName} ${doc.lastName}`, department: doc.departmentName || '-',
          totalAppointments: mine.length, completed,
          completionRate: mine.length ? `${Math.round((completed / mine.length) * 100)}%` : '-',
        };
      });
      generateReportPdf('Doctor Workload Report', [
        { key: 'name', label: 'Doctor' }, { key: 'department', label: 'Department' },
        { key: 'totalAppointments', label: 'Total' }, { key: 'completed', label: 'Completed' },
        { key: 'completionRate', label: 'Completion Rate' },
      ], rows);
      return;
    }

    if (reportKey === 'appointments') {
      const appointments = await fetchAll('appointments');
      const rows = appointments
        .filter((a) => inRange(a.scheduledAt?.toDate().toISOString().slice(0, 10)))
        .map((a) => ({
          date: a.scheduledAt?.toDate().toLocaleDateString(), patient: a.patientName,
          doctor: a.doctorName, status: a.status,
        }));
      generateReportPdf('Appointments Report', [
        { key: 'date', label: 'Date' }, { key: 'patient', label: 'Patient' },
        { key: 'doctor', label: 'Doctor' }, { key: 'status', label: 'Status' },
      ], rows);
      return;
    }

    if (reportKey === 'revenue') {
      const invoices = await fetchAll('invoices');
      const rows = [];
      invoices.forEach((inv) => (inv.payments || []).forEach((p) => {
        const day = p.paidAt.slice(0, 10);
        if (inRange(day)) rows.push({ date: new Date(p.paidAt).toLocaleDateString(), patient: inv.patientName, method: p.paymentMethod, amount: `$${p.amount.toFixed(2)}` });
      }));
      const total = rows.reduce((sum, r) => sum + Number(r.amount.replace('$', '')), 0);
      generateReportPdf('Revenue Report', [
        { key: 'date', label: 'Date' }, { key: 'patient', label: 'Patient' },
        { key: 'method', label: 'Method' }, { key: 'amount', label: 'Amount' },
      ], rows, [`Total collected: $${total.toFixed(2)}`]);
      return;
    }

    if (reportKey === 'medicine-inventory') {
      const medicines = await fetchAll('medicines', where('isActive', '==', true));
      generateReportPdf('Medicine Inventory Report', [
        { key: 'name', label: 'Medicine' }, { key: 'categoryName', label: 'Category' },
        { key: 'currentStock', label: 'Stock' }, { key: 'reorderLevel', label: 'Reorder At' },
        { key: 'unitPrice', label: 'Unit Price' },
      ], medicines);
      return;
    }

    if (reportKey === 'laboratory') {
      const labTests = await fetchAll('labTests');
      const filtered = labTests.filter((t) => inRange(t.requestedAt?.toDate().toISOString().slice(0, 10)));
      const byType = groupCount(filtered, (t) => t.testType || 'Unspecified');
      generateReportPdf('Laboratory Report', [
        { key: 'key', label: 'Test Type' }, { key: 'count', label: 'Count' },
      ], byType);
      return;
    }

    throw new Error(`Unknown report: ${reportKey}`);
  },
};
