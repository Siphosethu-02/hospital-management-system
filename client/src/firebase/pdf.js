// src/firebase/pdf.js
// Client-side PDF generation (jsPDF + jspdf-autotable), replacing the
// old server-side pdfkit rendering. There is no server in this
// architecture to render a PDF and stream it back, so the entire
// invoice/report layout is built and opened directly in the browser
// instead - this is the "redesign PDF generation to happen in the
// browser" requirement, not a partial/missing feature.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND = 'MediCare HMS';

function header(pdfDoc, title) {
  pdfDoc.setFontSize(18);
  pdfDoc.setFont(undefined, 'bold');
  pdfDoc.text(BRAND, 14, 18);
  pdfDoc.setFontSize(11);
  pdfDoc.setFont(undefined, 'normal');
  pdfDoc.text(title, 14, 26);
  pdfDoc.setDrawColor(200);
  pdfDoc.line(14, 30, 196, 30);
}

export function generateInvoicePdf(invoice) {
  const pdfDoc = new jsPDF();
  header(pdfDoc, `Invoice ${invoice.invoiceNumber}`);

  pdfDoc.setFontSize(10);
  pdfDoc.text(`Patient: ${invoice.patientName}`, 14, 40);
  pdfDoc.text(`Status: ${invoice.status}`, 14, 46);
  pdfDoc.text(`Date: ${invoice.createdAt?.toDate ? invoice.createdAt.toDate().toLocaleDateString() : ''}`, 140, 40);
  if (invoice.dueDate) pdfDoc.text(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`, 140, 46);

  autoTable(pdfDoc, {
    startY: 54,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: (invoice.items || []).map((it) => [
      it.description, String(it.quantity), `$${it.unitPrice.toFixed(2)}`, `$${it.lineTotal.toFixed(2)}`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [11, 79, 108] },
  });

  let y = pdfDoc.lastAutoTable.finalY + 10;
  const line = (label, value) => { pdfDoc.text(label, 140, y); pdfDoc.text(value, 196, y, { align: 'right' }); y += 6; };
  line('Subtotal', `$${invoice.subtotal.toFixed(2)}`);
  if (invoice.discount) line('Discount', `-$${invoice.discount.toFixed(2)}`);
  if (invoice.tax) line('Tax', `$${invoice.tax.toFixed(2)}`);
  pdfDoc.setFont(undefined, 'bold');
  line('Total', `$${invoice.total.toFixed(2)}`);
  pdfDoc.setFont(undefined, 'normal');
  line('Paid', `$${(invoice.amountPaid || 0).toFixed(2)}`);
  line('Balance', `$${(invoice.total - (invoice.amountPaid || 0)).toFixed(2)}`);

  if (invoice.payments?.length) {
    y += 6;
    pdfDoc.setFont(undefined, 'bold');
    pdfDoc.text('Payment History', 14, y);
    pdfDoc.setFont(undefined, 'normal');
    autoTable(pdfDoc, {
      startY: y + 4,
      head: [['Date', 'Method', 'Reference', 'Amount']],
      body: invoice.payments.map((p) => [
        new Date(p.paidAt).toLocaleDateString(), p.paymentMethod, p.referenceNumber || '-', `$${p.amount.toFixed(2)}`,
      ]),
      theme: 'plain',
    });
  }

  window.open(pdfDoc.output('bloburl'), '_blank');
}

/** Generic tabular report PDF (patients, appointments, revenue, etc.) - used by the Reports module. */
export function generateReportPdf(title, columns, rows, summaryLines = []) {
  const pdfDoc = new jsPDF();
  header(pdfDoc, title);

  let y = 40;
  summaryLines.forEach((line) => { pdfDoc.text(line, 14, y); y += 6; });

  autoTable(pdfDoc, {
    startY: y + 4,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => String(row[c.key] ?? ''))),
    theme: 'striped',
    headStyles: { fillColor: [11, 79, 108] },
    styles: { fontSize: 8 },
  });

  window.open(pdfDoc.output('bloburl'), '_blank');
}
