// src/pages/public/DoctorsPublicPage.jsx
import { useEffect, useState } from 'react';
import { FiUser } from 'react-icons/fi';
import { publicService } from '../../services/public.service';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';

export default function DoctorsPublicPage() {
  const [doctors, setDoctors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setIsLoading(true);
    const timeout = setTimeout(() => {
      publicService.doctors({ search: search || undefined })
        .then((res) => setDoctors(res.data))
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-50">Meet Our Doctors</h1>
        <p className="mx-auto mt-4 max-w-2xl text-gray-600 dark:text-gray-300">
          A multidisciplinary team of specialists dedicated to your care.
        </p>
        <input
          className="input mx-auto mt-6 max-w-sm"
          placeholder="Search by name or specialization..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Loader />
      ) : doctors.length === 0 ? (
        <EmptyState title="No doctors found" message="Try a different search term." />
      ) : (
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((doc) => (
            <div key={doc.id} className="card p-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40">
                <FiUser className="h-7 w-7 text-primary-600 dark:text-primary-300" />
              </div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">Dr. {doc.firstName} {doc.lastName}</h3>
              <p className="text-sm text-primary-600 dark:text-primary-400">{doc.specialization || 'General Medicine'}</p>
              {doc.departmentName && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{doc.departmentName}</p>}
              {doc.yearsOfExperience != null && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{doc.yearsOfExperience} years of experience</p>
              )}
              {doc.bio && <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{doc.bio}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
