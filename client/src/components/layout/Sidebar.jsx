// src/components/layout/Sidebar.jsx
import { NavLink } from 'react-router-dom';
import { FiHeart } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { NAV_BY_ROLE } from '../../routes/roleNav';

export default function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth();
  const links = (user && NAV_BY_ROLE[user.role_name || user.role]) || [];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-white transition-transform dark:bg-gray-800
                    lg:static lg:translate-x-0 lg:border-r lg:border-gray-200 lg:dark:border-gray-700
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-5 dark:border-gray-700">
          <FiHeart className="h-6 w-6 text-primary-600" />
          <span className="text-lg font-bold text-gray-800 dark:text-gray-100">MediCare HMS</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
                 ${isActive
                   ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                   : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
