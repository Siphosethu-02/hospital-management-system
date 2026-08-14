// src/pages/public/DepartmentsPublicPage.jsx
import { useEffect, useState } from 'react';
import { FiClipboard } from 'react-icons/fi';
import { publicService } from '../../services/public.service';
import Loader from '../../components/common/Loader';

export default function DepartmentsPublicPage() {
  const [departments, setDepartments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    publicService.departments()
      .then((res) => setDepartments(res.data))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-50">Our Departments</h1>
        <p className="mx-auto mt-4 max-w-2xl text-gray-600 dark:text-gray-300">
          Specialized care teams working together under one roof.
        </p>
      </div>

      {isLoading ? (
        <Loader />
      ) : (
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => (
            <div key={dept.id} className="card p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/40">
                <FiClipboard className="h-5 w-5 text-primary-600 dark:text-primary-300" />
              </div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">{dept.name}</h3>
              {dept.description && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{dept.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
