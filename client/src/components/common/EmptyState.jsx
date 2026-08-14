// src/components/common/EmptyState.jsx
import { FiInbox } from 'react-icons/fi';

export default function EmptyState({ title = 'Nothing here yet', message, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <FiInbox className="mb-2 h-10 w-10 text-gray-300 dark:text-gray-600" />
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
      {message && <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
