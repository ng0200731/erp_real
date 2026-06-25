// Shared trade-document templates. Pure ES module: no window/document/fetch.
// Imported by the Node server (utils/documentPdf.js) and loaded by the browser
// (public/index.html) for the live preview. Keep it side-effect free.

export const COLUMN_LABELS = {
  no: '#',
  description: 'Description',
  qty: 'Qty',
  unit: 'Unit',
  unitPrice: 'Unit Price',
  amount: 'Amount',
  netWeight: 'N.W. (kg)',
  grossWeight: 'G.W. (kg)',
  cartons: 'Cartons',
  hsCode: 'HS Code',
};

export const TOTALS_LABELS = {
  subtotal: 'Subtotal',
  tax: 'Tax',
  total: 'Total',
  totalQty: 'Total Qty',
  totalNetWeight: 'Total N.W. (kg)',
  totalGrossWeight: 'Total G.W. (kg)',
  totalCartons: 'Total Cartons',
};

export const DOCUMENT_TYPES = {
  PI: {
    key: 'PI',
    label: 'Proforma Invoice',
    title: 'PROFORMA INVOICE',
    sellerLabel: 'Seller',
    buyerLabel: 'Buyer',
    showPrices: true,
    metaFields: [
      { key: 'docNumber', label: 'PI No.' },
      { key: 'issueDate', label: 'Issue Date' },
      { key: 'dueDate', label: 'Valid Until' },
      { key: 'currency', label: 'Currency' },
      { key: 'paymentTerms', label: 'Payment Terms' },
      { key: 'incoterms', label: 'Incoterms' },
    ],
    itemColumns: ['no', 'description', 'qty', 'unit', 'unitPrice', 'amount'],
    totals: ['subtotal', 'tax', 'total'],
  },
  PO: {
    key: 'PO',
    label: 'Purchase Order',
    title: 'PURCHASE ORDER',
    sellerLabel: 'Supplier',
    buyerLabel: 'Buyer (Issued by)',
    showPrices: true,
    metaFields: [
      { key: 'docNumber', label: 'PO No.' },
      { key: 'issueDate', label: 'Issue Date' },
      { key: 'deliveryDate', label: 'Delivery Date' },
      { key: 'currency', label: 'Currency' },
      { key: 'paymentTerms', label: 'Payment Terms' },
      { key: 'shippingTerms', label: 'Shipping Terms' },
    ],
    itemColumns: ['no', 'description', 'qty', 'unit', 'unitPrice', 'amount'],
    totals: ['subtotal', 'tax', 'total'],
  },
  PL: {
    key: 'PL',
    label: 'Packing List',
    title: 'PACKING LIST',
    sellerLabel: 'Shipper',
    buyerLabel: 'Consignee',
    showPrices: false,
    metaFields: [
      { key: 'docNumber', label: 'PL No.' },
      { key: 'issueDate', label: 'Issue Date' },
      { key: 'reference', label: 'Reference' },
    ],
    itemColumns: ['no', 'description', 'qty', 'unit', 'netWeight', 'grossWeight', 'cartons'],
    totals: ['totalQty', 'totalNetWeight', 'totalGrossWeight', 'totalCartons'],
  },
  CI: {
    key: 'CI',
    label: 'Commercial Invoice',
    title: 'COMMERCIAL INVOICE',
    sellerLabel: 'Seller / Exporter',
    buyerLabel: 'Buyer / Importer',
    showPrices: true,
    metaFields: [
      { key: 'docNumber', label: 'Invoice No.' },
      { key: 'issueDate', label: 'Issue Date' },
      { key: 'currency', label: 'Currency' },
      { key: 'countryOfOrigin', label: 'Country of Origin' },
      { key: 'incoterms', label: 'Incoterms' },
      { key: 'paymentTerms', label: 'Payment Terms' },
    ],
    itemColumns: ['no', 'description', 'qty', 'unit', 'unitPrice', 'amount', 'hsCode'],
    totals: ['subtotal', 'tax', 'total'],
    footerOrigin: true,
  },
};

export function getDocumentType(type) {
  return DOCUMENT_TYPES[type] || null;
}

const num = (v) => Number(v) || 0;

