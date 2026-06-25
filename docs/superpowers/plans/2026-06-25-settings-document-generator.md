# Settings → Document Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 2nd-level **Document** item under the **Setting** menu and a new **Document** page that generates four dummy-defaulted trade documents (Proforma Invoice, Purchase Order, Packing List, Commercial Invoice) with a live HTML preview and a server-side pdfkit PDF download.

**Architecture:** A pure shared ES module (`shared/documentTemplates.js`) holds one `DOCUMENT_TYPES` config + dummy data + `computeTotals` + `buildDocumentHtml`, used by both the browser (live preview) and the server. A server-only pdfkit builder (`utils/documentPdf.js`) reads the same config to draw the PDF. A thin route (`routes/documents.js`) exposes `POST /api/documents/pdf`. The page itself lives in `public/index.html`.

**Tech Stack:** Node.js (ES modules), Express, pdfkit (`pdfkit` ^0.18), vanilla browser JS, the project's `eq/ok/summary` test helpers.

## Global Constraints

- **No git.** Per project CLAUDE.md: never run/suggest `git add/commit/push/stage`. Tasks end with a test/verification checkpoint, not a commit.
- **No Playwright/browser automation.** Manual UI verification only (run `node server.js`, click through).
- **Tests run via** `node tests/unit/<NN-name>.test.js` (no `test` script). Helpers imported from `./_helpers.js` (`eq`, `ok`, `summary`, `tempDbPath`). Routes tested via a throwaway express app on an ephemeral port using global `fetch`. Shared modules imported in tests with top-level `await import('../../shared/...')`.
- **Shared module purity:** `shared/documentTemplates.js` must be pure ES — no `window`/`document`/`fetch`/node-only imports (it runs in both browser and Node). It is served to the browser by the existing `/shared` static route (`server.js:387`).
- **Document type codes:** exactly `'PI'`, `'PO'`, `'PL'`, `'CI'`. Packing List (`PL`) shows **no prices**; Commercial Invoice (`CI`) adds the HS Code column and a "Country of Origin" footer.
- **Stateless:** no database writes. Seller comes from `window.cachedBrands`; everything else is hardcoded dummy defaults.

## File Structure

| File | Responsibility | New/Edit |
|---|---|---|
| `shared/documentTemplates.js` | `DOCUMENT_TYPES` config, `COLUMN_LABELS`, `TOTALS_LABELS`, `getDocumentType`, `computeTotals`, `getDummyData`, `buildDocumentHtml`. Pure, browser+server. | New |
| `utils/documentPdf.js` | `buildDocumentPdf(type, data)` → `Promise<Buffer>` via pdfkit. Server-only. Imports config + `computeTotals` from the shared module. | New |
| `routes/documents.js` | `createDocumentRoutes()` → express Router with `POST /pdf`. | New |
| `server.js` | Import + mount the document routes. | Edit |
| `public/index.html` | Menu item, `documentPanel`, tab/activate wiring, shared-module import, form/preview/download logic. | Edit |
| `tests/unit/20-document-totals.test.js` | `computeTotals` correctness. | New |
| `tests/unit/21-document-templates-html.test.js` | `buildDocumentHtml` per-type output. | New |
| `tests/unit/22-document-pdf.test.js` | `buildDocumentPdf` returns a `%PDF` buffer. | New |
| `tests/unit/23-documents-route.test.js` | `POST /api/documents/pdf` end-to-end. | New |
| `tests/unit/24-document-menu-wiring.test.js` | Static assertions that `index.html` wires the menu/panel/import. | New |

> Note on numbering: the spec listed html as 20 and totals as 21, but `buildDocumentHtml` depends on `computeTotals`, so totals is built first (20) and html second (21). Final test files: 20-totals, 21-html, 22-pdf, 23-route, 24-wiring.

---

## Task 1: Shared config + dummy data + totals

**Files:**
- Create: `shared/documentTemplates.js`
- Test: `tests/unit/20-document-totals.test.js`

**Interfaces:**
- Produces: `DOCUMENT_TYPES`, `COLUMN_LABELS`, `TOTALS_LABELS`, `getDocumentType(type)`, `computeTotals(type, data)`, `getDummyData(type)`. Consumed by Tasks 2, 3, and the UI.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/20-document-totals.test.js`:

```js
import { eq, ok, summary } from './_helpers.js';
const {
  DOCUMENT_TYPES, COLUMN_LABELS, TOTALS_LABELS,
  getDocumentType, computeTotals, getDummyData,
} = await import('../../shared/documentTemplates.js');

// --- type registry ---
eq(Object.keys(DOCUMENT_TYPES).sort().join(','), 'CI,PI,PL,PO', 'four types registered');
eq(getDocumentType('PI').title, 'PROFORMA INVOICE', 'PI title');
eq(getDocumentType('PL').showPrices, false, 'PL hides prices');
eq(getDocumentType('CI').showPrices, true, 'CI shows prices');
eq(getDocumentType('NOPE'), null, 'unknown type -> null');

