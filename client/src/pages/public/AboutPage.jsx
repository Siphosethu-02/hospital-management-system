// src/pages/public/AboutPage.jsx
import { FiTarget, FiEye, FiHeart } from 'react-icons/fi';

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-50">About MediCare HMS</h1>
        <p className="mx-auto mt-4 max-w-2xl text-gray-600 dark:text-gray-300">
          For over fifteen years, we've combined clinical excellence with genuine compassion —
          and more recently, with a platform that keeps every part of your care team connected.
        </p>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="card p-6 text-center">
          <FiTarget className="mx-auto mb-3 h-8 w-8 text-primary-600" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Our Mission</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Deliver accessible, coordinated, and high-quality care to every patient who walks through our doors.
          </p>
        </div>
        <div className="card p-6 text-center">
          <FiEye className="mx-auto mb-3 h-8 w-8 text-primary-600" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Our Vision</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            To be the region's most trusted hospital, known for both clinical outcomes and patient experience.
          </p>
        </div>
        <div className="card p-6 text-center">
          <FiHeart className="mx-auto mb-3 h-8 w-8 text-primary-600" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Our Values</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Compassion, integrity, and collaboration — across every department, every shift.
          </p>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">A hospital built around coordination</h2>
          <p className="mt-4 text-gray-600 dark:text-gray-300">
            Behind the scenes, our doctors, nurses, receptionists, pharmacists, and lab staff all work from
            the same real-time system — so your prescription, your lab results, and your doctor's notes are
            never more than a few clicks away from the person who needs them.
          </p>
          <p className="mt-4 text-gray-600 dark:text-gray-300">
            That coordination is what lets us focus on what matters most: you.
          </p>
        </div>
        <div className="card flex h-64 items-center justify-center bg-primary-50 dark:bg-primary-900/20">
          <FiHeart className="h-20 w-20 text-primary-300 dark:text-primary-700" />
        </div>
      </div>
    </div>
  );
}
