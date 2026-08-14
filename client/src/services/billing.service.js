// src/services/billing.service.js
import {
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc,
  increment, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { paginateClientSide, withLegacyAliases } from '../firebase/firestoreUtils';
import { generateInvoicePdf } from '../firebase/pdf';

async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const counterRef = doc(db, 'counters', `invoices-${year}`);
  const counterSnap = await getDoc(counterRef);
  const next = (counterSnap.exists() ? counterSnap.data().value : 0) + 1;
  await updateDoc(counterRef, { value: next }).catch(async () => {
    // Counter doc doesn't exist yet.
    const { setDoc } = await import('firebase/firestore');
    await setDoc(counterRef, { value: next });
  });
  return `INV-${year}-${String(next).padStart(6, '0')}`;
}

export const billingService = {
  list: async ({ search, status, page = 1, limit = 10 } = {}) => {
    let q = collection(db, 'invoices');
    if (status) q = query(q, where('status', '==', status));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => {
      const data = d.data();
      const [firstName, ...rest] = (data.patientName || '').split(' ');
      return { id: d.id, ...data, patient_first_name: firstName, patient_last_name: rest.join(' '), invoice_number: data.invoiceNumber };
    });
    return paginateClientSide(rows, { page, limit, search, searchFields: ['invoiceNumber', 'patientName'], sortBy: 'createdAt', order: 'DESC' });
  },

  get: async (id) => {
    const snap = await getDoc(doc(db, 'invoices', id));
    if (!snap.exists()) throw new Error('Invoice not found.');
    return { data: withLegacyAliases({ id, ...snap.data() }) };
  },

  create: async ({ patientId, appointmentId, items, discount = 0, tax = 0, dueDate }) => {
    const patientSnap = await getDoc(doc(db, 'patients', patientId));
    if (!patientSnap.exists()) throw new Error('patientId does not match an existing patient.');
    const patient = patientSnap.data();

    const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const total = subtotal - discount + tax;
    const invoiceNumber = await generateInvoiceNumber();

    const ref = await addDoc(collection(db, 'invoices'), {
      invoiceNumber, patientId, patientName: `${patient.firstName} ${patient.lastName}`,
      appointmentId: appointmentId || null,
      subtotal, discount, tax, total, amountPaid: 0, status: 'unpaid', dueDate: dueDate || null,
      createdBy: auth.currentUser?.uid || null,
      items: items.map((it) => ({ ...it, lineTotal: it.quantity * it.unitPrice })),
      payments: [],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    return billingService.get(ref.id);
  },

  recordPayment: async (id, { amount, paymentMethod, referenceNumber }) => {
    const snap = await getDoc(doc(db, 'invoices', id));
    if (!snap.exists()) throw new Error('Invoice not found.');
    const invoice = snap.data();
    if (invoice.status === 'void') throw new Error('This invoice has been voided.');

    const payments = [...(invoice.payments || []), {
      amount, paymentMethod, referenceNumber: referenceNumber || null,
      receivedBy: auth.currentUser?.uid || null, paidAt: new Date().toISOString(),
    }];
    const newAmountPaid = (invoice.amountPaid || 0) + amount;
    const status = newAmountPaid >= invoice.total ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';

    await updateDoc(doc(db, 'invoices', id), {
      payments, amountPaid: increment(amount), status, updatedAt: serverTimestamp(),
    });
    return billingService.get(id);
  },

  void: async (id) => {
    await updateDoc(doc(db, 'invoices', id), { status: 'void', updatedAt: serverTimestamp() });
    return billingService.get(id);
  },

  // Replaces the old server-rendered PDF endpoint - generates and
  // opens the invoice as a PDF entirely in the browser (jsPDF), since
  // there is no server to render one. See README's PDF/reports section.
  downloadInvoicePdf: async (id) => {
    const { data: invoice } = await billingService.get(id);
    generateInvoicePdf(invoice);
  },
};
