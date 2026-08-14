// src/utils/pdf.js
// Small PDFKit helpers shared by invoice and report PDF generation.

const PDFDocument = require('pdfkit');

/**
 * Streams a simple, professional invoice PDF directly to the HTTP
 * response. Kept intentionally plain (no external assets) so it renders
 * identically wherever the app is deployed.
 */
function streamInvoicePdf(res, invoice) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).text('Hospital Management System', { align: 'left' });
  doc.fontSize(10).fillColor('#555').text('Invoice', { align: 'left' });
  doc.moveDown(1.5);

  doc.fillColor('#000').fontSize(14).text(`Invoice ${invoice.invoice_number}`);
  doc.fontSize(10).fillColor('#555')
    .text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`)
    .text(`Status: ${invoice.status.toUpperCase()}`);
  if (invoice.due_date) doc.text(`Due: ${new Date(invoice.due_date).toLocaleDateString()}`);
  doc.moveDown();

  doc.fillColor('#000').fontSize(11).text('Billed to:');
  doc.fontSize(10).fillColor('#555')
    .text(`${invoice.patient_first_name} ${invoice.patient_last_name}`)
    .text(`Patient code: ${invoice.patient_code}`);
  doc.moveDown();

  // Line items table.
  const tableTop = doc.y + 10;
  const cols = { desc: 50, qty: 300, price: 370, total: 460 };

  doc.fillColor('#000').fontSize(10);
  doc.text('Description', cols.desc, tableTop);
  doc.text('Qty', cols.qty, tableTop);
  doc.text('Unit Price', cols.price, tableTop);
  doc.text('Total', cols.total, tableTop);
  doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).strokeColor('#ccc').stroke();

  let y = tableTop + 22;
  doc.fontSize(9).fillColor('#333');
  for (const item of invoice.items) {
    doc.text(item.description, cols.desc, y, { width: 240 });
    doc.text(String(item.quantity), cols.qty, y);
    doc.text(Number(item.unit_price).toFixed(2), cols.price, y);
    doc.text(Number(item.line_total).toFixed(2), cols.total, y);
    y += 18;
  }

  doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor('#ccc').stroke();
  y += 14;

  const totalsLine = (label, value, bold = false) => {
    doc.fontSize(bold ? 11 : 10).fillColor('#000');
    doc.text(label, 370, y, { width: 100, align: 'right' });
    doc.text(Number(value).toFixed(2), cols.total, y);
    y += bold ? 20 : 16;
  };

  totalsLine('Subtotal', invoice.subtotal);
  if (Number(invoice.discount) > 0) totalsLine('Discount', -invoice.discount);
  if (Number(invoice.tax) > 0) totalsLine('Tax', invoice.tax);
  totalsLine('Total', invoice.total, true);
  totalsLine('Amount Paid', invoice.amount_paid);
  totalsLine('Balance Due', invoice.total - invoice.amount_paid, true);

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#999').text('Thank you for choosing our hospital.', 50, y + 30);

  doc.end();
}

module.exports = { streamInvoicePdf };

/**
 * Streams a generic tabular report PDF (patients, doctors, appointments,
 * revenue, medicine inventory, laboratory stats - anything shaped as an
 * array of flat row objects).
 *
 * @param {import('express').Response} res
 * @param {string} title
 * @param {string[]} columns   column headers, in display order
 * @param {string[]} keys      matching object keys to pull from each row
 * @param {object[]} rows
 */
function streamTableReportPdf(res, { title, columns, keys, rows, filename }) {
  const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename || 'report'}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).fillColor('#000').text('Hospital Management System', { align: 'left' });
  doc.fontSize(13).fillColor('#555').text(title, { align: 'left' });
  doc.fontSize(9).fillColor('#999').text(`Generated: ${new Date().toLocaleString()}`);
  doc.moveDown(1);

  const startX = 50;
  const usableWidth = doc.page.width - 100;
  const colWidth = usableWidth / columns.length;
  let y = doc.y;

  doc.fontSize(9).fillColor('#000');
  columns.forEach((col, i) => doc.text(col, startX + i * colWidth, y, { width: colWidth - 5 }));
  y += 16;
  doc.moveTo(startX, y).lineTo(startX + usableWidth, y).strokeColor('#ccc').stroke();
  y += 6;

  doc.fontSize(8).fillColor('#333');
  for (const row of rows) {
    if (y > doc.page.height - 60) {
      doc.addPage({ margin: 50, size: 'A4', layout: 'landscape' });
      y = 50;
    }
    keys.forEach((key, i) => {
      const value = row[key] === null || row[key] === undefined ? '-' : String(row[key]);
      doc.text(value, startX + i * colWidth, y, { width: colWidth - 5 });
    });
    y += 16;
  }

  if (rows.length === 0) {
    doc.fontSize(9).fillColor('#999').text('No data for the selected range.', startX, y);
  }

  doc.end();
}

module.exports.streamTableReportPdf = streamTableReportPdf;
