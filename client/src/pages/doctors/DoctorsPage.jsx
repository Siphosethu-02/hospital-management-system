// src/pages/doctors/DoctorsPage.jsx
import { useEffect, useState } from 'react';
import { FiUser } from 'react-icons/fi';
import { doctorsService } from '../../services/doctors.service';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function formatTime(t) {
  return t ? t.slice(0, 5) : t;
}

/**
 * Groups a flat list of availability windows into "Monday 08:00-12:00"
 * style lines, in Monday-first display order, active windows only
 * (an inactive window isn't really "available", so it shouldn't appear
 * on the public-facing directory - only on the admin/doctor management
 * screen where toggling it back on is the whole point).
 */
function formatSchedule(availability) {
  return DISPLAY_ORDER
    .map((day) => ({
      label: DAY_LABELS[day],
      windows: availability.filter((a) => a.day_of_week === day && a.is_active),
    }))
    .filter((d) => d.windows.length > 0);
}

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState([]);
  const [scheduleByDoctorId, setScheduleByDoctorId] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setIsLoading(true);
    const t = setTimeout(() => {
      doctorsService.list({ search: search || undefined, limit: 50 })
        .then(async (res) => {
          setDoctors(res.data);

          // One request per doctor, in parallel - the directory only
          // ever shows a modest number of doctors at once (paginated at
          // 50), so this stays fast without needing a bespoke
          // "list doctors with their schedules embedded" backend endpoint.
          const entries = await Promise.all(
            res.data.map((doc) =>
              doctorsService.availability(doc.id).then((r) => [doc.id, r.data]).catch(() => [doc.id, []])
            )
          );
          setScheduleByDoctorId(Object.fromEntries(entries));
        })
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Doctors</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Directory of specialists and their weekly availability.</p>
      </div>

      <input
        className="input max-w-sm"
        placeholder="Search by name or specialization..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <Loader />
      ) : doctors.length === 0 ? (
        <EmptyState title="No doctors found" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((doc) => {
            const schedule = formatSchedule(scheduleByDoctorId[doc.id] || []);
            return (
              <div key={doc.id} className="card p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40">
                    <FiUser className="h-5 w-5 text-primary-600 dark:text-primary-300" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Dr. {doc.first_name} {doc.last_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{doc.specialization || 'General Medicine'}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{doc.department_name || 'Unassigned department'}</p>

                <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Weekly Schedule</p>
                  {schedule.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No availability configured yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {schedule.map(({ label, windows }) => (
                        <li key={label} className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-600 dark:text-gray-300">{label}</span>
                          <span className="text-gray-500 dark:text-gray-400">
                            {windows.map((w) => `${formatTime(w.start_time)}–${formatTime(w.end_time)}`).join(', ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
