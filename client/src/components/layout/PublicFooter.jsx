// src/components/layout/PublicFooter.jsx
import { Link } from 'react-router-dom';
import { FiHeart, FiMapPin, FiPhone, FiMail } from 'react-icons/fi';

export default function PublicFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <FiHeart className="h-5 w-5 text-primary-600" />
              <span className="text-lg font-bold text-gray-800 dark:text-gray-100">MediCare HMS</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Compassionate, modern care — built on a platform that keeps every department connected.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">Quick Links</h4>
            <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li><Link to="/about" className="hover:text-primary-600">About Us</Link></li>
              <li><Link to="/services" className="hover:text-primary-600">Services</Link></li>
              <li><Link to="/departments" className="hover:text-primary-600">Departments</Link></li>
              <li><Link to="/doctors" className="hover:text-primary-600">Our Doctors</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">For Patients</h4>
            <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li><Link to="/contact" className="hover:text-primary-600">Book an Appointment</Link></li>
              <li><Link to="/contact" className="hover:text-primary-600">Contact Us</Link></li>
              <li><Link to="/login" className="hover:text-primary-600">Staff Login</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">Contact</h4>
            <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li className="flex items-center gap-2"><FiMapPin className="h-4 w-4" /> 123 Wellness Ave, Health City</li>
              <li className="flex items-center gap-2"><FiPhone className="h-4 w-4" /> 083 613 5905</li>
              <li className="flex items-center gap-2"><FiMail className="h-4 w-4" /> siphosethuthobelani4@gmail.com</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-gray-200 pt-6 text-center text-xs text-gray-400 dark:border-gray-800">
          &copy; {new Date().getFullYear()} MediCare HMS. Developed by Siphosethu Dlamini.
        </div>
      </div>
    </footer>
  );
}
