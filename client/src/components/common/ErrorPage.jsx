// src/components/common/ErrorPage.jsx
import { Link } from 'react-router-dom';
import { FiAlertTriangle } from 'react-icons/fi';

export default function ErrorPage({ code = 404, title = 'Page not found', message = "The page you're looking for doesn't exist or was moved." }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center dark:bg-gray-900">
      <FiAlertTriangle className="h-12 w-12 text-primary-500" />
      <h1 className="text-5xl font-bold text-gray-800 dark:text-gray-100">{code}</h1>
      <p className="text-lg font-medium text-gray-700 dark:text-gray-200">{title}</p>
      <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">{message}</p>
      <Link to="/" className="btn-primary mt-2">Back to safety</Link>
    </div>
  );
}
