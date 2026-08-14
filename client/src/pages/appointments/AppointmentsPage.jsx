// src/pages/appointments/AppointmentsPage.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiPlus, FiX, FiCheck, FiInfo } from 'react-icons/fi';
import { appointmentsService } from '../../services/appointments.service';
import { patientsService } from '../../services/patients.service';
import { doctorsService } from '../../services/doctors.service';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';

const STATUS_FLOW = ['scheduled', 'confirmed', 'checked_in', 'completed'];

export default function AppointmentsPage() {
  const { user } = useAuth();
  const role = user?.role_name || user?.role;
  const canBook = role === 'admin' || role === 'receptionist';

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [patientOptions, setPatientOptions] = useState([]);
  const [doctorOptions, setDoctorOptions] = useState([]);

  // Slot-picker state, kept separate from react-hook-form since it's
  // driven by side effects (fetches), not direct user input.
  const [slots, setSlots] = useState([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  // null = not checked yet, true/false once we know whether this doctor
  // has ANY active weekly availability at all - lets the empty state
  // tell "no schedule configured" apart from "schedule exists, just
  // nothing free on this particular date".
  const [doctorHasSchedule, setDoctorHasSchedule] = useState(null);

  const { register, handleSubmit, watch, reset, setValue, formState: { errors, isSubmitting } } = useForm();
  const watchDoctor = watch('doctorId');
  const watchDate = watch('date');

  const load = () => {
    setIsLoading(true);
    appointmentsService.list({ status: statusFilter || undefined, page, limit: 10, sortBy: 'scheduled_at', order: 'DESC' })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [statusFilter, page]);

  useEffect(() => {
    if (canBook) {
      patientsService.list({ limit: 100 }).then((res) => setPatientOptions(res.data));
      doctorsService.list({ limit: 100 }).then((res) => setDoctorOptions(res.data));
    }
  }, [canBook]);

  // Whenever the doctor changes, find out (independent of any date)
  // whether they have a weekly schedule at all.
  useEffect(() => {
    setValue('slot', '');
    if (!watchDoctor) {
      setDoctorHasSchedule(null);
      return;
    }
    doctorsService.availability(watchDoctor).then((res) => {
      setDoctorHasSchedule(res.data.some((w) => w.is_active));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchDoctor]);

  // Whenever doctor AND date are both picked, load that day's open slots.
  useEffect(() => {
    setValue('slot', '');
    if (watchDoctor && watchDate) {
      setIsLoadingSlots(true);
      doctorsService.availableSlots(watchDoctor, watchDate)
        .then((res) => setSlots(res.data))
        .finally(() => setIsLoadingSlots(false));
    } else {
      setSlots([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchDoctor, watchDate]);

  const onBook = async (values) => {
    try {
      await appointmentsService.create({
        patientId: values.patientId,
        doctorId: values.doctorId,
        scheduledAt: values.slot,
        reason: values.reason,
      });
      toast.success('Appointment booked');
      setModalOpen(false);
      reset();
      setSlots([]);
      setDoctorHasSchedule(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to book appointment');
    }
  };

  const onCancel = async (row) => {
    if (!window.confirm('Cancel this appointment? This will free up the slot for other patients.')) return;
    try {
      await appointmentsService.cancel(row.id, {});
      toast.success('Appointment cancelled - the slot is now available again');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel');
    }
  };

  const advanceStatus = async (row) => {
    const idx = STATUS_FLOW.indexOf(row.status);
    const next = STATUS_FLOW[idx + 1];
    if (!next) return;
    try {
      await appointmentsService.updateStatus(row.id, next);
      toast.success(`Marked as ${next.replace('_', ' ')}`);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  const columns = [
    { key: 'scheduled_at', label: 'Date/Time', render: (r) => new Date(r.scheduled_at).toLocaleString() },
    { key: 'patient', label: 'Patient', render: (r) => `${r.patient_first_name} ${r.patient_last_name}` },
    { key: 'doctor', label: 'Doctor', render: (r) => `Dr. ${r.doctor_first_name} ${r.doctor_last_name}` },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  const closeModal = () => {
    setModalOpen(false);
    reset();
    setSlots([]);
    setDoctorHasSchedule(null);
  };

  // What to show in place of the slot dropdown - covers every state
  // called out in the spec: no doctor, no date, loading, no schedule at
  // all, and schedule-exists-but-fully-booked.
  let slotHelper = null;
  if (!watchDoctor) {
    slotHelper = 'Select a doctor first';
  } else if (!watchDate) {
    slotHelper = 'Select a date';
  } else if (isLoadingSlots) {
    slotHelper = 'Loading available slots...';
  } else if (doctorHasSchedule === false) {
    slotHelper = 'This doctor has no availability configured.';
  } else if (slots.length === 0) {
    slotHelper = 'No available slots for this date.';
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Appointments</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {role === 'doctor' ? 'Your scheduled appointments.' : 'Book, track, and manage patient appointments.'}
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
            <select className="input w-40" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {['scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'].map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            {canBook && (
              <button className="btn-primary" onClick={() => setModalOpen(true)}>
                <FiPlus /> Book Appointment
              </button>
            )}
          </>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-2">
            {STATUS_FLOW.includes(row.status) && STATUS_FLOW.indexOf(row.status) < STATUS_FLOW.length - 1 && (
              <button className="btn-secondary px-2 py-1.5" title="Advance status" onClick={() => advanceStatus(row)}>
                <FiCheck />
              </button>
            )}
            {canBook && !['completed', 'cancelled'].includes(row.status) && (
              <button className="btn-danger px-2 py-1.5" title="Cancel" onClick={() => onCancel(row)}>
                <FiX />
              </button>
            )}
          </div>
        )}
      />

      <Modal isOpen={modalOpen} onClose={closeModal} title="Book Appointment">
        <form onSubmit={handleSubmit(onBook)} className="space-y-4">
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
          <div>
            <label className="label">Doctor *</label>
            <select className="input" {...register('doctorId', { required: 'Required' })}>
              <option value="">Select doctor...</option>
              {doctorOptions.map((d) => (
                <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name} — {d.specialization || 'General'}</option>
              ))}
            </select>
            {errors.doctorId && <p className="error-text">{errors.doctorId.message}</p>}
          </div>
          <div>
            <label className="label">Date *</label>
            <input type="date" className="input" min={new Date().toISOString().slice(0, 10)} {...register('date', { required: 'Required' })} />
          </div>
          <div>
            <label className="label">Available slot *</label>
            {slotHelper ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                {isLoadingSlots && (
                  <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600" />
                )}
                {!isLoadingSlots && <FiInfo className="h-4 w-4 flex-shrink-0" />}
                {slotHelper}
              </div>
            ) : (
              <select className="input" {...register('slot', { required: 'Required' })}>
                <option value="">Select a time...</option>
                {slots.map((s) => (
                  <option key={s.startsAt} value={s.startsAt}>
                    {new Date(s.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </option>
                ))}
              </select>
            )}
            {errors.slot && <p className="error-text">{errors.slot.message}</p>}
          </div>
          <div>
            <label className="label">Reason for visit</label>
            <textarea rows={2} className="input" {...register('reason')} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Booking...' : 'Book Appointment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
