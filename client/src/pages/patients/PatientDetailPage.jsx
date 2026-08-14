// src/pages/patients/PatientDetailPage.jsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiPhone, FiMail, FiMapPin, FiDroplet, FiUpload, FiKey, FiCheckCircle } from 'react-icons/fi';
import { patientsService } from '../../services/patients.service';
import { medicalRecordsService, vitalsService, prescriptionsService } from '../../services/medicalRecords.service';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/common/Loader';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';

export default function PatientDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const role = user?.role_name || user?.role;

  const [patient, setPatient] = useState(null);
  const [records, setRecords] = useState([]);
  const [vitals, setVitals] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [portalModalOpen, setPortalModalOpen] = useState(false);
  const portalForm = useForm();

  const canManagePortalAccess = role === 'admin' || role === 'receptionist';

  const load = () => {
    setIsLoading(true);
    Promise.all([
      patientsService.get(id),
      medicalRecordsService.list({ patientId: id, limit: 20 }).catch(() => ({ data: [] })),
      vitalsService.listByPatient(id, { limit: 10 }).catch(() => ({ data: [] })),
      prescriptionsService.list({ patientId: id, limit: 20 }).catch(() => ({ data: [] })),
    ]).then(([p, r, v, pr]) => {
      setPatient(p.data);
      setRecords(r.data);
      setVitals(v.data);
      setPrescriptions(pr.data);
    }).finally(() => setIsLoading(false));
  };

  useEffect(load, [id]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await patientsService.uploadImage(id, file);
      toast.success('Photo updated');
      load();
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    }
  };

  const onGrantPortalAccess = async (values) => {
    try {
      await patientsService.grantPortalAccess(id, values);
      toast.success('Portal access granted - share these credentials with the patient');
      setPortalModalOpen(false);
      portalForm.reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to grant portal access');
    }
  };

  if (isLoading) return <Loader />;
  if (!patient) return null;

  return (
    <div className="space-y-6">
      <Link to="/app/patients" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600">
        <FiArrowLeft /> Back to patients
      </Link>

      <div className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-2xl font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
            {patient.profile_image_url
              ? <img src={patient.profile_image_url} alt="" className="h-full w-full object-cover" />
              : `${patient.first_name[0]}${patient.last_name[0]}`}
          </div>
          {(role === 'admin' || role === 'receptionist') && (
            <label className="absolute -bottom-1 -right-1 cursor-pointer rounded-full bg-primary-600 p-1.5 text-white">
              <FiUpload className="h-3 w-3" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          )}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{patient.first_name} {patient.last_name}</h1>
            <StatusBadge status={patient.is_active ? 'active' : 'inactive'} />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{patient.patient_code} &middot; {patient.gender} &middot; DOB {new Date(patient.date_of_birth).toLocaleDateString()}</p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
            {patient.phone && <span className="flex items-center gap-1"><FiPhone className="h-3.5 w-3.5" /> {patient.phone}</span>}
            {patient.email && <span className="flex items-center gap-1"><FiMail className="h-3.5 w-3.5" /> {patient.email}</span>}
            {patient.city && <span className="flex items-center gap-1"><FiMapPin className="h-3.5 w-3.5" /> {patient.city}</span>}
            <span className="flex items-center gap-1"><FiDroplet className="h-3.5 w-3.5" /> {patient.blood_group}</span>
          </div>
        </div>
        {canManagePortalAccess && (
          patient.user_id ? (
            <span className="flex items-center gap-2 self-start rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
              <FiCheckCircle className="h-4 w-4" /> Portal access active
            </span>
          ) : (
            <button className="btn-secondary self-start" onClick={() => setPortalModalOpen(true)}>
              <FiKey /> Grant Portal Access
            </button>
          )
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {['overview', 'medical-records', 'vitals', 'prescriptions'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 dark:text-gray-400'}`}
          >
            {t.replace('-', ' ')}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card grid grid-cols-1 gap-6 p-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Allergies</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{patient.allergies || 'None recorded'}</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Chronic Conditions</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{patient.chronic_conditions || 'None recorded'}</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Emergency Contact</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {patient.emergency_contact_name
                ? `${patient.emergency_contact_name} (${patient.emergency_contact_relation || 'n/a'}) — ${patient.emergency_contact_phone || 'no phone'}`
                : 'Not provided'}
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Insurance</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {patient.insurance_provider ? `${patient.insurance_provider} — ${patient.insurance_policy_number || ''}` : 'None on file'}
            </p>
          </div>
        </div>
      )}

      {tab === 'medical-records' && (
        <div className="space-y-3">
          {records.length === 0 && <p className="text-sm text-gray-500">No medical records yet.</p>}
          {records.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{r.diagnosis}</p>
                <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Dr. {r.doctor_first_name} {r.doctor_last_name}</p>
              {r.treatment_plan && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{r.treatment_plan}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'vitals' && (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                {['Date', 'Temp (°C)', 'HR (bpm)', 'BP', 'SpO2 (%)', 'Weight (kg)'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {vitals.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2 text-sm">{new Date(v.recorded_at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-sm">{v.temperature_celsius ?? '—'}</td>
                  <td className="px-4 py-2 text-sm">{v.heart_rate_bpm ?? '—'}</td>
                  <td className="px-4 py-2 text-sm">{v.blood_pressure_systolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}` : '—'}</td>
                  <td className="px-4 py-2 text-sm">{v.oxygen_saturation ?? '—'}</td>
                  <td className="px-4 py-2 text-sm">{v.weight_kg ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {vitals.length === 0 && <p className="p-4 text-sm text-gray-500">No vitals recorded yet.</p>}
        </div>
      )}

      {tab === 'prescriptions' && (
        <div className="space-y-3">
          {prescriptions.length === 0 && <p className="text-sm text-gray-500">No prescriptions yet.</p>}
          {prescriptions.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Prescription #{p.id}</p>
                <StatusBadge status={p.status} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Dr. {p.doctor_first_name} {p.doctor_last_name} &middot; {new Date(p.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={portalModalOpen} onClose={() => setPortalModalOpen(false)} title="Grant Patient Portal Access">
        <form onSubmit={portalForm.handleSubmit(onGrantPortalAccess)} className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Creates a login for {patient.first_name} {patient.last_name} so they can book appointments and view their own records, prescriptions, and lab results online. Their existing medical history is never changed.
          </p>
          <div>
            <label className="label">Email *</label>
            <input type="email" className="input" defaultValue={patient.email || ''} {...portalForm.register('email', { required: 'Required' })} />
            {portalForm.formState.errors.email && <p className="error-text">{portalForm.formState.errors.email.message}</p>}
          </div>
          <div>
            <label className="label">Temporary password *</label>
            <input
              type="password"
              className="input"
              {...portalForm.register('password', {
                required: 'Required',
                minLength: { value: 8, message: 'At least 8 characters' },
              })}
            />
            {portalForm.formState.errors.password && <p className="error-text">{portalForm.formState.errors.password.message}</p>}
            <p className="mt-1 text-xs text-gray-400">Share this with the patient directly - they can change it after logging in.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setPortalModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={portalForm.formState.isSubmitting} className="btn-primary">
              {portalForm.formState.isSubmitting ? 'Granting...' : 'Grant Access'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
