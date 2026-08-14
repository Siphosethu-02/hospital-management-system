// src/pages/public/ServicesPage.jsx
import { FiActivity, FiHeart, FiUsers, FiClipboard, FiPackage, FiDollarSign } from 'react-icons/fi';

const SERVICES = [
  { icon: FiUsers, title: 'General Consultations', text: 'Walk-in and scheduled visits with our general medicine team for everyday health concerns.' },
  { icon: FiHeart, title: 'Cardiology', text: 'Comprehensive heart health screening, diagnostics, and ongoing cardiac care.' },
  { icon: FiActivity, title: 'Laboratory Diagnostics', text: 'Fast, accurate lab testing with results delivered securely to your doctor.' },
  { icon: FiClipboard, title: 'Specialist Referrals', text: 'Seamless referrals across departments so specialists are always looped in.' },
  { icon: FiPackage, title: 'Pharmacy Services', text: 'On-site pharmacy with prescription fulfillment and medication guidance.' },
  { icon: FiDollarSign, title: 'Transparent Billing', text: 'Clear, itemized invoices and flexible payment options, including insurance.' },
];

export default function ServicesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-50">Our Services</h1>
        <p className="mx-auto mt-4 max-w-2xl text-gray-600 dark:text-gray-300">
          Comprehensive care, from your first consultation through diagnosis, treatment, and follow-up.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/40">
              <Icon className="h-5 w-5 text-primary-600 dark:text-primary-300" />
            </div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