// PL item columns have no money columns
const plCols = getDocumentType('PL').itemColumns;
ok(!plCols.includes('unitPrice') && !plCols.includes('amount'), 'PL columns omit unitPrice/amount');
ok(plCols.includes('netWeight') && plCols.includes('cartons'), 'PL columns include weight/cartons');
// CI item columns include hsCode
ok(getDocumentType('CI').itemColumns.includes('hsCode'), 'CI columns include hsCode');

// --- computeTotals: price type with tax ---
const piData = {
  meta: { currency: 'USD', taxRate: 0.1 },
  items: [
    { qty: 5000, unitPrice: 0.05, netWeight: 2.5, grossWeight: 3, cartons: 1 },
    { qty: 2000, unitPrice: 0.12, netWeight: 4, grossWeight: 4.8, cartons: 1 },
  ],
};
const piTotals = computeTotals('PI', piData);
eq(piTotals.subtotal, 490, 'PI subtotal = 5000*0.05 + 2000*0.12 = 250+240');
eq(piTotals.tax, 49, 'PI tax = 490 * 0.10');
eq(piTotals.total, 539, 'PI total = subtotal + tax');
eq(piTotals.totalQty, 7000, 'PI totalQty');
eq(piTotals.totalCartons, 2, 'PI totalCartons');

// --- computeTotals: price type with no tax (default 0) ---
const noTax = computeTotals('CI', { items: [{ qty: 1, unitPrice: 2 }, { qty: 3, unitPrice: 5 }] });
eq(noTax.tax, 0, 'tax defaults to 0 when taxRate absent');
eq(noTax.total, 17, 'total = subtotal when no tax');

// --- computeTotals: PL weights ---
const plTotals = computeTotals('PL', { items: [
  { qty: 5000, netWeight: 2.5, grossWeight: 3 },
  { qty: 2000, netWeight: 4, grossWeight: 4.8 },
] });
eq(plTotals.totalNetWeight, 6.5, 'PL totalNetWeight');
eq(plTotals.totalGrossWeight, 7.8, 'PL totalGrossWeight');
eq(plTotals.totalQty, 7000, 'PL totalQty');

// --- computeTotals: empty/defensive ---
const empty = computeTotals('PI', { items: [] });
eq(empty.subtotal, 0, 'empty items -> subtotal 0');
eq(computeTotals('PI', null).subtotal, 0, 'null data -> subtotal 0');

// --- getDummyData ---
['PI', 'PO', 'PL', 'CI'].forEach((t) => {
  const d = getDummyData(t);
  ok(d.seller && d.seller.name, `${t} dummy has seller.name`);
  ok(d.buyer && d.buyer.name, `${t} dummy has buyer.name`);
  ok(Array.isArray(d.items) && d.items.length >= 2, `${t} dummy has >=2 items`);
  ok(d.meta && d.meta.docNumber, `${t} dummy has meta.docNumber`);
  ok(d.meta.issueDate && /^\d{4}-\d{2}-\d{2}$/.test(d.meta.issueDate), `${t} dummy issueDate is YYYY-MM-DD`);
});
eq(getDummyData('PI').meta.docNumber, 'PI-2026-0001', 'PI dummy doc number');
eq(getDummyData('PL').meta.reference, 'Ref: CI-2026-0001', 'PL dummy reference');

summary('20-document-totals');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/20-document-totals.test.js`
Expected: FAIL — `Cannot find module '.../shared/documentTemplates.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `shared/documentTemplates.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/unit/20-document-totals.test.js`
Expected: PASS — `20-document-totals: N passed, 0 failed`.

- [ ] **Step 5: Checkpoint**

Run `node tests/unit/20-document-totals.test.js` once more and confirm 0 failures before moving on.

---

## Task 2: Shared `buildDocumentHtml` (live preview)

**Files:**
- Modify: `shared/documentTemplates.js` (append `buildDocumentHtml` + helpers, add to exports)
- Test: `tests/unit/21-document-templates-html.test.js`

**Interfaces:**
- Consumes: `getDocumentType`, `computeTotals`, `COLUMN_LABELS`, `TOTALS_LABELS` (from Task 1).
- Produces: `buildDocumentHtml(type, data)` → self-contained HTML fragment string (inline styles) for the preview pane.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/21-document-templates-html.test.js`:

```js
import { eq, ok, summary } from './_helpers.js';
const { buildDocumentHtml, getDummyData } = await import('../../shared/documentTemplates.js');

const types = ['PI', 'PO', 'PL', 'CI'];
const titles = {
  PI: 'PROFORMA INVOICE', PO: 'PURCHASE ORDER', PL: 'PACKING LIST', CI: 'COMMERCIAL INVOICE',
};

types.forEach((t) => {
  const html = buildDocumentHtml(t, getDummyData(t));
  ok(typeof html === 'string' && html.length > 100, `${t} html is a non-empty string`);
  ok(html.includes(titles[t]), `${t} html contains its title`);
  ok(html.includes('Woven Label 20x40mm'), `${t} html renders an item description`);
});

// PI: money columns + totals present
const pi = buildDocumentHtml('PI', getDummyData('PI'));
ok(pi.includes('Unit Price'), 'PI html shows Unit Price column');
ok(pi.includes('Amount'), 'PI html shows Amount column');
ok(pi.includes('Subtotal') && pi.includes('Total'), 'PI html shows Subtotal/Total');

