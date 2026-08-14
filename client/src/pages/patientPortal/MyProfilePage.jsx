// src/pages/patientPortal/MyProfilePage.jsx
// Identity fields (name, date of birth, blood group) and clinical
// fields (allergies, chronic conditions, insurance) are shown read-only
// with a note that reception/admin manages them - only contact-type
// fields are actually editable here, matching what the backend's
// PATCH /patient/profile allowlist accepts.
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiSave, FiLock, FiInfo } from 'react-icons/fi';
import { patientPortalService } from '../../services/patientPortal.service';
import { authService } from '../../services/auth.service';
import Loader from '../../components/common/Loader';

export default function MyProfilePage() {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const profileForm = useForm();
  const passwordForm = useForm();

  useEffect(() => {
    patientPortalService.getProfile().then((res) => {
      setProfile(res.data);
      profileForm.reset({
        phone: res.data.phone || '',
        email: res.data.email || '',
        address: res.data.address || '',
        city: res.data.city || '',
        emergencyContactName: res.data.emergency_contact_name || '',
        emergencyContactPhone: res.data.emergency_contact_phone || '',
        emergencyContactRelation: res.data.emergency_contact_relation || '',
      });
    }).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSaveProfile = async (values) => {
    try {
      const res = await patientPortalService.updateProfile(values);
      setProfile(res.data);
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

  if (isLoading) return <Loader />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">My Profile</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{profile?.patient_code}</p>
      </div>

      {/* Read-only identity summary */}
      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Patient Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-gray-400">Full Name</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{profile?.first_name} {profile?.last_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Patient Number</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{profile?.patient_code}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Date of Birth</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{profile?.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Gender</p>
            <p className="font-medium capitalize text-gray-700 dark:text-gray-200">{profile?.gender}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Blood Group</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{profile?.blood_group}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Allergies</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{profile?.allergies || 'None recorded'}</p>
          </div>
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs text-gray-400">
          <FiInfo className="h-3.5 w-3.5 flex-shrink-0" />
          Name, date of birth, and clinical details are managed by hospital staff. Contact reception to update these.
        </p>
      </div>

      {/* Editable contact info */}
      <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="card space-y-4 p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Contact Details</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Phone</label>
            <input className="input" {...profileForm.register('phone')} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" {...profileForm.register('email')} />
          </div>
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" {...profileForm.register('address')} />
        </div>
        <div>
          <label className="label">City</label>
          <input className="input" {...profileForm.register('city')} />
        </div>

        <h3 className="pt-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Emergency Contact</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input className="input" placeholder="Name" {...profileForm.register('emergencyContactName')} />
          <input className="input" placeholder="Phone" {...profileForm.register('emergencyContactPhone')} />
          <input className="input" placeholder="Relation" {...profileForm.register('emergencyContactRelation')} />
        </div>

        <button type="submit" disabled={profileForm.formState.isSubmitting} className="btn-primary">
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
