// src/pages/auth/SignUpPage.jsx
// Public "Create account" page. Anyone can sign up here, but ONLY as a
// patient - staff accounts (doctor, nurse, admin, ...) are still created
// by an administrator on the Users page. firestore.rules enforces this,
// so it can't be bypassed from the browser.

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiHeart, FiEye, FiEyeOff } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';

// Turns Firebase's error codes into plain messages.
function friendlyError(err) {
  switch (err?.code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'That password is too weak. Use at least 8 characters with a number and a capital letter.';
    case 'auth/network-request-failed':
      return 'No internet connection. Check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Email sign-up is turned off for this site. Please contact the hospital.';
    case 'permission-denied':
      return 'Your account could not be set up. Please try again, or contact the hospital if it keeps happening.';
    default:
      return err?.message || 'Sign-up failed. Please try again.';
  }
}

const today = new Date().toISOString().slice(0, 10);

export default function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm();

  const onSubmit = async (values) => {
    setServerError('');
    try {
      const user = await signUp({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        phone: values.phone?.trim() || null,
        dateOfBirth: values.dateOfBirth,
        gender: values.gender,
      });
      toast.success(`Welcome, ${user.first_name}! Your account is ready.`);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setServerError(friendlyError(err));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 dark:bg-gray-900">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600">
            <FiHeart className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Create your patient account</h1>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Book appointments and see your prescriptions, records and lab results online.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-6" noValidate>
          {serverError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {serverError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">First name *</label>
              <input
                className="input"
                autoComplete="given-name"
                {...register('firstName', {
                  required: 'First name is required',
                  validate: (v) => v.trim().length > 0 || 'First name is required',
                  maxLength: { value: 100, message: 'Too long' },
                })}
              />
              {errors.firstName && <p className="error-text">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className="label">Last name *</label>
              <input
                className="input"
                autoComplete="family-name"
                {...register('lastName', {
                  required: 'Last name is required',
                  validate: (v) => v.trim().length > 0 || 'Last name is required',
                  maxLength: { value: 100, message: 'Too long' },
                })}
              />
              {errors.lastName && <p className="error-text">{errors.lastName.message}</p>}
            </div>
          </div>

          <div>
            <label className="label">Email address *</label>
            <input
              type="email"
              className="input"
              autoComplete="email"
              placeholder="you@example.com"
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
              })}
            />
            {errors.email && <p className="error-text">{errors.email.message}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Date of birth *</label>
              <input
                type="date"
                className="input"
                max={today}
                {...register('dateOfBirth', {
                  required: 'Date of birth is required',
                  validate: (v) => v <= today || 'Date of birth cannot be in the future',
                })}
              />
              {errors.dateOfBirth && <p className="error-text">{errors.dateOfBirth.message}</p>}
            </div>
            <div>
              <label className="label">Gender *</label>
              <select className="input" {...register('gender', { required: 'Gender is required' })}>
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              {errors.gender && <p className="error-text">{errors.gender.message}</p>}
            </div>
          </div>

          <div>
            <label className="label">Phone number</label>
            <input
              type="tel"
              className="input"
              autoComplete="tel"
              placeholder="e.g. 071 234 5678"
              {...register('phone', {
                pattern: { value: /^[+\d\s()-]{7,20}$/, message: 'Enter a valid phone number' },
              })}
            />
            {errors.phone && <p className="error-text">{errors.phone.message}</p>}
          </div>

          <div>
            <label className="label">Password *</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input pr-10"
                autoComplete="new-password"
                placeholder="••••••••"
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'Password must be at least 8 characters' },
                  validate: {
                    number: (v) => /\d/.test(v) || 'Password must contain at least one number',
                    upper: (v) => /[A-Z]/.test(v) || 'Password must contain at least one capital letter',
                  },
                })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            {errors.password && <p className="error-text">{errors.password.message}</p>}
          </div>

          <div>
            <label className="label">Confirm password *</label>
            <input
              type={showPassword ? 'text' : 'password'}
              className="input"
              autoComplete="new-password"
              placeholder="••••••••"
              {...register('confirmPassword', {
                required: 'Please confirm your password',
                validate: (v) => v === getValues('password') || 'Passwords do not match',
              })}
            />
            {errors.confirmPassword && <p className="error-text">{errors.confirmPassword.message}</p>}
          </div>

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Hospital staff: your account is created by an administrator.
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary-600 hover:underline">Sign in</Link>
        </p>
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
          <Link to="/" className="text-primary-600 hover:underline">← Back to homepage</Link>
        </p>
      </div>
    </div>
  );
}