// PL: NO money anywhere
const pl = buildDocumentHtml('PL', getDummyData('PL'));
ok(!pl.includes('Unit Price'), 'PL html omits Unit Price');
ok(!pl.includes('Amount'), 'PL html omits Amount');
ok(!pl.includes('Subtotal'), 'PL html omits Subtotal');
ok(pl.includes('N.W.') && pl.includes('Cartons'), 'PL html shows weight/carton columns');
ok(pl.includes('Total N.W.'), 'PL html shows weight totals');

// CI: HS Code + Country of Origin footer
const ci = buildDocumentHtml('CI', getDummyData('CI'));
ok(ci.includes('HS Code'), 'CI html shows HS Code column');
ok(ci.includes('5807.00'), 'CI html renders hsCode value');
ok(ci.includes('Country of Origin'), 'CI html shows Country of Origin footer');

// amount computed from qty*unitPrice
const piAmt = buildDocumentHtml('PI', { meta: { currency: 'USD' }, items: [{ qty: 4, unitPrice: 1.5 }] });
ok(piAmt.includes('6.00 USD') || piAmt.includes('6.00'), 'PI html computes amount = qty*unitPrice');

// unknown type -> empty string
eq(buildDocumentHtml('NOPE', {}), '', 'unknown type -> empty string');

// HTML escaping (no raw injection)
const esc = buildDocumentHtml('PI', { meta: {}, items: [{ description: '<script>x</script>', qty: 1, unitPrice: 1 }] });
ok(!esc.includes('<script>x</script>'), 'PI html escapes descriptions');
ok(esc.includes('&lt;script&gt;'), 'PI html entity-encodes < >');

summary('21-document-templates-html');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/21-document-templates-html.test.js`
Expected: FAIL — `buildDocumentHtml is not a function` (or undefined import).

- [ ] **Step 3: Write minimal implementation**

Append to `shared/documentTemplates.js` (above the final export list, or just add the function — ES `export function` works anywhere at module top level):

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/unit/21-document-templates-html.test.js`
Expected: PASS — `21-document-templates-html: N passed, 0 failed`.

- [ ] **Step 5: Checkpoint**

Also run `node tests/unit/20-document-totals.test.js` to confirm Task 1 still passes (no regressions in the shared module).

---

## Task 3: pdfkit PDF builder

**Files:**
- Create: `utils/documentPdf.js`
- Test: `tests/unit/22-document-pdf.test.js`

**Interfaces:**
- Consumes: `DOCUMENT_TYPES`, `COLUMN_LABELS`, `TOTALS_LABELS`, `getDocumentType`, `computeTotals` (from `shared/documentTemplates.js`).
- Produces: `buildDocumentPdf(type, data)` → `Promise<Buffer>` (a PDF starting with `%PDF`). Used by Task 4.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/22-document-pdf.test.js`:

```js
import { eq, ok, summary } from './_helpers.js';
const { buildDocumentPdf } = await import('../../utils/documentPdf.js');
const { getDummyData } = await import('../../shared/documentTemplates.js');

for (const t of ['PI', 'PO', 'PL', 'CI']) {
  const buf = await buildDocumentPdf(t, getDummyData(t));
  ok(Buffer.isBuffer(buf), `${t} returns a Buffer`);
  ok(buf.length > 1000, `${t} PDF buffer is non-trivially large`);
  eq(buf.slice(0, 4).toString('latin1'), '%PDF', `${t} PDF starts with %PDF`);
  ok(buf.includes(Buffer.from('/Type /Page', 'latin1')) || buf.includes(Buffer.from('/Page', 'latin1')), `${t} PDF has a page object`);
}

// unknown type throws
let threw = false;
try { await buildDocumentPdf('NOPE', {}); } catch { threw = true; }
ok(threw, 'unknown type throws');

summary('22-document-pdf');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/22-document-pdf.test.js`
Expected: FAIL — `Cannot find module '.../utils/documentPdf.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `utils/documentPdf.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/unit/22-document-pdf.test.js`
Expected: PASS — `22-document-pdf: N passed, 0 failed`.

- [ ] **Step 5: Checkpoint**

Run `node tests/unit/20-document-totals.test.js` and `node tests/unit/21-document-templates-html.test.js` to confirm no regressions.

---

## Task 4: Route + server mount

**Files:**
- Create: `routes/documents.js`
- Modify: `server.js` (import + instantiate + mount)
- Test: `tests/unit/23-documents-route.test.js`

**Interfaces:**
- Consumes: `buildDocumentPdf` (Task 3), `getDocumentType` (Task 1).
- Produces: `POST /api/documents/pdf` returning `application/pdf`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/23-documents-route.test.js`:

```js
import express from 'express';
import { eq, ok, summary } from './_helpers.js';
const { createDocumentRoutes } = await import('../../routes/documents.js');
const { getDummyData } = await import('../../shared/documentTemplates.js');

const app = express();
app.use(express.json());
app.use('/api/documents', createDocumentRoutes());
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