export function computeTotals(type, data) {
  const items = data && Array.isArray(data.items) ? data.items : [];
  const meta = (data && data.meta) || {};
  const subtotal = items.reduce((s, it) => s + num(it.qty) * num(it.unitPrice), 0);
  const taxRate = num(meta.taxRate);
  const tax = subtotal * taxRate;
  return {
    subtotal,
    taxRate,
    tax,
    total: subtotal + tax,
    totalQty: items.reduce((s, it) => s + num(it.qty), 0),
    totalNetWeight: items.reduce((s, it) => s + num(it.netWeight), 0),
    totalGrossWeight: items.reduce((s, it) => s + num(it.grossWeight), 0),
    totalCartons: items.reduce((s, it) => s + num(it.cartons), 0),
  };
}

const FALLBACK_SELLER = {
  name: 'Long River Label Co., Ltd.',
  address: 'Room 101, Industrial Building, Shenzhen, China',
  phone: '+86 755 0000 0000',
  email: 'sales@longriverlabel.com',
  logoUrl: '',
};

export function getDummyData(type) {
  const iso = new Date().toISOString().slice(0, 10);
  const base = {
    seller: { ...FALLBACK_SELLER },
    buyer: {
      name: 'Acme Retail Ltd.',
      address: '500 Market Street, New York, NY 10001, USA',
      phone: '+1 212 555 0142',
      email: 'purchasing@acmeretail.com',
    },
    meta: {
      issueDate: iso,
      currency: 'USD',
      paymentTerms: '30% deposit, 70% before shipment',
      incoterms: 'FOB Shenzhen',
      shippingTerms: 'By sea, 30 days',
      countryOfOrigin: 'China',
      taxRate: 0,
    },
    notes: 'This is a dummy document generated for demonstration purposes.',
    items: [],
  };

  if (type === 'PI') {
    base.meta.docNumber = 'PI-2026-0001';
    base.meta.dueDate = '2026-07-25';
    base.items = [
      { no: 1, description: 'Woven Label 20x40mm', qty: 5000, unit: 'pcs', unitPrice: 0.05 },
      { no: 2, description: 'Hang Tag 40x80mm', qty: 2000, unit: 'pcs', unitPrice: 0.12 },
    ];
  } else if (type === 'PO') {
    base.meta.docNumber = 'PO-2026-0001';
    base.meta.deliveryDate = '2026-07-31';
    base.items = [
      { no: 1, description: 'PU Patch 50x50mm', qty: 3000, unit: 'pcs', unitPrice: 0.25 },
      { no: 2, description: 'Leather Label 30x60mm', qty: 1500, unit: 'pcs', unitPrice: 0.18 },
    ];
  } else if (type === 'PL') {
    base.meta.docNumber = 'PL-2026-0001';
    base.meta.reference = 'Ref: CI-2026-0001';
    base.items = [
      { no: 1, description: 'Woven Label 20x40mm', qty: 5000, unit: 'pcs', netWeight: 2.5, grossWeight: 3.0, cartons: 1 },
      { no: 2, description: 'Hang Tag 40x80mm', qty: 2000, unit: 'pcs', netWeight: 4.0, grossWeight: 4.8, cartons: 1 },
    ];
  } else if (type === 'CI') {
    base.meta.docNumber = 'CI-2026-0001';
    base.items = [
      { no: 1, description: 'Woven Label 20x40mm', qty: 5000, unit: 'pcs', unitPrice: 0.05, hsCode: '5807.00' },
      { no: 2, description: 'Hang Tag 40x80mm', qty: 2000, unit: 'pcs', unitPrice: 0.12, hsCode: '4821.10' },
    ];
  }
  return base;
}

// ---------- Random dummy data (the "Dummy input" button) ----------
// Everything is randomized EXCEPT the seller: the caller (UI) overrides
// `data.seller` with the currently selected brand so a brand pick survives.
const ri = (n) => Math.floor(Math.random() * n);
const rint = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const rpick = (arr) => arr[ri(arr.length)];
const rround2 = (n) => Math.round(n * 100) / 100;

const RANDOM_BUYERS = [
  { name: 'Acme Retail Ltd.', address: '500 Market Street, New York, NY 10001, USA', phone: '+1 212 555 0142', email: 'purchasing@acmeretail.com' },
  { name: 'Nordic Apparel AB', address: 'Storgatan 12, 111 52 Stockholm, Sweden', phone: '+46 8 555 0123', email: 'orders@nordicapparel.se' },
  { name: 'Sakura Trading Co.', address: '3-1 Marunouchi, Chiyoda, Tokyo 100-0005, Japan', phone: '+81 3 5555 0188', email: 'buy@sakuratrade.jp' },
  { name: 'Pacific Goods Pty Ltd', address: 'Level 4, 120 Sussex St, Sydney NSW 2000, Australia', phone: '+61 2 5550 1199', email: 'accounts@pacificgoods.com.au' },
  { name: 'Maison du Label SARL', address: '15 Rue de la Paix, 75002 Paris, France', phone: '+33 1 5555 0177', email: 'achat@maisondulabel.fr' },
  { name: 'Maple Textiles Inc.', address: '200 King St W, Toronto, ON M5H 3X4, Canada', phone: '+1 416 555 0166', email: 'po@mapletextiles.ca' },
];

