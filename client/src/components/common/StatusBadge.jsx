// src/components/common/StatusBadge.jsx
// Generic colored badge for status enums used across appointments,
// prescriptions, lab tests, invoices, etc.

const COLOR_MAP = {
  // greens
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  dispensed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  checked_in: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  // yellows
  scheduled: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  requested: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  partially_paid: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  partially_dispensed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  sample_collected: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  unpaid: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  // reds
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  no_show: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  void: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  inactive: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export default function StatusBadge({ status }) {
  const classes = COLOR_MAP[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  const label = String(status || '').replace(/_/g, ' ');
  return <span className={`badge ${classes} capitalize`}>{label}</span>;
}
