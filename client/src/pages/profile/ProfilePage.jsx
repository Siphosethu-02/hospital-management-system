// src/pages/profile/ProfilePage.jsx
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiSave, FiLock } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { usersService } from '../../services/users.service';
import { authService } from '../../services/auth.service';
import { ROLE_LABELS } from '../../routes/roleNav';

export default function ProfilePage() {
  const { user, refreshCurrentUser } = useAuth();
  const role = user?.role_name || user?.role;

  const profileForm = useForm({
    defaultValues: { firstName: user?.first_name, lastName: user?.last_name, phone: user?.phone || '' },
  });
  const passwordForm = useForm();

  const onSaveProfile = async (values) => {
    try {
      await usersService.updateOwnProfile(values);
      await refreshCurrentUser();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update profile');
    }
  };

  const onChangePassword = async (values) => {
    if (values.newPassword !== values.confirmPassword) {
      passwordForm.setError('confirmPassword', { message: 'Passwords do not match' });
      return;
    }
    try {
      await authService.changePassword(values);
      toast.success('Password changed successfully');
      passwordForm.reset();
    } catch (err) {
      toast.error(err.message || 'Failed to change password');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">My Profile</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{ROLE_LABELS[role] || role} &middot; {user?.email}</p>
      </div>

      <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="card space-y-4 p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Basic Information</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">First name</label>
            <input className="input" {...profileForm.register('firstName')} />
          </div>
          <div>
            <label className="label">Last name</label>
            <input className="input" {...profileForm.register('lastName')} />
          </div>
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" {...profileForm.register('phone')} />
        </div>
        <button type="submit" className="btn-primary">
          <FiSave /> Save Changes
        </button>
      </form>

      <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="card space-y-4 p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Change Password</h3>
        <div>
          <label className="label">Current password</label>
          <input type="password" className="input" {...passwordForm.register('currentPassword', { required: 'Required' })} />
        </div>
        <div>
          <label className="label">New password</label>
          <input type="password" className="input" {...passwordForm.register('newPassword', { required: 'Required', minLength: { value: 8, message: 'At least 8 characters' } })} />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input type="password" className="input" {...passwordForm.register('confirmPassword', { required: 'Required' })} />
          {passwordForm.formState.errors.confirmPassword && (
            <p className="error-text">{passwordForm.formState.errors.confirmPassword.message}</p>
          )}
        </div>
        <button type="submit" className="btn-primary">
          <FiLock /> Change Password
        </button>
      </form>
    </div>
  );
}
