// src/pages/patientPortal/BookAppointmentPage.jsx
// The patient-facing booking wizard: Department -> Doctor -> Date ->
// Available Slots -> Confirm. Every step reuses existing endpoints
// (departments, doctors, doctor availability, appointment slot
// generation) - nothing here re-implements availability logic.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiInfo, FiCalendar, FiCheck } from 'react-icons/fi';
import { departmentsService } from '../../services/departments.service';
import { doctorsService } from '../../services/doctors.service';
import { patientPortalService } from '../../services/patientPortal.service';

export default function BookAppointmentPage() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [slots, setSlots] = useState([]);
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [doctorHasSchedule, setDoctorHasSchedule] = useState(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm();
  const watchDepartment = watch('departmentId');
  const watchDoctor = watch('doctorId');
  const watchDate = watch('date');

  useEffect(() => {
    departmentsService.listAll().then((res) => setDepartments(res.data));
  }, []);

  // Department -> filter doctor list.
  useEffect(() => {
    setValue('doctorId', '');
    setDoctors([]);
    setIsLoadingDoctors(true);
    doctorsService.list({ departmentId: watchDepartment || undefined, limit: 100 })
      .then((res) => setDoctors(res.data))
      .finally(() => setIsLoadingDoctors(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchDepartment]);

  // Doctor -> does this doctor have any active schedule at all?
  useEffect(() => {
    setValue('slot', '');
    if (!watchDoctor) { setDoctorHasSchedule(null); return; }
    doctorsService.availability(watchDoctor).then((res) => {
      setDoctorHasSchedule(res.data.some((w) => w.is_active));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchDoctor]);

  // Doctor + date -> load open slots via the patient-portal endpoint,
  // which is a thin pass-through to the same slot generator staff use.
  useEffect(() => {
    setValue('slot', '');
    if (watchDoctor && watchDate) {
      setIsLoadingSlots(true);
      patientPortalService.availableSlots(watchDoctor, watchDate)
        .then((res) => setSlots(res.data))
        .finally(() => setIsLoadingSlots(false));
    } else {
      setSlots([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchDoctor, watchDate]);

  const onSubmit = async (values) => {
    try {
      await patientPortalService.bookAppointment({
        doctorId: values.doctorId,
        scheduledAt: values.slot,
        reason: values.reason,
      });
      toast.success('Appointment booked successfully');
      reset();
      navigate('/app/my-appointments');
    } catch (err) {
      toast.error(err.message || 'Failed to book appointment');
    }
  };

  let slotHelper = null;
  if (!watchDoctor) slotHelper = 'Select a doctor first';
  else if (!watchDate) slotHelper = 'Select a date';
  else if (isLoadingSlots) slotHelper = 'Loading available slots...';
  else if (doctorHasSchedule === false) slotHelper = 'This doctor has no availability configured.';
  else if (slots.length === 0) slotHelper = 'No available slots for this date.';

  const selectedDoctor = doctors.find((d) => String(d.id) === String(watchDoctor));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Book an Appointment</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Choose a department, doctor, and time that works for you.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-5 p-6">
        {/* Step 1: Department */}
        <div>
          <label className="label">1. Department</label>
          <select className="input" {...register('departmentId')}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {/* Step 2: Doctor */}
        <div>
          <label className="label">2. Doctor *</label>
          <select className="input" disabled={isLoadingDoctors} {...register('doctorId', { required: 'Please select a doctor' })}>
            <option value="">{isLoadingDoctors ? 'Loading doctors...' : 'Select a doctor...'}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name} — {d.specialization || 'General'}</option>
            ))}
          </select>
          {errors.doctorId && <p className="error-text">{errors.doctorId.message}</p>}
          {selectedDoctor?.bio && (
            <p className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">{selectedDoctor.bio}</p>
          )}
        </div>

        {/* Step 3: Date */}
        <div>
          <label className="label">3. Date *</label>
          <input
            type="date"
            className="input"
            min={new Date().toISOString().slice(0, 10)}
            {...register('date', { required: 'Please select a date' })}
          />
          {errors.date && <p className="error-text">{errors.date.message}</p>}
        </div>

        {/* Step 4: Slot */}
        <div>
          <label className="label">4. Available Time *</label>
          {slotHelper ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              {isLoadingSlots && <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600" />}
              {!isLoadingSlots && <FiInfo className="h-4 w-4 flex-shrink-0" />}
              {slotHelper}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) => {
                const value = s.startsAt;
                return (
                  <label key={value} className="cursor-pointer">
                    <input type="radio" value={value} className="peer sr-only" {...register('slot', { required: 'Please select a time' })} />
                    <div className="rounded-lg border border-gray-300 px-3 py-2 text-center text-sm text-gray-700 transition peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-checked:font-semibold peer-checked:text-primary-700 dark:border-gray-600 dark:text-gray-200 dark:peer-checked:bg-primary-900/30">
                      {new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          {errors.slot && <p className="error-text">{errors.slot.message}</p>}
        </div>

        {/* Reason */}
        <div>
          <label className="label">Reason for visit</label>
          <textarea rows={2} className="input" placeholder="Briefly describe why you're booking this visit" {...register('reason')} />
        </div>

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
          <FiCheck /> {isSubmitting ? 'Confirming...' : 'Confirm Appointment'}
        </button>
      </form>

      <p className="flex items-center gap-2 text-xs text-gray-400">
        <FiCalendar className="h-3.5 w-3.5" /> Slots shown are checked again the instant you confirm - if someone else books it first, you'll be asked to pick another time.
      </p>
    </div>
  );
}
