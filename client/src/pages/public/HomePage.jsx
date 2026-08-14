// src/pages/public/HomePage.jsx
import { Link } from 'react-router-dom';
import { FiCalendar, FiHeart, FiShield, FiUsers, FiArrowRight } from 'react-icons/fi';

const STATS = [
  { label: 'Departments', value: '8+' },
  { label: 'Specialist Doctors', value: '40+' },
  { label: 'Patients Cared For', value: '25,000+' },
  { label: 'Years of Service', value: '15+' },
];

const FEATURES = [
  { icon: FiCalendar, title: 'Easy Appointments', text: 'Book, reschedule, or cancel visits with just a few clicks — no phone tag required.' },
  { icon: FiUsers, title: 'Expert Specialists', text: 'A multidisciplinary team across cardiology, pediatrics, orthopedics, and more.' },
  { icon: FiShield, title: 'Secure Records', text: 'Your medical history, prescriptions, and lab results, protected and always accessible to your care team.' },
  { icon: FiHeart, title: 'Compassionate Care', text: 'Every interaction, from reception to recovery, centered on you.' },
];

export default function HomePage() {
  return (
    <div>
      <section className="bg-gradient-to-br from-primary-50 to-white dark:from-gray-800 dark:to-gray-900">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <span className="badge bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
              Trusted hospital care since 2011
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-gray-900 dark:text-gray-50 sm:text-5xl">
              Your health, coordinated in one place.
            </h1>
            <p className="mt-4 max-w-lg text-lg text-gray-600 dark:text-gray-300">
              From your first appointment to your recovery plan, MediCare HMS keeps every doctor,
              nurse, and department on the same page — so you don't have to repeat yourself.
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Developed by <span className="font-semibold text-primary-600">Siphosethu Dlamini</span> · siphosethuthobelani4@gmail.com · 083 613 5905
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/contact" className="btn-primary">
                Book an Appointment <FiArrowRight />
              </Link>
              <Link to="/doctors" className="btn-secondary">Meet Our Doctors</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {STATS.map((s) => (
              <div key={s.label} className="card p-6 text-center">
                <p className="text-3xl font-bold text-primary-600">{s.value}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50">Why patients choose us</h2>
          <p className="mt-3 text-gray-600 dark:text-gray-300">
            A modern hospital experience, built around clear communication and coordinated care.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/40">
                <Icon className="h-5 w-5 text-primary-600 dark:text-primary-300" />
              </div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-primary-600">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">Ready to take the next step in your care?</h2>
          <p className="mt-3 text-primary-100">Our team is ready to help you schedule a visit that fits your life.</p>
          <Link to="/contact" className="btn-secondary mt-6 inline-flex bg-white">
            Get in Touch <FiArrowRight />
          </Link>
        </div>
      </section>
    </div>
  );
}
