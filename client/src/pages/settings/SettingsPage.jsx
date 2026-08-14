// src/pages/settings/SettingsPage.jsx
// A lightweight system-settings landing page. Most "settings" in this
// app are really just the Users/Departments/Pharmacy-categories screens
// (already dedicated pages) - this page centralizes the rest: theme and
// a summary of what's configurable where, so admins have one place to
// start from.

import { Link } from 'react-router-dom';
import { FiUsers, FiClipboard, FiPackage, FiMoon, FiSun } from 'react-icons/fi';
import { useTheme } from '../../context/ThemeContext';

const SHORTCUTS = [
  { to: '/app/users', label: 'Manage Users & Roles', icon: FiUsers },
  { to: '/app/departments', label: 'Manage Departments', icon: FiClipboard },
  { to: '/app/pharmacy', label: 'Medicine Categories', icon: FiPackage },
];

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">System Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Appearance and quick links to system configuration.</p>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Appearance</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Dark mode</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Applies across the whole app for your account, on this device.</p>
          </div>
          <button onClick={toggleTheme} className="btn-secondary">
            {theme === 'dark' ? <><FiSun /> Switch to Light</> : <><FiMoon /> Switch to Dark</>}
          </button>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Configuration</h3>
        <div className="space-y-2">
          {SHORTCUTS.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <Icon className="h-4 w-4 text-primary-600" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
