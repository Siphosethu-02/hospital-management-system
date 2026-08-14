// src/pages/pharmacy/PharmacyPage.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FiPlus, FiAlertTriangle, FiPackage } from 'react-icons/fi';
import { pharmacyService } from '../../services/pharmacy.service';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';

export default function PharmacyPage() {
  const { user } = useAuth();
  const role = user?.role_name || user?.role;
  const canManage = role === 'admin' || role === 'pharmacist';

  const [tab, setTab] = useState('medicines');
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [stockModal, setStockModal] = useState(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  const stockForm = useForm();

  const load = () => {
    setIsLoading(true);
    pharmacyService.listMedicines({ search: search || undefined, page, limit: 10 })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  useEffect(() => {
    pharmacyService.listCategories().then((res) => setCategories(res.data));
    pharmacyService.lowStockAlerts().then((res) => setLowStock(res.data));
    pharmacyService.expiringAlerts(30).then((res) => setExpiring(res.data));
  }, []);

  const onCreateMedicine = async (values) => {
    try {
      await pharmacyService.createMedicine({ ...values, categoryId: values.categoryId || null });
      toast.success('Medicine added');
      setModalOpen(false);
      reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to add medicine');
    }
  };

  const onReceiveStock = async (values) => {
    try {
      await pharmacyService.receiveStock(stockModal.id, {
        batchNumber: values.batchNumber,
        quantity: Number(values.quantity),
        expiryDate: values.expiryDate,
        supplier: values.supplier || null,
      });
      toast.success('Stock received');
      setStockModal(null);
      stockForm.reset();
      load();
      pharmacyService.lowStockAlerts().then((res) => setLowStock(res.data));
    } catch (err) {
      toast.error(err.message || 'Failed to receive stock');
    }
  };

  const columns = [
    { key: 'name', label: 'Medicine' },
    { key: 'category_name', label: 'Category', render: (r) => r.category_name || '—' },
    { key: 'unit', label: 'Unit' },
    { key: 'current_stock', label: 'Stock', render: (r) => (
      <span className={Number(r.current_stock) <= r.reorder_level ? 'font-semibold text-red-600' : ''}>
        {r.current_stock}
      </span>
    ) },
    { key: 'unit_price', label: 'Price', render: (r) => `$${Number(r.unit_price).toFixed(2)}` },
    { key: 'is_active', label: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Pharmacy</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Medicine inventory, stock, and alerts.</p>
      </div>

      {(lowStock.length > 0 || expiring.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {lowStock.length > 0 && (
            <div className="card flex items-start gap-3 border-l-4 border-red-500 p-4">
              <FiAlertTriangle className="mt-0.5 h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{lowStock.length} medicines low on stock</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{lowStock.slice(0, 3).map((m) => m.name).join(', ')}{lowStock.length > 3 ? '...' : ''}</p>
              </div>
            </div>
          )}
          {expiring.length > 0 && (
            <div className="card flex items-start gap-3 border-l-4 border-amber-500 p-4">
              <FiAlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{expiring.length} batches expiring within 30 days</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{expiring.slice(0, 3).map((m) => m.medicine_name).join(', ')}{expiring.length > 3 ? '...' : ''}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        meta={meta}
        onPageChange={setPage}
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        actions={canManage && (
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            <FiPlus /> New Medicine
          </button>
        )}
        rowActions={(row) => canManage && (
          <button className="btn-secondary px-3 py-1.5" onClick={() => setStockModal(row)}>
            <FiPackage /> Receive Stock
          </button>
        )}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Medicine">
        <form onSubmit={handleSubmit(onCreateMedicine)} className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" {...register('name', { required: 'Required' })} />
            {errors.name && <p className="error-text">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" {...register('categoryId')}>
              <option value="">Uncategorized</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Unit</label>
              <input className="input" placeholder="tablet" {...register('unit')} />
            </div>
            <div>
              <label className="label">Unit price *</label>
              <input type="number" step="0.01" className="input" {...register('unitPrice', { required: 'Required' })} />
            </div>
          </div>
          <div>
            <label className="label">Reorder level</label>
            <input type="number" className="input" defaultValue={20} {...register('reorderLevel')} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving...' : 'Add Medicine'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!stockModal} onClose={() => setStockModal(null)} title={`Receive Stock — ${stockModal?.name || ''}`}>
        <form onSubmit={stockForm.handleSubmit(onReceiveStock)} className="space-y-4">
          <div>
            <label className="label">Quantity *</label>
            <input type="number" min="1" className="input" {...stockForm.register('quantity', { required: 'Required' })} />
          </div>
          <div>
            <label className="label">Expiry date *</label>
            <input type="date" className="input" {...stockForm.register('expiryDate', { required: 'Required' })} />
          </div>
          <div>
            <label className="label">Batch number</label>
            <input className="input" {...stockForm.register('batchNumber')} />
          </div>
          <div>
            <label className="label">Supplier</label>
            <input className="input" {...stockForm.register('supplier')} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStockModal(null)}>Cancel</button>
            <button type="submit" className="btn-primary">Receive Stock</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