async function postPdf(type, data) {
  const res = await fetch(`${base}/api/documents/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data }),
  });
  return res;
}

for (const t of ['PI', 'PO', 'PL', 'CI']) {
  const res = await postPdf(t, getDummyData(t));
  eq(res.status, 200, `${t} POST -> 200`);
  eq(res.headers.get('content-type'), 'application/pdf', `${t} content-type is application/pdf`);
  const buf = Buffer.from(await res.arrayBuffer());
  ok(buf.length > 1000, `${t} response body is non-trivial`);
  eq(buf.slice(0, 4).toString('latin1'), '%PDF', `${t} body starts with %PDF`);
  const cd = res.headers.get('content-disposition') || '';
  ok(cd.includes('attachment'), `${t} Content-Disposition is attachment`);
}

// unknown type -> 400
const bad = await postPdf('NOPE', {});
eq(bad.status, 400, 'unknown type -> 400');
const badJson = await bad.json();
eq(badJson.success, false, 'unknown type body success=false');

// missing body -> 400 (no type)
const noBody = await fetch(`${base}/api/documents/pdf`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
});
eq(noBody.status, 400, 'missing type -> 400');

server.close();
summary('23-documents-route');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/23-documents-route.test.js`
Expected: FAIL — `Cannot find module '.../routes/documents.js'`.

- [ ] **Step 3: Write the route**

Create `routes/documents.js`:

```js
// Stateless trade-document PDF route (Proforma Invoice / Purchase Order /
// Packing List / Commercial Invoice). No database — data arrives in the body.
import express from 'express';
import { buildDocumentPdf } from '../utils/documentPdf.js';
import { getDocumentType } from '../shared/documentTemplates.js';

const router = express.Router();

router.post('/pdf', async (req, res) => {
  try {
    const { type, data } = req.body || {};
    if (!getDocumentType(type)) {
      return res.status(400).json({ success: false, error: 'Unknown document type' });
    }
    const buf = await buildDocumentPdf(type, data || {});
    const docNumber = (data && data.meta && data.meta.docNumber) || type;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${docNumber}.pdf"`);
    return res.send(buf);
  } catch (error) {
    console.error('Error generating document PDF:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate PDF: ' + error.message });
  }
});

export function createDocumentRoutes() {
  return router;
}
```

- [ ] **Step 4: Mount it in server.js**

Two edits in `server.js`:

1. Add the import after line 70 (`import { createOrderRoutes } from './routes/orders.js';`):

```js
import { createDocumentRoutes } from './routes/documents.js';
```

2. After the orders mount block (after line 634 `app.use('/api/orders', orderRoutes);` and its blank line, before the `// Supplier portal routes` comment at line 636), add:

```js
// Document generator routes (Proforma Invoice / Purchase Order / Packing List / Commercial Invoice)
const documentRoutes = createDocumentRoutes();
app.use('/api/documents', documentRoutes);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/unit/23-documents-route.test.js`
Expected: PASS — `23-documents-route: N passed, 0 failed`.

- [ ] **Step 6: Checkpoint**

Run all four backend tests in order and confirm 0 failures across the set:
`node tests/unit/20-document-totals.test.js && node tests/unit/21-document-templates-html.test.js && node tests/unit/22-document-pdf.test.js && node tests/unit/23-documents-route.test.js`

---

## Task 5: Menu item + panel shell + wiring (static test)

**Files:**
- Modify: `public/index.html` (menu button, panel div, tab highlight, activateTab line, click handler, shared-module import)
- Test: `tests/unit/24-document-menu-wiring.test.js`

**Interfaces:**
- Consumes: `/shared/documentTemplates.js` (browser import), existing `ensureTab` / `activateTab` / `settingSubmenu` / `tabHighlight`.
- Produces: a reachable **Document** menu item that opens `documentPanel`; `window.selectDocType` / `window.initializeDocumentPanel` defined (Task 6 fills the bodies).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/24-document-menu-wiring.test.js`:

```js
import fs from 'fs';
import path from 'path';
import { ok, summary } from './_helpers.js';

const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');

ok(html.includes('id="menuDocumentBtn"'), 'menu has menuDocumentBtn button');
ok(/class="submenu-btn"[^>]*>Document</.test(html) || html.includes('>Document</button>'), 'menu shows a Document label');
ok(html.includes('id="documentPanel"'), 'body has documentPanel');
ok(html.includes("ensureTab('document'"), "click handler calls ensureTab('document')");
ok(html.includes("activateTab('document')"), "click handler calls activateTab('document')");
ok(html.includes("'document':"), "tabHighlight has a 'document' entry");
ok(html.includes("id === 'document'"), "activateTab toggles documentPanel by id");
ok(html.includes('/shared/documentTemplates.js'), 'page imports /shared/documentTemplates.js');
ok(html.includes('selectDocType') || html.includes('initializeDocumentPanel'), 'page defines a document init/select function');