// [description, unit] for priceless types; [description, unit, hsCode] for CI.
const RANDOM_ITEMS = {
  PI: [['Woven Label 20x40mm', 'pcs'], ['Hang Tag 40x80mm', 'pcs'], ['Care Label 30x50mm', 'pcs'], ['PU Patch 50x50mm', 'pcs'], ['Leather Label 30x60mm', 'pcs'], ['Sticker 60x60mm', 'pcs']],
  PO: [['PU Patch 50x50mm', 'pcs'], ['Leather Label 30x60mm', 'pcs'], ['Woven Label 20x40mm', 'pcs'], ['Metal Buckle 35mm', 'pcs'], ['Zip Puller 30mm', 'pcs']],
  PL: [['Woven Label 20x40mm', 'pcs'], ['Hang Tag 40x80mm', 'pcs'], ['Care Label 30x50mm', 'pcs'], ['Sticker 60x60mm', 'pcs']],
  CI: [['Woven Label 20x40mm', 'pcs', '5807.00'], ['Hang Tag 40x80mm', 'pcs', '4821.10'], ['Care Label 30x50mm', 'pcs', '4821.10'], ['PU Patch 50x50mm', 'pcs', '5906.10'], ['Leather Label 30x60mm', 'pcs', '4202.92']],
};

const RANDOM_NOTES = [
  'Dummy document generated for demonstration purposes.',
  'Prices are indicative and subject to final confirmation.',
  'Please confirm lead time before placing the order.',
  'Goods are packed as per buyer specifications.',
];

export function getRandomDummyData(type) {
  const cfg = getDocumentType(type);
  if (!cfg) return getDummyData(type); // graceful fallback for unknown type
  const iso = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const suffix = String(rint(1, 9999)).padStart(4, '0');

  const base = {
    seller: { ...FALLBACK_SELLER }, // caller overrides with the selected brand
    buyer: { ...rpick(RANDOM_BUYERS) },
    meta: {
      docNumber: `${type}-${year}-${suffix}`,
      issueDate: iso,
      currency: rpick(['USD', 'EUR', 'HKD', 'JPY', 'AUD']),
      paymentTerms: rpick(['30% deposit, 70% before shipment', '100% in advance', 'Net 30', 'L/C at sight']),
      incoterms: rpick(['FOB Shenzhen', 'EXW Shenzhen', 'CIF Hong Kong', 'DDP']),
      shippingTerms: rpick(['By sea, 30 days', 'By air, 7 days', 'By express, 3 days']),
      countryOfOrigin: rpick(['China', 'Vietnam', 'India', 'Bangladesh']),
      taxRate: rpick([0, 0.05, 0.1]),
    },
    notes: rpick(RANDOM_NOTES),
    items: [],
  };

  if (type === 'PI') base.meta.dueDate = iso;
  if (type === 'PO') base.meta.deliveryDate = iso;
  if (type === 'PL') base.meta.reference = `Ref: CI-${year}-${suffix}`;

  const pool = RANDOM_ITEMS[type] || RANDOM_ITEMS.PI;
  const count = rint(2, 4);
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let pick = rpick(pool);
    // avoid duplicate descriptions where the pool allows
    let guard = 0;
    while (used.has(pick[0]) && guard < 5) { pick = rpick(pool); guard++; }
    used.add(pick[0]);
    const item = { no: i + 1, description: pick[0], qty: rint(500, 10000), unit: pick[1] };
    if (cfg.showPrices) {
      item.unitPrice = rround2(Math.random() * 0.5 + 0.02); // 0.02..0.52
      if (type === 'CI') item.hsCode = pick[2] || '0000.00';
    } else {
      item.netWeight = rround2(Math.random() * 8 + 0.5); // 0.5..8.5
      item.grossWeight = rround2(item.netWeight + Math.random() * 1.5);
      item.cartons = rint(1, 10);
    }
    base.items.push(item);
  }
  return base;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function money(n) { return (Number(n) || 0).toFixed(2); }

function cellText(colKey, value, currency) {
  if (colKey === 'unitPrice' || colKey === 'amount') {
    const m = money(value);
    return currency ? `${m} ${esc(currency)}` : m;
  }
  if (colKey === 'netWeight' || colKey === 'grossWeight') return money(value);
  return esc(value);
}

