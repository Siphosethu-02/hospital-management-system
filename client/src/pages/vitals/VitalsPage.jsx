// src/pages/vitals/VitalsPage.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiSave } from 'react-icons/fi';
import { patientsService } from '../../services/patients.service';
import { vitalsService } from '../../services/medicalRecords.service';
import Loader from '../../components/common/Loader';

export default function VitalsPage() {
  const [patientOptions, setPatientOptions] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  useEffect(() => {
    patientsService.list({ limit: 100 }).then((res) => setPatientOptions(res.data));
  }, []);

  useEffect(() => {
    if (!selectedPatientId) { setHistory([]); return; }
    setIsLoading(true);
    vitalsService.listByPatient(selectedPatientId, { limit: 10 })
      .then((res) => setHistory(res.data))
      .finally(() => setIsLoading(false));
  }, [selectedPatientId]);

  const onSubmit = async (values) => {
    if (!selectedPatientId) {
      toast.error('Select a patient first');
      return;
    }
    try {
      const vitals = { patientId: selectedPatientId };
      if (values.temperatureCelsius) vitals.temperatureCelsius = Number(values.temperatureCelsius);
      if (values.heartRateBpm) vitals.heartRateBpm = Number(values.heartRateBpm);
      if (values.bloodPressureSystolic) vitals.bloodPressureSystolic = Number(values.bloodPressureSystolic);
      if (values.bloodPressureDiastolic) vitals.bloodPressureDiastolic = Number(values.bloodPressureDiastolic);
      if (values.respiratoryRate) vitals.respiratoryRate = Number(values.respiratoryRate);
      if (values.oxygenSaturation) vitals.oxygenSaturation = Number(values.oxygenSaturation);
      if (values.weightKg) vitals.weightKg = Number(values.weightKg);
      if (values.heightCm) vitals.heightCm = Number(values.heightCm);
      vitals.notes = values.notes || null;
      await vitalsService.record(vitals);
      toast.success('Vitals recorded');
      reset();
      const res = await vitalsService.listByPatient(selectedPatientId, { limit: 10 });
      setHistory(res.data);
    } catch (err) {
      toast.error(err.message || 'Failed to record vitals');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Record Vitals</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Log a patient's temperature, heart rate, blood pressure, and more.</p>
      </div>

      <div className="card p-5">
        <label className="label">Patient</label>
        <select className="input max-w-sm" value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)}>
          <option value="">Select patient...</option>
          {patientOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.patient_code})</option>
          ))}
        </select>
      </div>

      {selectedPatientId && (
        <>
          <form onSubmit={handleSubmit(onSubmit)} className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <label className="label">Temp (°C)</label>
              <input type="number" step="0.1" className="input" {...register('temperatureCelsius')} />
            </div>
            <div>
              <label className="label">Heart rate (bpm)</label>
              <input type="number" className="input" {...register('heartRateBpm')} />
            </div>
            <div>
              <label className="label">BP Systolic</label>
              <input type="number" className="input" {...register('bloodPressureSystolic')} />
            </div>
            <div>
              <label className="label">BP Diastolic</label>
              <input type="number" className="input" {...register('bloodPressureDiastolic')} />
            </div>
            <div>
              <label className="label">Respiratory rate</label>
              <input type="number" className="input" {...register('respiratoryRate')} />
            </div>
            <div>
              <label className="label">SpO2 (%)</label>
              <input type="number" step="0.1" className="input" {...register('oxygenSaturation')} />
            </div>
            <div>
              <label className="label">Weight (kg)</label>
              <input type="number" step="0.1" className="input" {...register('weightKg')} />
            </div>
            <div>
              <label className="label">Height (cm)</label>
              <input type="number" step="0.1" className="input" {...register('heightCm')} />
            </div>
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <label className="label">Notes</label>
              <textarea rows={2} className="input" {...register('notes')} />
            </div>
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                <FiSave /> {isSubmitting ? 'Saving...' : 'Save Vitals'}
              </button>
            </div>
          </form>

          <div className="card overflow-x-auto">
            <h3 className="p-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Recent History</h3>
            {isLoading ? <Loader /> : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    {['Date', 'Temp', 'HR', 'BP', 'SpO2', 'Weight'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {history.map((v) => (
                    <tr key={v.id}>
                      <td className="px-4 py-2 text-sm">{new Date(v.recorded_at).toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm">{v.temperature_celsius ?? '—'}</td>
                      <td className="px-4 py-2 text-sm">{v.heart_rate_bpm ?? '—'}</td>
                      <td className="px-4 py-2 text-sm">{v.blood_pressure_systolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}` : '—'}</td>
                      <td className="px-4 py-2 text-sm">{v.oxygen_saturation ?? '—'}</td>
                      <td className="px-4 py-2 text-sm">{v.weight_kg ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
