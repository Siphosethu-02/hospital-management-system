// src/pages/medicalRecords/MedicalRecordsPage.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiPlus } from 'react-icons/fi';
import { medicalRecordsService } from '../../services/medicalRecords.service';
import { patientsService } from '../../services/patients.service';
import { doctorsService } from '../../services/doctors.service';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';

export default function MedicalRecordsPage() {
  const { user } = useAuth();
  const role = user?.role_name || user?.role;
  const canCreate = role === 'admin' || role === 'doctor';

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [patientOptions, setPatientOptions] = useState([]);
  const [doctorOptions, setDoctorOptions] = useState([]);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  const load = () => {
    setIsLoading(true);
    medicalRecordsService.list({ page, limit: 10 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [page]);

  useEffect(() => {
    if (canCreate) {
      patientsService.list({ limit: 100 }).then((res) => setPatientOptions(res.data));
      if (role === 'admin') {
        doctorsService.list({ limit: 100 }).then((res) => setDoctorOptions(res.data));
      }
    }
  }, [canCreate, role]);

  const onCreate = async (values) => {
    try {
      await medicalRecordsService.create({ ...values, patientId: values.patientId, doctorId: role === 'doctor' ? user.id : values.doctorId });
      toast.success('Medical record created');
      setModalOpen(false);
      reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to create record');
    }
  };

  const columns = [
    { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: 'patient', label: 'Patient', render: (r) => `${r.patient_first_name} ${r.patient_last_name}` },
    { key: 'doctor', label: 'Doctor', render: (r) => `Dr. ${r.doctor_first_name} ${r.doctor_last_name}` },
    { key: 'diagnosis', label: 'Diagnosis' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Medical Records</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Diagnosis, treatment plans, and doctor notes.</p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        meta={meta}
        onPageChange={setPage}
        actions={canCreate && (
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            <FiPlus /> New Record
          </button>
        )}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Medical Record" size="lg">
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
              <label className="label">Doctor *</label>
              <select className="input" {...register('doctorId', { required: 'Required' })}>
                <option value="">Select doctor...</option>
                {doctorOptions.map((d) => (
                  <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}</option>
                ))}
              </select>
              {errors.doctorId && <p className="error-text">{errors.doctorId.message}</p>}
            </div>
          )}
          <div>
            <label className="label">Diagnosis *</label>
            <textarea rows={2} className="input" {...register('diagnosis', { required: 'Required' })} />
            {errors.diagnosis && <p className="error-text">{errors.diagnosis.message}</p>}
          </div>
          <div>
            <label className="label">Symptoms</label>
            <textarea rows={2} className="input" {...register('symptoms')} />
          </div>
          <div>
            <label className="label">Treatment plan</label>
            <textarea rows={2} className="input" {...register('treatmentPlan')} />
          </div>
          <div>
            <label className="label">Doctor notes</label>
            <textarea rows={2} className="input" {...register('doctorNotes')} />
          </div>
          <div>
            <label className="label">Follow-up date</label>
            <input type="date" className="input" {...register('followUpDate')} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving...' : 'Save Record'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
