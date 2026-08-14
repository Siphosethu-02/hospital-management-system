// src/pages/laboratory/LaboratoryPage.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiPlus, FiUpload, FiCheckCircle } from 'react-icons/fi';
import { laboratoryService } from '../../services/laboratory.service';
import { patientsService } from '../../services/patients.service';
import { doctorsService } from '../../services/doctors.service';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';

const STATUS_OPTIONS = ['requested', 'sample_collected', 'in_progress', 'completed', 'cancelled'];

export default function LaboratoryPage() {
  const { user } = useAuth();
  const role = user?.role_name || user?.role;
  const canRequest = role === 'admin' || role === 'doctor';
  const canProcess = role === 'admin' || role === 'lab_staff';

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [resultModal, setResultModal] = useState(null);
  const [patientOptions, setPatientOptions] = useState([]);
  const [doctorOptions, setDoctorOptions] = useState([]);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  const resultForm = useForm();

  const load = () => {
    setIsLoading(true);
    laboratoryService.listTests({ status: statusFilter || undefined, page, limit: 10 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [statusFilter, page]);

  useEffect(() => {
    if (canRequest) {
      patientsService.list({ limit: 100 }).then((res) => setPatientOptions(res.data));
      if (role === 'admin') {
        doctorsService.list({ limit: 100 }).then((res) => setDoctorOptions(res.data));
      }
    }
  }, [canRequest, role]);

  const onRequest = async (values) => {
    try {
      await laboratoryService.createTest({
        ...values,
        patientId: values.patientId,
        doctorId: role === 'doctor' ? user.id : values.doctorId,
      });
      toast.success('Lab test requested');
      setModalOpen(false);
      reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to request test');
    }
  };

  const updateStatus = async (row, status) => {
    try {
      await laboratoryService.updateStatus(row.id, status);
      toast.success('Status updated');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  const onUploadResult = async (values) => {
    try {
      await laboratoryService.uploadResult(resultModal.id, {
        resultSummary: values.resultSummary,
        file: values.file?.[0],
      });
      toast.success('Result uploaded');
      setResultModal(null);
      resultForm.reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to upload result');
    }
  };

  const reviewResult = async (row) => {
    try {
      await laboratoryService.review(row.id);
      toast.success('Marked as reviewed');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to review');
    }
  };

  const columns = [
    { key: 'requested_at', label: 'Requested', render: (r) => new Date(r.requested_at).toLocaleDateString() },
    { key: 'test_name', label: 'Test' },
    { key: 'patient', label: 'Patient', render: (r) => `${r.patient_first_name} ${r.patient_last_name}` },
    { key: 'doctor', label: 'Doctor', render: (r) => `Dr. ${r.doctor_first_name} ${r.doctor_last_name}` },
    { key: 'priority', label: 'Priority', render: (r) => <span className="capitalize">{r.priority}</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Laboratory</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Test requests, sample tracking, and results.</p>
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
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            {canRequest && (
              <button className="btn-primary" onClick={() => setModalOpen(true)}>
                <FiPlus /> Request Test
              </button>
            )}
          </>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-2">
            {canProcess && row.status === 'requested' && (
              <button className="btn-secondary px-2 py-1.5" onClick={() => updateStatus(row, 'sample_collected')}>Collect</button>
            )}
            {canProcess && row.status === 'sample_collected' && (
              <button className="btn-secondary px-2 py-1.5" onClick={() => updateStatus(row, 'in_progress')}>Start</button>
            )}
            {canProcess && ['sample_collected', 'in_progress'].includes(row.status) && (
              <button className="btn-primary px-2 py-1.5" onClick={() => setResultModal(row)}>
                <FiUpload /> Upload Result
              </button>
            )}
            {canRequest && row.status === 'completed' && (
              <button className="btn-secondary px-2 py-1.5" onClick={() => reviewResult(row)}>
                <FiCheckCircle /> Mark Reviewed
              </button>
            )}
          </div>
        )}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Request Lab Test">
        <form onSubmit={handleSubmit(onRequest)} className="space-y-4">
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
              <label className="label">Requesting Doctor *</label>
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
            <label className="label">Test name *</label>
            <input className="input" placeholder="Complete Blood Count" {...register('testName', { required: 'Required' })} />
            {errors.testName && <p className="error-text">{errors.testName.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Test type</label>
              <input className="input" placeholder="blood, urine, imaging..." {...register('testType')} />
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" {...register('priority')}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">Stat</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={2} className="input" {...register('notes')} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Requesting...' : 'Request Test'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!resultModal} onClose={() => setResultModal(null)} title={`Upload Result — ${resultModal?.test_name || ''}`}>
        <form onSubmit={resultForm.handleSubmit(onUploadResult)} className="space-y-4">
          <div>
            <label className="label">Result summary</label>
            <textarea rows={3} className="input" {...resultForm.register('resultSummary')} />
          </div>
          <div>
            <label className="label">Report file (PDF or image)</label>
            <input type="file" accept=".pdf,image/*" className="input" {...resultForm.register('file')} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setResultModal(null)}>Cancel</button>
            <button type="submit" className="btn-primary">Upload &amp; Complete</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
