// src/pages/departments/DepartmentsPage.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiPlus, FiTrash2, FiUsers, FiAlertTriangle, FiX } from 'react-icons/fi';
import { departmentsService } from '../../services/departments.service';
import { doctorsService } from '../../services/doctors.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import Loader from '../../components/common/Loader';

export default function DepartmentsPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [allDoctors, setAllDoctors] = useState([]);

  // "Manage Doctors" modal state
  const [managingDept, setManagingDept] = useState(null); // the department row, or null
  const [deptDoctors, setDeptDoctors] = useState([]);
  const [isLoadingDeptDoctors, setIsLoadingDeptDoctors] = useState(false);
  const [addDoctorId, setAddDoctorId] = useState('');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  const load = () => {
    setIsLoading(true);
    departmentsService.list({ search: search || undefined, page, limit: 10 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  const openCreateModal = () => {
    reset({ name: '', description: '', doctorIds: [] });
    doctorsService.list({ limit: 100 }).then((res) => setAllDoctors(res.data));
    setModalOpen(true);
  };

  const onCreate = async (values) => {
    const doctorIds = (values.doctorIds || []).map(Number);
    if (doctorIds.length === 0) {
      toast.error('Select at least one doctor for this department');
      return;
    }
    try {
      await departmentsService.create({ ...values, doctorIds });
      toast.success('Department created');
      setModalOpen(false);
      reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to create department');
    }
  };

  const onDelete = async (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    try {
      await departmentsService.remove(row.id);
      toast.success('Department deleted');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to delete department');
    }
  };

  const openManageDoctors = (row) => {
    setManagingDept(row);
    setAddDoctorId('');
    setIsLoadingDeptDoctors(true);
    doctorsService.list({ departmentId: row.id, limit: 100 })
      .then((res) => setDeptDoctors(res.data))
      .finally(() => setIsLoadingDeptDoctors(false));
    doctorsService.list({ limit: 100 }).then((res) => setAllDoctors(res.data));
  };

  const reloadDeptDoctors = (row) => {
    doctorsService.list({ departmentId: row.id, limit: 100 }).then((res) => setDeptDoctors(res.data));
  };

  const onAddDoctor = async () => {
    if (!addDoctorId) return;
    try {
      await departmentsService.assignDoctor(managingDept.id, addDoctorId);
      toast.success('Doctor added to department');
      setAddDoctorId('');
      reloadDeptDoctors(managingDept);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to add doctor');
    }
  };

  const onRemoveDoctor = async (doctor) => {
    if (!window.confirm(`Remove Dr. ${doctor.first_name} ${doctor.last_name} from ${managingDept.name}?`)) return;
    try {
      await departmentsService.unassignDoctor(managingDept.id, doctor.id);
      toast.success('Doctor removed from department');
      reloadDeptDoctors(managingDept);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to remove doctor');
    }
  };

  // Doctors not already assigned to the department being managed - the
  // only ones that make sense to offer in the "Add doctor" dropdown.
  const availableToAdd = allDoctors.filter((d) => !deptDoctors.some((dd) => dd.id === d.id));

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description', render: (r) => r.description || '—' },
    {
      key: 'doctor_count',
      label: 'Doctors',
      render: (r) => (
        Number(r.doctor_count) === 0 ? (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <FiAlertTriangle className="h-3.5 w-3.5" /> 0 (none assigned)
          </span>
        ) : r.doctor_count
      ),
    },
    { key: 'is_active', label: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Departments</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage hospital departments and their assigned doctors.</p>
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
          <button className="btn-primary" onClick={openCreateModal}>
            <FiPlus /> New Department
          </button>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-2">
            <button className="btn-secondary px-3 py-1.5" onClick={() => openManageDoctors(row)}>
              <FiUsers /> Doctors
            </button>
            <button className="btn-danger px-3 py-1.5" onClick={() => onDelete(row)}>
              <FiTrash2 />
            </button>
          </div>
        )}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Department">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" {...register('name', { required: 'Required' })} />
            {errors.name && <p className="error-text">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Description</label>
            <textarea rows={3} className="input" {...register('description')} />
          </div>
          <div>
            <label className="label">Assign doctor(s) *</label>
            <p className="mb-2 text-xs text-gray-400">Every department needs at least one doctor. Select any that apply - a doctor already in another department will be moved here.</p>
            {allDoctors.length === 0 ? (
              <p className="text-sm text-gray-500">No doctors exist yet - create a doctor account first.</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                {allDoctors.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" value={d.id} className="rounded border-gray-300" {...register('doctorIds')} />
                    Dr. {d.first_name} {d.last_name} {d.department_name ? `(currently: ${d.department_name})` : ''}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving...' : 'Create Department'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!managingDept} onClose={() => setManagingDept(null)} title={`Doctors — ${managingDept?.name || ''}`}>
        <div className="space-y-4">
          {isLoadingDeptDoctors ? (
            <Loader />
          ) : deptDoctors.length === 0 ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">No doctors assigned to this department yet.</p>
          ) : (
            <div className="space-y-2">
              {deptDoctors.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/40">
                  <span className="text-gray-700 dark:text-gray-200">Dr. {d.first_name} {d.last_name} — {d.specialization || 'General'}</span>
                  <button className="text-gray-400 hover:text-red-600" onClick={() => onRemoveDoctor(d)} title="Remove from department">
                    <FiX className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <div className="flex-1">
              <label className="label">Add another doctor</label>
              <select className="input" value={addDoctorId} onChange={(e) => setAddDoctorId(e.target.value)}>
                <option value="">Select a doctor...</option>
                {availableToAdd.map((d) => (
                  <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}{d.department_name ? ` (currently: ${d.department_name})` : ''}</option>
                ))}
              </select>
            </div>
            <button className="btn-primary" onClick={onAddDoctor} disabled={!addDoctorId}>
              <FiPlus /> Add
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
