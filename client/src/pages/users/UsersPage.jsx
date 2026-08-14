// src/pages/users/UsersPage.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiPlus, FiUserX, FiUserCheck, FiEdit2 } from 'react-icons/fi';
import { usersService } from '../../services/users.service';
import { authService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';

const ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_staff'];

export default function UsersPage() {
  const { user: currentUser, refreshCurrentUser } = useAuth();

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // the row being edited, or null

  const createForm = useForm();
  const editForm = useForm();

  const load = () => {
    setIsLoading(true);
    usersService.list({ search: search || undefined, role: roleFilter || undefined, page, limit: 10 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, page]);

  const onCreate = async (values) => {
    try {
      await authService.register(values);
      toast.success('Staff account created');
      setCreateModalOpen(false);
      createForm.reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to create user');
    }
  };

  const openEdit = (row) => {
    setEditingUser(row);
    editForm.reset({
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone || '',
      role: row.role_name,
    });
  };

  const onSaveEdit = async (values) => {
    try {
      const updated = await usersService.update(editingUser.id, values);
      toast.success('User updated');
      setEditingUser(null);
      load();
      // If the admin just edited their own account (e.g. their own
      // name), refresh the session's user object so the navbar/sidebar
      // reflect it immediately instead of on next login.
      if (currentUser && editingUser.id === currentUser.id) {
        refreshCurrentUser();
      }
      return updated;
    } catch (err) {
      toast.error(err.message || 'Failed to update user');
    }
  };

  const toggleActive = async (row) => {
    try {
      if (row.is_active) {
        await usersService.deactivate(row.id);
        toast.success('User deactivated');
      } else {
        await usersService.activate(row.id);
        toast.success('User activated');
      }
      load();
    } catch (err) {
      toast.error(err.message || 'Action failed');
    }
  };

  const columns = [
    { key: 'name', label: 'Name', render: (r) => `${r.first_name} ${r.last_name}` },
    { key: 'email', label: 'Email' },
    { key: 'role_name', label: 'Role', render: (r) => <span className="capitalize">{r.role_name.replace('_', ' ')}</span> },
    { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
    { key: 'is_active', label: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Manage Users</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Create and manage staff accounts across every role.</p>
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
            <select className="input w-40" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
            <button className="btn-primary" onClick={() => setCreateModalOpen(true)}>
              <FiPlus /> New Staff Account
            </button>
          </>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-2">
            <button className="btn-secondary px-3 py-1.5" onClick={() => openEdit(row)}>
              <FiEdit2 /> Edit
            </button>
            <button
              className={row.is_active ? 'btn-danger px-3 py-1.5' : 'btn-secondary px-3 py-1.5'}
              onClick={() => toggleActive(row)}
              disabled={currentUser && row.id === currentUser.id}
              title={currentUser && row.id === currentUser.id ? "You can't deactivate your own account" : undefined}
            >
              {row.is_active ? <FiUserX /> : <FiUserCheck />}
              {row.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        )}
      />

      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create Staff Account">
        <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">First name *</label>
              <input className="input" {...createForm.register('firstName', { required: 'Required' })} />
              {createForm.formState.errors.firstName && <p className="error-text">{createForm.formState.errors.firstName.message}</p>}
            </div>
            <div>
              <label className="label">Last name *</label>
              <input className="input" {...createForm.register('lastName', { required: 'Required' })} />
              {createForm.formState.errors.lastName && <p className="error-text">{createForm.formState.errors.lastName.message}</p>}
            </div>
          </div>
          <div>
            <label className="label">Email *</label>
            <input type="email" className="input" {...createForm.register('email', { required: 'Required' })} />
            {createForm.formState.errors.email && <p className="error-text">{createForm.formState.errors.email.message}</p>}
          </div>
          <div>
            <label className="label">Temporary password *</label>
            <input type="password" className="input" {...createForm.register('password', { required: 'Required', minLength: { value: 8, message: 'At least 8 characters' } })} />
            {createForm.formState.errors.password && <p className="error-text">{createForm.formState.errors.password.message}</p>}
          </div>
          <div>
            <label className="label">Role *</label>
            <select className="input" {...createForm.register('role', { required: 'Required' })}>
              <option value="">Select...</option>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
            {createForm.formState.errors.role && <p className="error-text">{createForm.formState.errors.role.message}</p>}
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" {...createForm.register('phone')} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCreateModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={createForm.formState.isSubmitting} className="btn-primary">
              {createForm.formState.isSubmitting ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editingUser} onClose={() => setEditingUser(null)} title={editingUser ? `Edit ${editingUser.first_name} ${editingUser.last_name}` : 'Edit User'}>
        <form onSubmit={editForm.handleSubmit(onSaveEdit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">First name *</label>
              <input className="input" {...editForm.register('firstName', { required: 'Required' })} />
              {editForm.formState.errors.firstName && <p className="error-text">{editForm.formState.errors.firstName.message}</p>}
            </div>
            <div>
              <label className="label">Last name *</label>
              <input className="input" {...editForm.register('lastName', { required: 'Required' })} />
              {editForm.formState.errors.lastName && <p className="error-text">{editForm.formState.errors.lastName.message}</p>}
            </div>
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" {...editForm.register('phone')} />
          </div>
          <div>
            <label className="label">Role *</label>
            <select
              className="input"
              disabled={editingUser && currentUser && editingUser.id === currentUser.id}
              {...editForm.register('role', { required: 'Required' })}
            >
              {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
            {editingUser && currentUser && editingUser.id === currentUser.id && (
              <p className="mt-1 text-xs text-gray-400">You can't change your own role.</p>
            )}
            {editForm.formState.errors.role && <p className="error-text">{editForm.formState.errors.role.message}</p>}
          </div>
          {editingUser?.role_name === 'doctor' && (
            <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700 dark:bg-primary-900/20 dark:text-primary-300">
              Specialization, department, consultation fee, and other doctor-specific details are managed from the Doctors page.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setEditingUser(null)}>Cancel</button>
            <button type="submit" disabled={editForm.formState.isSubmitting} className="btn-primary">
              {editForm.formState.isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
