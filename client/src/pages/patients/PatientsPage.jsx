// src/pages/patients/PatientsPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiPlus, FiEye } from 'react-icons/fi';
import { patientsService } from '../../services/patients.service';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';

const BLOOD_GROUPS = ['unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function PatientsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role_name || user?.role;
  const canManage = role === 'admin' || role === 'receptionist';

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  const load = () => {
    setIsLoading(true);
    patientsService.list({ search: search || undefined, page, limit: 10 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  const onCreate = async (values) => {
    try {
      await patientsService.create(values);
      toast.success('Patient registered successfully');
      setModalOpen(false);
      reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to register patient');
    }
  };

  const columns = [
    { key: 'patient_code', label: 'Code' },
    { key: 'name', label: 'Name', render: (r) => `${r.first_name} ${r.last_name}` },
    { key: 'gender', label: 'Gender', render: (r) => <span className="capitalize">{r.gender}</span> },
    { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
    { key: 'blood_group', label: 'Blood Group' },
    { key: 'is_active', label: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Patients</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Search, register, and manage patient records.</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        meta={meta}
        onPageChange={setPage}
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        emptyTitle="No patients found"
        emptyMessage="Try a different search, or register a new patient."
        actions={canManage && (
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            <FiPlus /> Register Patient
          </button>
        )}
        rowActions={(row) => (
          <button className="btn-secondary px-3 py-1.5" onClick={() => navigate(`/app/patients/${row.id}`)}>
            <FiEye /> View
          </button>
        )}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Register New Patient" size="lg">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">First name *</label>
              <input className="input" {...register('firstName', { required: 'Required' })} />
              {errors.firstName && <p className="error-text">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className="label">Last name *</label>
              <input className="input" {...register('lastName', { required: 'Required' })} />
              {errors.lastName && <p className="error-text">{errors.lastName.message}</p>}
            </div>
            <div>
              <label className="label">Date of birth *</label>
              <input type="date" className="input" {...register('dateOfBirth', { required: 'Required' })} />
              {errors.dateOfBirth && <p className="error-text">{errors.dateOfBirth.message}</p>}
            </div>
            <div>
              <label className="label">Gender *</label>
              <select className="input" {...register('gender', { required: 'Required' })}>
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              {errors.gender && <p className="error-text">{errors.gender.message}</p>}
            </div>
            <div>
              <label className="label">Blood group</label>
              <select className="input" {...register('bloodGroup')}>
                {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" {...register('phone')} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" {...register('email')} />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input" {...register('city')} />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" {...register('address')} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Allergies</label>
              <textarea className="input" rows={2} {...register('allergies')} />
            </div>
            <div>
              <label className="label">Chronic conditions</label>
              <textarea className="input" rows={2} {...register('chronicConditions')} />
            </div>
          </div>
          <fieldset className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <legend className="px-1 text-xs font-semibold text-gray-500">Emergency Contact</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input className="input" placeholder="Name" {...register('emergencyContactName')} />
              <input className="input" placeholder="Phone" {...register('emergencyContactPhone')} />
              <input className="input" placeholder="Relation" {...register('emergencyContactRelation')} />
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving...' : 'Register Patient'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
