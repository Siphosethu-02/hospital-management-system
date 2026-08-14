// src/pages/public/ContactPage.jsx
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiMapPin, FiPhone, FiMail, FiClock } from 'react-icons/fi';

export default function ContactPage() {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async () => {
    // This is a static portfolio site - there's no ticketing backend yet,
    // so we simulate a submission. Wiring this to a real endpoint (e.g.
    // POST /public/contact) would be a natural next step.
    await new Promise((resolve) => setTimeout(resolve, 600));
    toast.success("Thanks for reaching out! We'll get back to you soon.");
    reset();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-50">Get in Touch</h1>
        <p className="mx-auto mt-4 max-w-2xl text-gray-600 dark:text-gray-300">
          Have a question or want to book an appointment? Send us a message.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="flex items-start gap-3">
            <FiMapPin className="mt-1 h-5 w-5 text-primary-600" />
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-100">Address</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">123 Wellness Ave, Health City</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FiPhone className="mt-1 h-5 w-5 text-primary-600" />
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-100">Phone</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">083 613 5905</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FiMail className="mt-1 h-5 w-5 text-primary-600" />
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-100">Email</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">siphosethuthobelani4@gmail.com</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FiClock className="mt-1 h-5 w-5 text-primary-600" />
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-100">Hours</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Emergency: 24/7 &middot; Outpatient: Mon-Sat, 8am-6pm</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-6 lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Full name</label>
              <input className="input" {...register('name', { required: 'Name is required' })} />
              {errors.name && <p className="error-text">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" {...register('email', { required: 'Email is required' })} />
              {errors.email && <p className="error-text">{errors.email.message}</p>}
            </div>
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input" {...register('subject', { required: 'Subject is required' })} />
            {errors.subject && <p className="error-text">{errors.subject.message}</p>}
          </div>
          <div>
            <label className="label">Message</label>
            <textarea rows={5} className="input" {...register('message', { required: 'Message is required' })} />
            {errors.message && <p className="error-text">{errors.message.message}</p>}
          </div>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </div>
    </div>
  );
}
