// src/pages/prescriptions/PrescriptionsPage.jsx
import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiPlus, FiTrash2, FiPackage } from 'react-icons/fi';
import { prescriptionsService } from '../../services/medicalRecords.service';
import { patientsService } from '../../services/patients.service';
import { doctorsService } from '../../services/doctors.service';
import { pharmacyService } from '../../services/pharmacy.service';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';

export default function PrescriptionsPage() {
  const { user } = useAuth();
  const role = user?.role_name || user?.role;
  const canCreate = role === 'admin' || role === 'doctor';
  const canDispense = role === 'admin' || role === 'pharmacist';

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [patientOptions, setPatientOptions] = useState([]);
  const [doctorOptions, setDoctorOptions] = useState([]);
  const [medicineOptions, setMedicineOptions] = useState([]);

  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { items: [{ medicineId: '', dosage: '', frequency: '', quantity: 1 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const load = () => {
    setIsLoading(true);
    prescriptionsService.list({ status: statusFilter || undefined, page, limit: 10 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [statusFilter, page]);

  useEffect(() => {
    if (canCreate) {
      patientsService.list({ limit: 100 }).then((res) => setPatientOptions(res.data));
      if (role === 'admin') {
        doctorsService.list({ limit: 100 }).then((res) => setDoctorOptions(res.data));
      }
    }
    pharmacyService.listMedicines({ isActive: true, limit: 200 }).then((res) => setMedicineOptions(res.data));
  }, [canCreate]);

  const onCreate = async (values) => {
    try {
      await prescriptionsService.create({
        patientId: values.patientId,
        doctorId: role === 'doctor' ? user.id : values.doctorId,
        notes: values.notes,
        items: values.items.map((i) => ({ ...i, medicineId: i.medicineId, quantity: Number(i.quantity) })),
      });
      toast.success('Prescription created');
      setModalOpen(false);
      reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to create prescription');
    }
  };

  const openDetail = async (row) => {
    const res = await prescriptionsService.get(row.id);
    setSelected(res.data);
    setDetailOpen(true);
  };

  const dispense = async (itemId) => {
    try {
      const res = await prescriptionsService.dispenseItem(selected.id, itemId);
      setSelected(res.data);
      toast.success('Item dispensed');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to dispense');
    }
  };

  const columns = [
    { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: 'patient', label: 'Patient', render: (r) => `${r.patient_first_name} ${r.patient_last_name}` },
    { key: 'doctor', label: 'Doctor', render: (r) => `Dr. ${r.doctor_first_name} ${r.doctor_last_name}` },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Prescriptions</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {canDispense ? 'Review and dispense patient prescriptions.' : 'Write and track patient prescriptions.'}
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        meta={meta}
        onPageChange={setPage}
        actions={
          <>
            <select className="input w-44" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {['pending', 'partially_dispensed', 'dispensed', 'cancelled'].map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            {canCreate && (
              <button className="btn-primary" onClick={() => setModalOpen(true)}>
                <FiPlus /> New Prescription
              </button>
            )}
          </>
        }
        rowActions={(row) => (
          <button className="btn-secondary px-3 py-1.5" onClick={() => openDetail(row)}>View</button>
        )}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Prescription" size="lg">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          <div>
            <label className="label">Patient *</label>
            <select className="input" {...register('patientId', { required: 'Required' })}>
              <option value="">Select patient...</option>
              {patientOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.patient_code})</option>
              ))}
            </select>
            {errors.patientId && <p className="error-text">{errors.patientId.message}</p>}
          </div>
          {role === 'admin' && (
            <div>
              <label className="label">Prescribing Doctor *</label>
              <select className="input" {...register('doctorId', { required: 'Required' })}>
                <option value="">Select doctor...</option>
                {doctorOptions.map((d) => (
                  <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}</option>
                ))}
              </select>
              {errors.doctorId && <p className="error-text">{errors.doctorId.message}</p>}
            </div>
          )}

          <div className="space-y-3">
            <label className="label">Medicines *</label>
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-5">
                <select className="input sm:col-span-2" {...register(`items.${idx}.medicineId`, { required: true })}>
                  <option value="">Medicine...</option>
                  {medicineOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <input className="input" placeholder="Dosage (e.g. 500mg)" {...register(`items.${idx}.dosage`, { required: true })} />
                <input className="input" placeholder="Frequency" {...register(`items.${idx}.frequency`, { required: true })} />
                <div className="flex gap-1">
                  <input type="number" min="1" className="input" placeholder="Qty" {...register(`items.${idx}.quantity`, { required: true, min: 1 })} />
                  <button type="button" className="btn-danger px-2" onClick={() => remove(idx)}><FiTrash2 /></button>
                </div>
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={() => append({ medicineId: '', dosage: '', frequency: '', quantity: 1 })}>
              <FiPlus /> Add medicine
            </button>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea rows={2} className="input" {...register('notes')} />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving...' : 'Create Prescription'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} title={`Prescription #${selected?.id || ''}`} size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {selected.patient_first_name} {selected.patient_last_name} &middot; Dr. {selected.doctor_first_name} {selected.doctor_last_name}
              </p>
              <StatusBadge status={selected.status} />
            </div>
            <div className="space-y-2">
              {selected.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.medicine_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.dosage} &middot; {item.frequency} &middot; qty {item.quantity}</p>
                  </div>
                  {item.is_dispensed ? (
                    <StatusBadge status="dispensed" />
                  ) : canDispense ? (
                    <button className="btn-primary px-3 py-1.5" onClick={() => dispense(item.id)}>
                      <FiPackage /> Dispense
                    </button>
                  ) : (
                    <StatusBadge status="pending" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