summary('24-document-menu-wiring');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/24-document-menu-wiring.test.js`
Expected: FAIL — the `menuDocumentBtn`/`documentPanel`/import assertions miss.

- [ ] **Step 3: Add the shared-module import**

In `public/index.html`, at the top module script (lines 4–5 area), add a second import and expose the functions to `window` right after the existing `import * as Q ...` line:

```js
      import * as DocTpl from '/shared/documentTemplates.js';
```

Then extend the existing `Object.assign(window, { ... })` block (the one that exposes `Q.*`) by adding these keys inside it (anywhere within that object literal):

```js
        DOCUMENT_TYPES: DocTpl.DOCUMENT_TYPES,
        COLUMN_LABELS: DocTpl.COLUMN_LABELS,
        TOTALS_LABELS: DocTpl.TOTALS_LABELS,
        getDocumentType: DocTpl.getDocumentType,
        computeDocTotals: DocTpl.computeTotals,
        getDummyDocData: DocTpl.getDummyData,
        buildDocumentHtml: DocTpl.buildDocumentHtml,
```

> These are the exact names Task 6 uses from inline scripts.

- [ ] **Step 4: Add the menu button**

Find the Settings submenu (around line 1643–1656). After the **Option List** button:

```html
      <button id="menuOptionListBtn" class="submenu-btn">Option List</button>
```

add on the next line:

```html
      <button id="menuDocumentBtn" class="submenu-btn">Document</button>
```

- [ ] **Step 5: Add the `documentPanel` div**

Add the panel near the other top-level panels (e.g., right after the `optionListPanel` div). Minimal shell — Task 6 populates the inner containers:

```html
    <div id="documentPanel" style="margin:0; padding:12px; display:none; width:100%;">
      <div id="docToolbar" style="display:flex; gap:6px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
        <button type="button" id="docTabPI" class="doc-tab">Proforma Invoice</button>
        <button type="button" id="docTabPO" class="doc-tab">Purchase Order</button>
        <button type="button" id="docTabPL" class="doc-tab">Packing List</button>
        <button type="button" id="docTabCI" class="doc-tab">Commercial Invoice</button>
        <span style="flex:1 1 auto;"></span>
        <button type="button" id="docResetBtn">Reset to dummy</button>
        <button type="button" id="docDownloadBtn">Download PDF</button>
      </div>
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <div id="docFormContainer" style="flex:1 1 50%; min-width:300px;"></div>
        <div id="docPreviewContainer" style="flex:1 1 50%; min-width:300px; background:#fafafa; border:1px solid #ddd; padding:8px;"></div>
      </div>
    </div>
```

- [ ] **Step 6: Wire `tabHighlight` + `activateTab` + click handler**

In the `tabHighlight` object (around line 4925–4944) add this entry (matching the existing shape):

```js
      'document': { btns: ['menuDocumentBtn', 'menuSettings'], open: ['settingSubmenu'] },
```

In `activateTab`'s panel-visibility block (around line 4974–5001), add alongside the other panel lines:

```js
      document.getElementById('documentPanel').style.display = id === 'document' ? 'block' : 'none';
```

Near the other menu click handlers (around line 8934–8940, where `menuProfilesBtn.onclick` is defined), add:

```js
      const menuDocumentBtn = document.getElementById('menuDocumentBtn');
      if (menuDocumentBtn) {
        menuDocumentBtn.onclick = () => {
          document.getElementById('settingSubmenu').style.display = 'none';
          ensureTab('document', 'Setting (Document)');
          activateTab('document');
          if (typeof window.initializeDocumentPanel === 'function') window.initializeDocumentPanel();
        };
      }
