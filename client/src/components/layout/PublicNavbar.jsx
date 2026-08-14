// src/components/layout/PublicNavbar.jsx
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { FiHeart, FiMenu, FiX } from 'react-icons/fi';

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/services', label: 'Services' },
  { to: '/departments', label: 'Departments' },
  { to: '/doctors', label: 'Doctors' },
  { to: '/contact', label: 'Contact' },
];

export default function PublicNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600">
            <FiHeart className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-800 dark:text-gray-100">MediCare HMS</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive ? 'text-primary-600' : 'text-gray-600 hover:text-primary-600 dark:text-gray-300'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <Link to="/login" className="btn-primary">Staff Login</Link>
        </nav>

        <button className="md:hidden" onClick={() => setOpen((o) => !o)}>
          {open ? <FiX className="h-6 w-6" /> : <FiMenu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 md:hidden">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {link.label}
            </NavLink>
          ))}
          <Link to="/login" onClick={() => setOpen(false)} className="btn-primary mt-2 justify-center">
            Staff Login
          </Link>
        </nav>
      )}
    </header>
  );
}
