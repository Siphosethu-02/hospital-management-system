// src/pages/billing/BillingPage.jsx
import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiPlus, FiTrash2, FiDollarSign, FiDownload } from 'react-icons/fi';
import { billingService } from '../../services/billing.service';
import { patientsService } from '../../services/patients.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';

export default function BillingPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [patientOptions, setPatientOptions] = useState([]);

  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { items: [{ description: '', itemType: 'other', quantity: 1, unitPrice: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const paymentForm = useForm();

  const load = () => {
    setIsLoading(true);
    billingService.list({ search: search || undefined, status: statusFilter || undefined, page, limit: 10 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, page]);

  useEffect(() => {
    patientsService.list({ limit: 100 }).then((res) => setPatientOptions(res.data));
  }, []);

  const onCreate = async (values) => {
    try {
      await billingService.create({
        patientId: values.patientId,
        dueDate: values.dueDate || null,
        items: values.items.map((i) => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
      });
      toast.success('Invoice created');
      setModalOpen(false);
      reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to create invoice');
    }
  };

  const openDetail = async (row) => {
    const res = await billingService.get(row.id);
    setSelected(res.data);
    setDetailOpen(true);
  };

  const onRecordPayment = async (values) => {
    try {
      const res = await billingService.recordPayment(selected.id, { ...values, amount: Number(values.amount) });
      setSelected(res.data);
      toast.success('Payment recorded');
      paymentForm.reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to record payment');
    }
  };

  const downloadPdf = async (id) => {
    try {
      await billingService.downloadInvoicePdf(id);
    } catch (err) {
      toast.error('Failed to download invoice PDF');
    }
  };

  const columns = [
    { key: 'invoice_number', label: 'Invoice #' },
    { key: 'patient', label: 'Patient', render: (r) => `${r.patient_first_name} ${r.patient_last_name}` },
    { key: 'total', label: 'Total', render: (r) => `$${Number(r.total).toFixed(2)}` },
    { key: 'balance_due', label: 'Balance Due', render: (r) => `$${Number(r.balance_due).toFixed(2)}` },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Billing</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Invoices, payments, and outstanding balances.</p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        meta={meta}
        onPageChange={setPage}
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        actions={
          <>
            <select className="input w-40" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {['unpaid', 'partially_paid', 'paid', 'void'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <button className="btn-primary" onClick={() => setModalOpen(true)}>
              <FiPlus /> New Invoice
            </button>
          </>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-2">
            <button className="btn-secondary px-3 py-1.5" onClick={() => openDetail(row)}>View</button>
            <button className="btn-secondary px-2 py-1.5" onClick={() => downloadPdf(row.id)}><FiDownload /></button>
          </div>
        )}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Invoice" size="lg">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          <div>
            <label className="label">Patient *</label>
            <select className="input" {...register('patientId', { required: 'Required' })}>
              <option value="">Select patient...</option>
              {patientOptions.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.patient_code})</option>)}
            </select>
            {errors.patientId && <p className="error-text">{errors.patientId.message}</p>}
          </div>

          <div className="space-y-3">
            <label className="label">Line items *</label>
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-5">
                <input className="input sm:col-span-2" placeholder="Description" {...register(`items.${idx}.description`, { required: true })} />
                <select className="input" {...register(`items.${idx}.itemType`)}>
                  {['consultation', 'medicine', 'lab_test', 'procedure', 'other'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
                <input type="number" min="1" className="input" placeholder="Qty" {...register(`items.${idx}.quantity`, { required: true })} />
                <div className="flex gap-1">
                  <input type="number" step="0.01" className="input" placeholder="Unit price" {...register(`items.${idx}.unitPrice`, { required: true })} />
                  <button type="button" className="btn-danger px-2" onClick={() => remove(idx)}><FiTrash2 /></button>
                </div>
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={() => append({ description: '', itemType: 'other', quantity: 1, unitPrice: 0 })}>
              <FiPlus /> Add line item
            </button>
          </div>

          <div>
            <label className="label">Due date</label>
            <input type="date" className="input" {...register('dueDate')} />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving...' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} title={selected?.invoice_number} size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-300">{selected.patient_first_name} {selected.patient_last_name}</p>
              <StatusBadge status={selected.status} />
            </div>
            <table className="min-w-full text-sm">
              <tbody>
                {selected.items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2">{item.description}</td>
                    <td className="py-2 text-right">{item.quantity} &times; ${Number(item.unit_price).toFixed(2)}</td>
                    <td className="py-2 text-right font-medium">${Number(item.line_total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end">
              <div className="w-48 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>${Number(selected.subtotal).toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold"><span>Total</span><span>${Number(selected.total).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Paid</span><span>${Number(selected.amount_paid).toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold text-red-600"><span>Balance</span><span>${Number(selected.balance_due).toFixed(2)}</span></div>
              </div>
            </div>

            {selected.status !== 'paid' && selected.status !== 'void' && (
              <form onSubmit={paymentForm.handleSubmit(onRecordPayment)} className="flex flex-wrap items-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <div>
                  <label className="label">Amount</label>
                  <input type="number" step="0.01" className="input w-32" {...paymentForm.register('amount', { required: true })} />
                </div>
                <div>
                  <label className="label">Method</label>
                  <select className="input" {...paymentForm.register('paymentMethod')}>
                    {['cash', 'card', 'bank_transfer', 'insurance', 'mobile_money'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <button type="submit" className="btn-primary">
                  <FiDollarSign /> Record Payment
                </button>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