```

- [ ] **Step 7: Add a tiny `.doc-tab` style + a stub init (Task 6 fills it)**

In the existing `<style>` block add:

```css
      .doc-tab { padding:4px 10px; font-size:12px; border:1px solid #ccc; background:#fff; cursor:pointer; }
      .doc-tab.active { background:#1a1a1a; color:#fff; border-color:#1a1a1a; }
```

And add (inside the main inline `<script>`, near other `window.xxx = function` definitions):

```js
      window._docState = { type: 'PI', byType: {} };
      window.selectDocType = function (type) { window._docState.type = type; };
      window.initializeDocumentPanel = function () { window.selectDocType('PI'); };
```

> These stubs satisfy the static test and the click handler; Task 6 replaces their bodies with the real rendering.

- [ ] **Step 8: Run test to verify it passes**

Run: `node tests/unit/24-document-menu-wiring.test.js`
Expected: PASS — `24-document-menu-wiring: N passed, 0 failed`.

- [ ] **Step 9: Checkpoint (manual)**

Run `node server.js`, open the app, click **Setting → Document**. Confirm: the Document item appears in the submenu, clicking it opens a tab "Setting (Document)", the toolbar shows four type tabs + Reset + Download, and no console errors. (Forms/preview are populated in Task 6.)

---

## Task 6: Forms, live preview, download (manual verification)

**Files:**
- Modify: `public/index.html` (replace the Task 5 stubs of `selectDocType` / `initializeDocumentPanel` with the real implementation; add helpers)

**Interfaces:**
- Consumes: `window.DOCUMENT_TYPES`, `window.COLUMN_LABELS`, `window.TOTALS_LABELS`, `window.getDocumentType`, `window.computeDocTotals`, `window.getDummyDocData`, `window.buildDocumentHtml` (exposed in Task 5), `window.cachedBrands`, `POST /api/documents/pdf` (Task 4).

- [ ] **Step 1: Replace the stubs with the real implementation**

In the main inline `<script>`, replace the Task 5 stub block (`window._docState = ...; window.selectDocType = ...; window.initializeDocumentPanel = ...;`) with:

```js
      // ---------- Document generator (Setting > Document) ----------
      window._docState = { type: 'PI', byType: {} }; // byType caches per-type form data

      function docInput(id, label, value, opts) {
        opts = opts || {};
        const v = value == null ? '' : String(value);
        const style = 'width:100%;padding:4px;font-size:12px;border:1px solid #ccc;box-sizing:border-box;';
        const el = opts.area
          ? `<textarea id="${id}" style="${style}min-height:46px;">${v.replace(/</g, '&lt;')}</textarea>`
          : `<input type="text" id="${id}" value="${v.replace(/"/g, '&quot;')}" style="${style}">`;
        return `<div style="margin-bottom:6px;"><label style="display:block;font-size:11px;color:#666;">${label}</label>${el}</div>`;
      }

      function brandOptions(selectedName) {
        const brands = (window.cachedBrands && Array.isArray(window.cachedBrands)) ? window.cachedBrands : [];
        const opts = brands.map((b) => `<option value="${(b.id != null ? b.id : '').toString().replace(/"/g, '&quot;')}"${(b.name === selectedName) ? ' selected' : ''}>${(b.name || '').replace(/</g, '&lt;')}</option>`).join('');
        return `<option value="">(use fallback seller)</option>${opts}`;
      }

      function renderDocForm(type) {
        const cfg = window.getDocumentType(type);
        const data = window._docState.byType[type] || window.getDummyDocData(type);
        // Pre-fill seller from first cached brand if user hasn't chosen one yet
        if (!data.seller._chosen && window.cachedBrands && window.cachedBrands[0]) {
          const b = window.cachedBrands[0];
          data.seller = { _chosen: false, name: b.name || data.seller.name, address: b.address || data.seller.address, phone: data.seller.phone, email: data.seller.email, logoUrl: b.logoPath || data.seller.logoUrl };
        }
        window._docState.byType[type] = data;

        const seller = data.seller || {};
        const buyer = data.buyer || {};
        const meta = data.meta || {};
        const items = Array.isArray(data.items) ? data.items : [];

        const brandSel = `<div style="margin-bottom:6px;"><label style="display:block;font-size:11px;color:#666;">Seller (brand)</label>
          <select id="docBrandSel" style="width:100%;padding:4px;font-size:12px;border:1px solid #ccc;box-sizing:border-box;">${brandOptions(seller.name)}</select></div>`;

        const sellerHtml = brandSel
          + docInput('docSellerName', 'Seller name', seller.name)
          + docInput('docSellerAddr', 'Seller address', seller.address, { area: true })
          + docInput('docSellerPhone', 'Seller phone', seller.phone)
          + docInput('docSellerEmail', 'Seller email', seller.email);

        const buyerHtml =
            docInput('docBuyerName', cfg.buyerLabel + ' name', buyer.name)
          + docInput('docBuyerAddr', cfg.buyerLabel + ' address', buyer.address, { area: true })
          + docInput('docBuyerPhone', 'Phone', buyer.phone)
          + docInput('docBuyerEmail', 'Email', buyer.email);

        const metaHtml = cfg.metaFields.map((f) => docInput('docMeta_' + f.key, f.label, meta[f.key])).join('')
          + (cfg.showPrices ? docInput('docMeta_taxRate', 'Tax % (e.g. 0.1 = 10%)', meta.taxRate) : '');

        // items table
        const cols = cfg.itemColumns;
        const editableCols = cols.filter((c) => c !== 'no' && c !== 'amount'); // no/amount are derived
        const head = cols.map((c) => `<th style="border:1px solid #ccc;padding:4px 6px;font-size:11px;text-align:left;">${(window.COLUMN_LABELS[c] || c)}</th>`).join('')
          + '<th style="border:1px solid #ccc;"></th>';
        const rowsHtml = items.map((it, idx) => {
          const tds = cols.map((c) => {
            if (c === 'no') return `<td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:center;">${idx + 1}</td>`;
            if (c === 'amount') {
              const amt = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
              return `<td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:right;background:#fafafa;">${(Number(amt) || 0).toFixed(2)}</td>`;
            }
            const align = ['qty', 'unitPrice', 'netWeight', 'grossWeight', 'cartons'].includes(c) ? 'right' : 'left';
            return `<td style="border:1px solid #ddd;padding:0;"><input data-row="${idx}" data-col="${c}" value="${String(it[c] == null ? '' : it[c]).replace(/"/g, '&quot;')}" style="width:100%;padding:4px 6px;font-size:11px;border:none;box-sizing:border-box;text-align:${align};"></td>`;
          }).join('');
          return `<tr>${tds}<td style="border:1px solid #ddd;padding:4px;text-align:center;"><button type="button" onclick="window.removeDocRow(${idx})" style="font-size:11px;">✕</button></td></tr>`;
        }).join('');

        const itemsHtml = `
          <div style="margin-top:8px;"><div style="font-weight:700;font-size:12px;margin-bottom:4px;">Items</div>
          <table style="width:100%;border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody id="docItemsBody">${rowsHtml}</tbody></table>
          <button type="button" id="docAddRowBtn" style="margin-top:4px;font-size:12px;">+ Add row</button></div>`;

        const notesHtml = docInput('docNotes', 'Notes', data.notes, { area: true });

        document.getElementById('docFormContainer').innerHTML =
          `<div style="font-weight:700;font-size:13px;margin-bottom:6px;">${cfg.title}</div>`
          + `<fieldset style="border:1px solid #ddd;padding:8px;margin-bottom:8px;"><legend style="font-size:11px;color:#666;">${cfg.sellerLabel}</legend>${sellerHtml}</fieldset>`
          + `<fieldset style="border:1px solid #ddd;padding:8px;margin-bottom:8px;"><legend style="font-size:11px;color:#666;">${cfg.buyerLabel}</legend>${buyerHtml}</fieldset>`
          + `<fieldset style="border:1px solid #ddd;padding:8px;margin-bottom:8px;"><legend style="font-size:11px;color:#666;">Details</legend>${metaHtml}</fieldset>`
          + itemsHtml + notesHtml;

        // tab highlight
        ['PI', 'PO', 'PL', 'CI'].forEach((t) => {
          const el = document.getElementById('docTab' + t);
          if (el) el.classList.toggle('active', t === type);
        });

        wireDocFormEvents(type);
      }

      function wireDocFormEvents(type) {
        const readField = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
        const data = window._docState.byType[type];

        const onBrandChange = () => {
          const sel = document.getElementById('docBrandSel');
          const chosen = sel && sel.value !== '' ? window.cachedBrands.find((b) => String(b.id) === String(sel.value)) : null;
          if (chosen) {
            data.seller = { _chosen: true, name: chosen.name || '', address: chosen.address || '', phone: data.seller.phone, email: data.seller.email, logoUrl: chosen.logoPath || '' };
            renderDocForm(type); collectDocForm(type); updateDocPreview();
          }
        };
        const brandSel = document.getElementById('docBrandSel');
        if (brandSel) brandSel.onchange = () => { onBrandChange(); };

        const syncSimple = () => {
          data.seller.name = readField('docSellerName');
          data.seller.address = readField('docSellerAddr');
          data.seller.phone = readField('docSellerPhone');
          data.seller.email = readField('docSellerEmail');
          data.buyer.name = readField('docBuyerName');
          data.buyer.address = readField('docBuyerAddr');
          data.buyer.phone = readField('docBuyerPhone');
          data.buyer.email = readField('docBuyerEmail');
          const cfg = window.getDocumentType(type);
          cfg.metaFields.forEach((f) => { data.meta[f.key] = readField('docMeta_' + f.key); });
          const taxEl = document.getElementById('docMeta_taxRate');
          if (taxEl) data.meta.taxRate = Number(taxEl.value) || 0;
          data.notes = readField('docNotes');
        };

        document.querySelectorAll('#docItemsBody input').forEach((inp) => {
          inp.oninput = () => {
            const r = Number(inp.dataset.row); const c = inp.dataset.col;
            const v = ['qty', 'unitPrice', 'netWeight', 'grossWeight', 'cartons'].includes(c) ? (Number(inp.value) || 0) : inp.value;
            data.items[r][c] = v;
            // amount is derived; preview recomputes it from qty*unitPrice.
            updateDocPreview();
          };
        });

        const handler = () => { syncSimple(); updateDocPreview(); };
        document.getElementById('docFormContainer').querySelectorAll('input,textarea,select').forEach((el) => {
          if (el.id === 'docBrandSel') return;
          el.removeEventListener('input', handler); el.addEventListener('input', handler);
          el.removeEventListener('change', handler); el.addEventListener('change', handler);
        });

        const addBtn = document.getElementById('docAddRowBtn');
        if (addBtn) addBtn.onclick = () => {
          const cfg = window.getDocumentType(type);
          const blank = { no: data.items.length + 1 };
          cfg.itemColumns.forEach((c) => { if (!(c in blank) && c !== 'no' && c !== 'amount') blank[c] = ''; });
          data.items.push(blank);
          renderDocForm(type); updateDocPreview();
        };
      }

      window.removeDocRow = function (idx) {
        const type = window._docState.type;
        const data = window._docState.byType[type];
        data.items.splice(idx, 1);
        renderDocForm(type); updateDocPreview();
      };

      function collectDocForm(type) { return window._docState.byType[type]; }

      function updateDocPreview() {
        const type = window._docState.type;
        const data = collectDocForm(type);
        document.getElementById('docPreviewContainer').innerHTML = window.buildDocumentHtml(type, data);
      }

      window.selectDocType = function (type) {
        window._docState.type = type;
        if (!window._docState.byType[type]) window._docState.byType[type] = window.getDummyDocData(type);
        renderDocForm(type);
        updateDocPreview();
      };

      window.initializeDocumentPanel = function () {
        // wire toolbar tabs/buttons once
        ['PI', 'PO', 'PL', 'CI'].forEach((t) => {
          const el = document.getElementById('docTab' + t);
          if (el) el.onclick = () => window.selectDocType(t);
        });
        const dl = document.getElementById('docDownloadBtn');
        if (dl) dl.onclick = window.downloadDocPdf;
        const rs = document.getElementById('docResetBtn');
        if (rs) rs.onclick = window.resetDocDummy;
        window.selectDocType(window._docState.type || 'PI');
      };

      window.resetDocDummy = function () {
        const type = window._docState.type;
        window._docState.byType[type] = window.getDummyDocData(type);
        renderDocForm(type); updateDocPreview();
      };

      window.downloadDocPdf = async function () {
        const type = window._docState.type;
        const data = collectDocForm(type);
        try {
          const res = await fetch('/api/documents/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, data }),
          });
          if (!res.ok) { alert('Failed to generate PDF (HTTP ' + res.status + ')'); return; }
          const blob = await res.blob();
          const cd = res.headers.get('content-disposition') || '';
          const m = cd.match(/filename="([^"]+)"/);
          const fname = m ? m[1] : ((data.meta && data.meta.docNumber) || type) + '.pdf';
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        } catch (e) {
          console.error('downloadDocPdf error', e);
          alert('Failed to generate PDF: ' + e.message);
        }
      };
