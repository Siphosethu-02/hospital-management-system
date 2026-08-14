// src/pages/doctors/DoctorAvailabilityPage.jsx
// Weekly availability management. Admins pick any doctor from a
// dropdown; a logged-in doctor manages only their own schedule (the
// selector is hidden and the backend enforces the same restriction
// independently, so this is a UX convenience, not the security boundary).

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiClock, FiToggleLeft, FiToggleRight } from 'react-icons/fi';
import { doctorsService } from '../../services/doctors.service';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';

// Displayed Monday-Sunday per how people actually think about a work
// week, even though the database (and MySQL's own DAYOFWEEK-style
// convention) stores 0=Sunday..6=Saturday - DAY_LABELS is indexed by
// that stored value; DISPLAY_ORDER just controls render order.
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SLOT_MINUTES_OPTIONS = [15, 20, 30, 45, 60];

function formatTime(t) {
  // TIME columns come back as "08:00:00" - trim to "08:00" for display.
  return t ? t.slice(0, 5) : t;
}

export default function DoctorAvailabilityPage() {
  const { user } = useAuth();
  const role = user?.role_name || user?.role;
  const isAdmin = role === 'admin';

  const [doctorOptions, setDoctorOptions] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedDoctorName, setSelectedDoctorName] = useState('');
  const [availability, setAvailability] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = adding new, object = editing existing

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  // Admin: load the doctor picker. Doctor: auto-select self.
  useEffect(() => {
    if (isAdmin) {
      doctorsService.list({ limit: 100 }).then((res) => setDoctorOptions(res.data));
    } else if (user?.doctorProfile?.id) {
      setSelectedDoctorId(String(user.doctorProfile.id));
      setSelectedDoctorName(`${user.first_name} ${user.last_name}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, user]);

  const loadAvailability = (doctorId) => {
    setIsLoading(true);
    doctorsService.availability(doctorId)
      .then((res) => setAvailability(res.data))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (selectedDoctorId) loadAvailability(selectedDoctorId);
    else setAvailability([]);
  }, [selectedDoctorId]);

  const onSelectDoctor = (e) => {
    const id = e.target.value;
    setSelectedDoctorId(id);
    const doc = doctorOptions.find((d) => String(d.id) === id);
    setSelectedDoctorName(doc ? `${doc.first_name} ${doc.last_name}` : '');
  };

  const openAddModal = () => {
    setEditing(null);
    reset({ dayOfWeek: '1', startTime: '08:00', endTime: '17:00', slotMinutes: '30', isActive: true });
    setModalOpen(true);
  };

  const openEditModal = (slot) => {
    setEditing(slot);
    reset({
      dayOfWeek: String(slot.day_of_week),
      startTime: formatTime(slot.start_time),
      endTime: formatTime(slot.end_time),
      slotMinutes: String(slot.slot_minutes),
      isActive: !!slot.is_active,
    });
    setModalOpen(true);
  };

  const onSubmit = async (values) => {
    const payload = {
      dayOfWeek: Number(values.dayOfWeek),
      startTime: values.startTime,
      endTime: values.endTime,
      slotMinutes: Number(values.slotMinutes),
      isActive: !!values.isActive,
    };

    try {
      if (editing) {
        await doctorsService.updateAvailability(selectedDoctorId, editing.id, payload);
        toast.success('Availability updated');
      } else {
        await doctorsService.addAvailability(selectedDoctorId, payload);
        toast.success('Availability added');
      }
      setModalOpen(false);
      loadAvailability(selectedDoctorId);
    } catch (err) {
      toast.error(err.message || 'Failed to save availability');
    }
  };

  const onDelete = async (slot) => {
    if (!window.confirm(`Remove ${DAY_LABELS[slot.day_of_week]} ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}?`)) return;
    try {
      await doctorsService.removeAvailability(selectedDoctorId, slot.id);
      toast.success('Availability removed');
      loadAvailability(selectedDoctorId);
    } catch (err) {
      toast.error(err.message || 'Failed to remove availability');
    }
  };

  const onToggleActive = async (slot) => {
    try {
      await doctorsService.updateAvailability(selectedDoctorId, slot.id, { isActive: !slot.is_active });
      toast.success(slot.is_active ? 'Window deactivated' : 'Window activated');
      loadAvailability(selectedDoctorId);
    } catch (err) {
      toast.error(err.message || 'Failed to update availability');
    }
  };

  const grouped = DISPLAY_ORDER.map((day) => ({
    day,
    label: DAY_LABELS[day],
    windows: availability.filter((a) => a.day_of_week === day),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          {isAdmin ? 'Doctor Availability' : 'My Availability'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isAdmin
            ? "Manage each doctor's weekly recurring schedule - this is what powers the appointment booking slot picker."
            : 'Manage your own weekly recurring schedule for patient bookings.'}
        </p>
      </div>

      {isAdmin && (
        <div className="card p-4">
          <label className="label">Doctor</label>
          <select className="input max-w-sm" value={selectedDoctorId} onChange={onSelectDoctor}>
            <option value="">Select a doctor...</option>
            {doctorOptions.map((d) => (
              <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name} — {d.specialization || 'General'}</option>
            ))}
          </select>
        </div>
      )}

      {!selectedDoctorId ? (
        <EmptyState title="Select a doctor" message="Choose a doctor above to view and manage their weekly schedule." />
      ) : isLoading ? (
        <Loader />
      ) : (
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {isAdmin ? `Weekly Schedule — Dr. ${selectedDoctorName}` : 'Weekly Schedule'}
            </h3>
            <button className="btn-primary" onClick={openAddModal}>
              <FiPlus /> Add Window
            </button>
          </div>

          {availability.length === 0 ? (
            <EmptyState
              title="No availability configured yet"
              message="Add a weekly window (e.g. Monday 08:00–17:00) so this doctor can be booked."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.map(({ day, label, windows }) => (
                <div key={day} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">{label}</p>
                  {windows.length === 0 ? (
                    <p className="text-xs text-gray-400">No hours set</p>
                  ) : (
                    <div className="space-y-2">
                      {windows.map((slot) => (
                        <div
                          key={slot.id}
                          className={`flex items-center justify-between rounded-lg p-2 text-xs ${
                            slot.is_active
                              ? 'bg-primary-50 dark:bg-primary-900/20'
                              : 'bg-gray-100 opacity-60 dark:bg-gray-800'
                          }`}
                        >
                          <div>
                            <p className="font-medium text-gray-700 dark:text-gray-200">
                              {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                            </p>
                            <p className="text-gray-400">{slot.slot_minutes}-minute slots{!slot.is_active && ' · inactive'}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              title={slot.is_active ? 'Deactivate' : 'Activate'}
                              onClick={() => onToggleActive(slot)}
                              className="p-1 text-gray-400 hover:text-primary-600"
                            >
                              {slot.is_active ? <FiToggleRight className="h-4 w-4" /> : <FiToggleLeft className="h-4 w-4" />}
                            </button>
                            <button title="Edit" onClick={() => openEditModal(slot)} className="p-1 text-gray-400 hover:text-primary-600">
                              <FiEdit2 className="h-3.5 w-3.5" />
                            </button>
                            <button title="Delete" onClick={() => onDelete(slot)} className="p-1 text-gray-400 hover:text-red-600">
                              <FiTrash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Availability Window' : 'Add Availability Window'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Day of week *</label>
            <select className="input" {...register('dayOfWeek', { required: 'Required' })}>
              {DISPLAY_ORDER.map((day) => (
                <option key={day} value={day}>{DAY_LABELS[day]}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start time *</label>
              <input type="time" className="input" {...register('startTime', { required: 'Required' })} />
              {errors.startTime && <p className="error-text">{errors.startTime.message}</p>}
            </div>
            <div>
              <label className="label">End time *</label>
              <input type="time" className="input" {...register('endTime', { required: 'Required' })} />
              {errors.endTime && <p className="error-text">{errors.endTime.message}</p>}
            </div>
          </div>
          <div>
            <label className="label">Slot duration *</label>
            <select className="input" {...register('slotMinutes', { required: 'Required' })}>
              {SLOT_MINUTES_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" className="rounded border-gray-300" {...register('isActive')} />
            Active (available for booking)
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              <FiClock /> {isSubmitting ? 'Saving...' : editing ? 'Save Changes' : 'Add Window'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