function totalsText(totalKey, totals, currency) {
  const isMoney = totalKey === 'subtotal' || totalKey === 'tax' || totalKey === 'total';
  const v = totals[totalKey];
  if (isMoney) {
    const m = money(v);
    return currency ? `${m} ${esc(currency)}` : m;
  }
  return String(v != null ? v : '—');
}

export function buildDocumentHtml(type, data) {
  const cfg = getDocumentType(type);
  if (!cfg) return '';
  const d = data || {};
  const seller = d.seller || {};
  const buyer = d.buyer || {};
  const meta = d.meta || {};
  const items = Array.isArray(d.items) ? d.items : [];
  const notes = d.notes || '';
  const totals = computeTotals(type, d);
  const currency = meta.currency || '';

  const logoHtml = seller.logoUrl
    ? `<img src="${esc(seller.logoUrl)}" alt="logo" style="max-height:54px;max-width:170px;object-fit:contain;">`
    : '';

  const metaRows = cfg.metaFields.map((f) => {
    const val = meta[f.key] != null && meta[f.key] !== '' ? meta[f.key] : '—';
    return `<tr><td style="color:#888;padding:2px 8px 2px 0;white-space:nowrap;">${esc(f.label)}</td><td style="padding:2px 0;">${esc(val)}</td></tr>`;
  }).join('');

  const party = (label, p) => `
    <div style="flex:1 1 50%;min-width:200px;">
      <div style="font-weight:700;color:#333;margin-bottom:4px;">${esc(label)}</div>
      <div style="font-weight:600;">${esc(p.name || '—')}</div>
      <div style="white-space:pre-line;">${esc(p.address || '')}</div>
      <div>${esc(p.phone || '')}</div>
      <div>${esc(p.email || '')}</div>
    </div>`;

  const head = cfg.itemColumns.map((c) => `<th style="border:1px solid #ccc;background:#f0f0f0;padding:4px 6px;font-size:11px;text-align:left;">${esc(COLUMN_LABELS[c] || c)}</th>`).join('');

  const bodyRows = items.map((it, idx) => {
    const no = it.no != null ? it.no : idx + 1;
    const tds = cfg.itemColumns.map((c) => {
      let v;
      if (c === 'no') v = no;
      else if (c === 'amount') v = num(it.qty) * num(it.unitPrice);
      else v = it[c];
      const align = ['qty', 'unitPrice', 'amount', 'netWeight', 'grossWeight', 'cartons'].includes(c) ? 'right' : 'left';
      return `<td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:${align};">${cellText(c, v, currency)}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('') || `<tr><td colspan="${cfg.itemColumns.length}" style="border:1px solid #ddd;padding:6px;color:#aaa;text-align:center;">No items</td></tr>`;

  const totalsRows = (cfg.totals || []).map((t) => `
    <tr>
      <td style="padding:2px 10px 2px 0;color:#555;text-align:right;">${esc(TOTALS_LABELS[t] || t)}</td>
      <td style="padding:2px 0;font-weight:${t === 'total' ? '700' : '400'};text-align:right;min-width:90px;">${totalsText(t, totals, currency)}</td>
    </tr>`).join('');

  const originFooter = cfg.footerOrigin
    ? `<div style="margin-top:14px;font-size:12px;">Country of Origin: <strong>${esc(meta.countryOfOrigin || '—')}</strong></div>`
    : '';

  const notesBlock = notes
    ? `<div style="margin-top:14px;font-size:12px;color:#444;"><strong>Notes:</strong> ${esc(notes)}</div>`
    : '';

  return `
<div class="doc-preview" style="font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff;border:1px solid #ddd;padding:18px;max-width:760px;margin:0 auto;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:8px;">
    <div>${logoHtml}</div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:700;letter-spacing:.5px;">${esc(cfg.title)}</div>
      <div style="color:#888;font-size:11px;">${esc(cfg.label)}</div>
    </div>
  </div>
  <div style="display:flex;gap:16px;margin-top:12px;">${party(cfg.sellerLabel, seller)}${party(cfg.buyerLabel, buyer)}</div>
  <table style="margin-top:12px;border-collapse:collapse;">${metaRows}</table>
  <table style="margin-top:12px;width:100%;border-collapse:collapse;">
    <thead><tr>${head}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <table style="margin-top:8px;margin-left:auto;border-collapse:collapse;">${totalsRows}</table>
  ${originFooter}
  ${notesBlock}
</div>`.trim();
}