```

- [ ] **Step 2: Re-run the static wiring test (regression guard)**

Run: `node tests/unit/24-document-menu-wiring.test.js`
Expected: PASS (the wiring tokens are still present).

- [ ] **Step 3: Manual verification (end-to-end)**

With `node server.js` running and the app open:

1. **Setting → Document** opens the panel titled "Setting (Document)".
2. The default tab is **Proforma Invoice**, highlighted; the form is pre-filled with dummy buyer + items, and the seller is pre-filled from the first cached brand (or the fallback seller if no brands exist).
3. The right-hand **preview** shows a styled PROFORMA INVOICE with seller/buyer, meta, item table, and Subtotal/Tax/Total.
4. Editing any field (e.g. change Qty) updates the preview live (debounced by the input event).
5. Switch to **Packing List**: the form and preview show **no prices** — columns are Qty / N.W. / G.W. / Cartons and totals are Total Qty / Total N.W. / Total G.W. / Total Cartons.
6. Switch to **Commercial Invoice**: the HS Code column and a "Country of Origin" line appear.
7. **+ Add row** adds an editable item row; **✕** removes one; preview updates.
8. Change the **Seller (brand)** dropdown → seller name/address/logo update in the form and preview.
9. **Reset to dummy** restores the current type's defaults.
10. **Download PDF** downloads a file named after the doc number (e.g. `PI-2026-0001.pdf`) that opens as a valid PDF matching the preview layout.
11. Switching among all four tabs keeps each type's edits (per-type cache).

- [ ] **Step 4: Checkpoint**

Run the full new test set once more and confirm 0 failures:
`node tests/unit/20-document-totals.test.js && node tests/unit/21-document-templates-html.test.js && node tests/unit/22-document-pdf.test.js && node tests/unit/23-documents-route.test.js && node tests/unit/24-document-menu-wiring.test.js`

---

## Self-Review (completed during planning)

**1. Spec coverage:**
- 2nd-level "Document" under Setting → Task 5 (menu button + submenu). ✅
- Four document types PI/PO/PL/CI → `DOCUMENT_TYPES` (Task 1). ✅
- Four separate forms → Task 6 `renderDocForm(type)` driven per-type by config; tab switching keeps per-type state. ✅
- Seller from brands, rest hardcoded dummy → `getDummyData` (Task 1) + brand select (Task 6). ✅
- Live HTML preview → `buildDocumentHtml` (Task 2) + `updateDocPreview` (Task 6). ✅
- Server-side pdfkit PDF download → `buildDocumentPdf` (Task 3) + `POST /api/documents/pdf` (Task 4) + `downloadDocPdf` (Task 6). ✅
- PL no prices / CI HS Code + Country of Origin → config + assertions in Tasks 1–3. ✅
- Stateless, no DB → no DB writes anywhere; route has no DB import. ✅
- Testing (4 backend + 1 wiring) → Tasks 1–5. ✅

**2. Placeholder scan:** No TBD/TODO; every code step contains real code; every test step contains real assertions; manual verification steps enumerate concrete checks.

**3. Type/name consistency:** `DOCUMENT_TYPES`, `COLUMN_LABELS`, `TOTALS_LABELS`, `getDocumentType`, `computeTotals`, `getDummyData`, `buildDocumentHtml`, `buildDocumentPdf`, `createDocumentRoutes` are used identically across tasks. Browser-exposed names (`getDocumentType`, `computeDocTotals`, `getDummyDocData`, `buildDocumentHtml`) are referenced consistently in Task 6. Test file numbers (20–24) are consistent.

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-06-25-settings-document-generator.md` (not git-committed — project CLAUDE.md forbids git operations).
