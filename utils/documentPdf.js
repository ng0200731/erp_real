// Server-only pdfkit builder for trade documents. Reads the shared DOCUMENT_TYPES
// config so the PDF columns/labels always match the on-page HTML preview.
import PDFDocument from 'pdfkit';
import {
  DOCUMENT_TYPES, COLUMN_LABELS, TOTALS_LABELS,
  getDocumentType, computeTotals,
} from '../shared/documentTemplates.js';

const num = (v) => Number(v) || 0;
const money = (n) => (Number(n) || 0).toFixed(2);

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Give the description column the leftover width; numeric columns get a fixed share.
function colWidthsFor(cols, total) {
  const fixed = 58;
  const descIdx = cols.indexOf('description');
  const widths = cols.map(() => fixed);
  if (descIdx >= 0) {
    const others = fixed * (cols.length - 1);
    widths[descIdx] = Math.max(80, total - others);
  }
  // normalize to total width (trim/pad last column)
  const sum = widths.reduce((s, w) => s + w, 0);
  if (sum !== total && descIdx >= 0) widths[descIdx] += total - sum;
  return widths;
}

function drawDocument(doc, type, data) {
  const cfg = DOCUMENT_TYPES[type];
  const d = data || {};
  const seller = d.seller || {};
  const buyer = d.buyer || {};
  const meta = d.meta || {};
  const items = Array.isArray(d.items) ? d.items : [];
  const notes = d.notes || '';
  const totals = computeTotals(type, d);
  const currency = meta.currency || '';

  const LEFT = 50;
  const RIGHT = 545;
  const WIDTH = RIGHT - LEFT;
  let y = 50;

  // ---- Header ----
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a1a1a').text(cfg.title, LEFT, y, { width: WIDTH, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#888').text(cfg.label, LEFT, y + 22, { width: WIDTH, align: 'right' });
  doc.moveTo(LEFT, y + 42).lineTo(RIGHT, y + 42).strokeColor('#000').lineWidth(2).stroke();
  doc.lineWidth(1);
  y += 58;

  // ---- Parties ----
  const half = WIDTH / 2;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text(cfg.sellerLabel, LEFT, y);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text(cfg.buyerLabel, LEFT + half, y);
  y += 14;
  const sellerLines = [seller.name, seller.address, seller.phone, seller.email].filter((v) => v != null && v !== '');
  const buyerLines = [buyer.name, buyer.address, buyer.phone, buyer.email].filter((v) => v != null && v !== '');
  doc.font('Helvetica').fontSize(9).fillColor('#444');
  const rows = Math.max(sellerLines.length, buyerLines.length);
  for (let i = 0; i < rows; i++) {
    if (sellerLines[i]) doc.text(String(sellerLines[i]), LEFT, y + i * 12, { width: half - 10 });
    if (buyerLines[i]) doc.text(String(buyerLines[i]), LEFT + half, y + i * 12, { width: half - 10 });
  }
  y += rows * 12 + 10;

  // ---- Meta ----
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#666');
  for (const f of cfg.metaFields) {
    const val = meta[f.key] != null && meta[f.key] !== '' ? String(meta[f.key]) : '—';
    doc.font('Helvetica-Bold').text(`${f.label}:`, LEFT, y, { width: 130 });
    doc.font('Helvetica').text(val, LEFT + 130, y, { width: half - 130 });
    y += 13;
  }
  y += 4;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#ddd').stroke();
  y += 8;

  // ---- Items table ----
  const cols = cfg.itemColumns;
  const widths = colWidthsFor(cols, WIDTH);
  // header row
  doc.rect(LEFT, y, WIDTH, 16).fill('#f0f0f0');
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#333');
  let x = LEFT;
  cols.forEach((c, i) => {
    doc.text(COLUMN_LABELS[c] || c, x + 3, y + 4, { width: widths[i] - 6 });
    x += widths[i];
  });
  y += 16;
  doc.fillColor('#444');

  const numericCols = new Set(['qty', 'unitPrice', 'amount', 'netWeight', 'grossWeight', 'cartons']);
  items.forEach((it, idx) => {
    if (y > 760) { doc.addPage(); y = 50; }
    let x2 = LEFT;
    cols.forEach((c, i) => {
      let v;
      if (c === 'no') v = it.no != null ? it.no : idx + 1;
      else if (c === 'amount') v = `${money(num(it.qty) * num(it.unitPrice))}${currency ? ' ' + currency : ''}`;
      else if (c === 'unitPrice') v = `${money(it.unitPrice)}${currency ? ' ' + currency : ''}`;
      else if (c === 'netWeight' || c === 'grossWeight') v = money(it[c]);
      else v = it[c] != null ? it[c] : '';
      doc.font('Helvetica').text(String(v), x2 + 3, y + 3, {
        width: widths[i] - 6,
        align: numericCols.has(c) ? 'right' : 'left',
      });
      x2 += widths[i];
    });
    y += 14;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#eee').stroke();
  });
  if (!items.length) {
    doc.font('Helvetica').fontSize(9).fillColor('#aaa').text('No items', LEFT, y + 4);
    y += 16;
  }
  y += 8;

  // ---- Totals ----
  if (cfg.totals && cfg.totals.length) {
    doc.font('Helvetica').fontSize(9).fillColor('#333');
    for (const t of cfg.totals) {
      const isMoney = t === 'subtotal' || t === 'tax' || t === 'total';
      const raw = totals[t];
      const val = isMoney ? `${money(raw)}${currency ? ' ' + currency : ''}` : String(raw != null ? raw : '—');
      doc.font('Helvetica').text(TOTALS_LABELS[t] || t, LEFT + half, y, { width: half - 130, align: 'right' });
      doc.font(t === 'total' ? 'Helvetica-Bold' : 'Helvetica').text(val, RIGHT - 120, y, { width: 120, align: 'right' });
      y += 14;
    }
  }

  // ---- Footer ----
  if (cfg.footerOrigin) {
    doc.font('Helvetica').fontSize(9).fillColor('#333').text(`Country of Origin: ${meta.countryOfOrigin || '—'}`, LEFT, 748);
  }
  doc.font('Helvetica').fontSize(8).fillColor('#999').text(`Generated: ${new Date().toISOString()}`, LEFT, 762);
}

export async function buildDocumentPdf(type, data) {
  const cfg = getDocumentType(type);
  if (!cfg) throw new Error(`Unknown document type: ${type}`);
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  drawDocument(doc, type, data);
  const done = collectStream(doc);
  doc.end();
  return done;
}
