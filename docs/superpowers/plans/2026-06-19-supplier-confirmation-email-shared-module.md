# Supplier Confirmation Email — Rich Card + Tier Table (Shared HTML Module) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the supplier-portal submission confirmation email render the full branded quotation card plus the supplier's submitted per-tier pricing table, by extracting the card HTML builder into one shared ES module used by both Node and the browser.

**Architecture:** A new pure ES module (`shared/quotationEmailHtml.js`) holds the card renderer, its helpers, the data maps, a new response-tier table renderer, and a server-side composition function. The server imports it directly (filesystem path); the browser loads it via a deferred `<script type="module">` that assigns the exports onto `window`. The six now-duplicated inline definitions are deleted from `public/index.html`.

**Tech Stack:** Node.js (ES modules, `"type":"module"`), Express 4, nodemailer, vanilla browser JS, and a zero-dependency `eq/ok/summary` Node harness for unit tests. (The repo also has Playwright specs, but per CLAUDE.md we do NOT run Playwright — verification here is via Node tests + manual inspection.)

## Global Constraints

- **Shared module is pure:** no `window`, no `document`, no `cachedBrands`, no `fetch`. It must `import` in Node and load in the browser unchanged.
- **ES module everywhere:** the project is `"type": "module"` (`package.json`). Use `export`/`import`, never CommonJS.
- **One PR, no live duplication:** the module is created first; server then browser adopt it; inline duplicates are deleted in the same PR. Transient duplication between commits inside the PR is acceptable.
- **Graceful tiers:** the tier table renders only when the supplier submitted tiers; flat-price submissions keep the existing Unit Price / Total Price rows.
- **Self-contained card:** layout styles (`.quotation-container`, `.quotation-section`, `.quotation-section h3`, `.quotation-table`) are inlined on the elements so the card renders without a document-level `<style>` block (email-client-safe, works in server composition).
- **No schema changes, no data migration.** `sanitizedTiers` already exists in scope at the submit handler.
- **Project rules (from CLAUDE.md — absolute):** NO git commits during this run — never run `git add`/`commit`/`push`/`stage`. Tasks end when tests pass; the user commits on their own. NO Playwright in any form — not the Playwright MCP and not the `npx playwright test` CLI runner — and no browser automation of any kind, unless the user explicitly asks in that exact request. Verify changes by reasoning, `node --check`, Node unit tests, and manual inspection only.

---

## File Structure

- **Create** `shared/quotationEmailHtml.js` — the shared module: data maps, helpers, `generateQuotationCardHtml`, `generateQuotationEmailHtml` (wrapper), `generateSupplierResponseTiersHtml`, `buildSupplierConfirmationHtml`. Built incrementally across Tasks 1–3.
- **Create** `tests/unit/06-quotation-email-html.test.js` — unit tests for the shared module, using the existing `eq/ok/summary` harness (`tests/unit/_helpers.js`).
- **Modify** `routes/supplier-portal.js` — import `buildSupplierConfirmationHtml`; rewrite the `html` inside `sendSubmissionNotification`; pass `sanitizedTiers` at the call site (Task 4).
- **Modify** `server.js` — add `app.use('/shared', express.static(...))` so the browser can fetch the module (Task 5). **Spec gap fix:** only `public/` is served today (`server.js:371`).
- **Modify** `public/index.html` — add the deferred module `<script>` in `<head>`; delete the six duplicated inline definitions; update the two card callers to the `opts` signature (Task 5).
- **Create** `tests/unit/07-browser-module-wiring.test.js` — static Node checks (read `public/index.html` + `server.js` as text) that the module loader, `/shared` mount, caller conversions, and six deletions landed (Task 5). No browser, no Playwright.

---

## Interfaces (cross-task contract)

- `formatFileSize(bytes)` → `string`. Verbatim from `public/index.html:14265`.
- `emailProductTypeDisplay(productType, productDetails)` → `string`. Verbatim from `public/index.html:15363`.
- `resolveProductDetailValue(key, raw)` → `string`. Verbatim from `public/index.html:15458`.
- `PRODUCT_DETAILS_LABELS`, `PRODUCT_OPTION_LABELS` — objects. Verbatim from `public/index.html:15376` and `15414`.
- `generateSupplierResponseTiersHtml(tiers)` → `string`. `tiers = [{tierIndex, quantity, unitPrice, total}, ...]`. Returns `''` for empty/absent.
- `generateQuotationCardHtml(quotation, opts)` → `string`. `opts = { brandName, profileImageSrc, qrBase64, osRef, attachmentList }`. Returns the `<div class="quotation-container">…</div>` block only (no document shell).
- `generateQuotationEmailHtml(quotation, opts)` → `string`. Same `opts` plus `emailMeta`, `originalEmailHtml`. Full `<!DOCTYPE>…</html>` document.
- `buildSupplierConfirmationHtml(quotation, supplier, supplierMember, submittedData, opts)` → `string`. `opts = { brandName, profileImageCid }`. Full document: card + confirmation block + tier table.

---

## Task 1: Create shared module — data maps, helpers, response-tier table

**Files:**
- Create: `shared/quotationEmailHtml.js`
- Test: `tests/unit/06-quotation-email-html.test.js`

**Interfaces:**
- Produces: `PRODUCT_DETAILS_LABELS`, `PRODUCT_OPTION_LABELS`, `formatFileSize`, `emailProductTypeDisplay`, `resolveProductDetailValue`, `generateSupplierResponseTiersHtml`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/06-quotation-email-html.test.js`:

```js
import { eq, ok, summary } from './_helpers.js';

const {
  PRODUCT_DETAILS_LABELS,
  PRODUCT_OPTION_LABELS,
  formatFileSize,
  emailProductTypeDisplay,
  resolveProductDetailValue,
  generateSupplierResponseTiersHtml,
} = await import('../../shared/quotationEmailHtml.js');

// --- data maps ---
eq(PRODUCT_DETAILS_LABELS.material, 'Material', 'PRODUCT_DETAILS_LABELS.material');
eq(PRODUCT_DETAILS_LABELS.height_mm, 'Height (mm)', 'PRODUCT_DETAILS_LABELS.height_mm');
eq(PRODUCT_OPTION_LABELS.materialType.satin, 'Satin Tape', 'PRODUCT_OPTION_LABELS.materialType.satin');
eq(PRODUCT_OPTION_LABELS.threadColorCount['4-6'], '4-6 Colors', 'PRODUCT_OPTION_LABELS.threadColorCount');

// --- formatFileSize ---
eq(formatFileSize(0), '0 B', 'formatFileSize(0)');
eq(formatFileSize(1024), '1 KB', 'formatFileSize(1024)');
eq(formatFileSize(1048576), '1 MB', 'formatFileSize(1MB)');

// --- emailProductTypeDisplay ---
eq(emailProductTypeDisplay('hang-tag', {}), 'Hang Tag', 'hang-tag -> Hang Tag');
eq(emailProductTypeDisplay('outsource', { _productTag: 'woven-label' }), 'Woven Label', 'outsource+_productTag resolved');
eq(emailProductTypeDisplay(undefined, {}), 'N/A', 'undefined productType -> N/A');

// --- resolveProductDetailValue ---
eq(resolveProductDetailValue('materialType', 'satin'), 'Satin Tape', 'option code resolved');
eq(resolveProductDetailValue('size', '10x20'), '10x20', 'free-text value returned verbatim');

// --- generateSupplierResponseTiersHtml ---
eq(generateSupplierResponseTiersHtml([]), '', 'empty tiers -> empty string');
eq(generateSupplierResponseTiersHtml(undefined), '', 'absent tiers -> empty string');

const twoTiers = generateSupplierResponseTiersHtml([
  { tierIndex: 0, quantity: 1000, unitPrice: 0.5, total: 500 },
  { tierIndex: 1, quantity: 5000, unitPrice: 0.4, total: 2000 },
]);
ok(twoTiers.includes('Supplier Quoted Pricing'), 'tier table has heading');
ok(twoTiers.includes('1,000'), 'tier table renders quantity with locale formatting');
ok(twoTiers.includes('0.50'), 'tier table renders unit price to 2 decimals');
ok(twoTiers.includes('500.00'), 'tier table renders total to 2 decimals');
ok((twoTiers.match(/<tr><td/g) || []).length === 2, 'tier table has exactly 2 body rows');

summary('shared quotation email html (maps, helpers, tiers)');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/unit/06-quotation-email-html.test.js`
Expected: FAIL — `Cannot find module '.../shared/quotationEmailHtml.js'` (module does not exist yet).

- [ ] **Step 3: Create the module with data maps, helpers, and tier table**

Create `shared/quotationEmailHtml.js`:

```js
// Shared quotation-email HTML builder. Pure ES module: no window/document/fetch.
// Imported by the Node server and loaded by the browser (see public/index.html).

// Verbatim from public/index.html:15376
export const PRODUCT_DETAILS_LABELS = {
  material: 'Material',
  size: 'Size',
  printingMethod: 'Printing Method',
  colorCount: 'Color Count',
  edgeFinish: 'Edge Finish',
  materialType: 'Material Type',
  flatRaised: 'Flat / Raised',
  ink: 'Ink',
  raisedHeight: 'Raised Height (mm)',
  frontColor: 'Front Color',
  backColor: 'Back Color',
  folding: 'Folding',
  transferType: 'Transfer Type',
  application: 'Application Method',
  thickness: 'Thickness',
  colorMode: 'Color Mode',
  backingType: 'Backing Type',
  designComplexity: 'Design Complexity',
  stitchType: 'Stitch Type',
  borderType: 'Border Type',
  threadColorCount: 'Thread Color Count',
  productDescription: 'Description',
  category: 'Category',
  complexity: 'Complexity',
  customerItemName: 'Customer Item Name',
  height_mm: 'Height (mm)',
  width_mm: 'Width (mm)',
  screenPrint: 'Screen Print',
  hotPress: 'Hot Press',
  edge: 'Edge',
  metalEmbedded: 'Metal Embedded',
  remark: 'Remark'
};

// Verbatim from public/index.html:15414
export const PRODUCT_OPTION_LABELS = {
  material: { paper: 'Paper', cardboard: 'Cardboard', plastic: 'Plastic', fabric: 'Fabric', 'Real Leather': 'Real Leather', 'PU Leather': 'PU Leather' },
  printingMethod: { 'screen-printing': 'Screen Printing', 'digital-printing': 'Digital Printing', 'offset-printing': 'Offset Printing', embroidery: 'Embroidery' },
  colorCount: { '1': '1 Color', '2': '2 Colors', '3': '3 Colors', '4': '4+ Colors' },
  edgeFinish: { cut: 'Cut Edge', hemmed: 'Hemmed Edge', overlocked: 'Overlocked', 'end-fold': 'End Fold', 'loop-fold': 'Loop Fold', '4-side-heat-cut': '4 Side Heat Cut' },
  materialType: { satin: 'Satin Tape', cotton: 'Cotton Tape', woven: 'Woven Fabric', others: 'Others' },
  flatRaised: { flat: 'Flat', raised: 'Raised' },
  ink: { uv: 'UV', silicon: 'Silicon' },
  folding: { 'end-fold': 'End Fold', 'loop-fold': 'Loop Fold', 'manhattan-fold': 'Manhattan Fold', 'mitre-fold': 'Mitre Fold', 'straight-cut': 'Straight Cut' },
  transferType: { 'screen-print': 'Screen Print Transfer', 'digital-print': 'Digital Print Transfer', 'vinyl-cut': 'Vinyl Cut Transfer', sublimation: 'Sublimation Transfer' },
  application: { 'heat-press': 'Heat Press', iron: 'Household Iron', commercial: 'Commercial Press' },
  thickness: { '0.5mm': '0.5mm', '1mm': '1mm', '1.5mm': '1.5mm', '2mm': '2mm', '3mm': '3mm' },
  colorMode: { 'single-color': 'Single Color', 'multi-color': 'Multi-Color', 'full-color': 'Full Color' },
  backingType: { adhesive: 'Adhesive', 'sew-on': 'Sew-on', velcro: 'Velcro', magnetic: 'Magnetic', 'iron-on': 'Iron-on', none: 'None' },
  designComplexity: { simple: 'Simple', medium: 'Medium', complex: 'Complex', custom: 'Custom' },
  complexity: { simple: 'Simple', medium: 'Medium', complex: 'Complex', custom: 'Custom' },
  stitchType: { 'flat-stitch': 'Flat Stitch', '3d-puff': '3D Puff', applique: 'Applique', chenille: 'Chenille' },
  borderType: { merrow: 'Merrow Border', 'heat-cut': 'Heat Cut Border', 'laser-cut': 'Laser Cut' },
  threadColorCount: { '1-3': '1-3 Colors', '4-6': '4-6 Colors', '7-9': '7-9 Colors', '10+': '10+ Colors' },
  screenPrint: { 'No': 'No', '1': '1', '2': '2', '3': '3', '4': '4' },
  hotPress: { 'YES': 'YES', 'NO': 'NO' },
  edge: { 'Paint': 'Paint', 'Embroidery': 'Embroidery' },
  metalEmbedded: { 'YES': 'YES', 'NO': 'NO' }
};

// Verbatim from public/index.html:14265
export function formatFileSize(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1))} ${units[i]}`;
}

// Verbatim from public/index.html:15363
export function emailProductTypeDisplay(productType, productDetails) {
  const pd = (typeof productDetails === 'string') ? JSON.parse(productDetails || '{}') : (productDetails || {});
  if (productType === 'outsource' && pd._productTag) {
    const names = { 'hang-tag':'Hang Tag','woven-label':'Woven Label','printed-label':'Printed Label','heat-transfer':'Heat Transfer','silicon-patch':'Silicon Patch','embroidery-patch':'Embroidery Patch','pu-patch':'PU Patch','other':'Other','others':'Other' };
    return names[pd._productTag] || pd._productTag;
  }
  const names = { 'hang-tag':'Hang Tag','woven-label':'Woven Label','printed-label':'Printed Label','heat-transfer':'Heat Transfer','silicon-patch':'Silicon Patch','embroidery-patch':'Embroidery Patch','pu-patch':'PU Patch','outsource':'Outsource','other':'Other','others':'Other' };
  return names[productType] || productType || 'N/A';
}

// Verbatim from public/index.html:15458
export function resolveProductDetailValue(key, raw) {
  const optMap = PRODUCT_OPTION_LABELS[key];
  if (optMap && Object.prototype.hasOwnProperty.call(optMap, String(raw))) {
    return optMap[String(raw)];
  }
  return raw;
}

// NEW: supplier response tier table for the confirmation email.
// tiers = [{tierIndex, quantity, unitPrice, total}, ...]. Returns '' when empty.
export function generateSupplierResponseTiersHtml(tiers) {
  const arr = Array.isArray(tiers) ? tiers : [];
  if (arr.length === 0) return '';
  const rows = arr.map((t) => {
    const q = Number(t.quantity) || 0;
    const u = t.unitPrice != null ? Number(t.unitPrice).toFixed(2) : '0.00';
    const z = (q * (parseFloat(u) || 0)).toFixed(2);
    return `<tr><td style="padding:6px; border:1px solid #ccc;">${q.toLocaleString()}</td><td style="padding:6px; border:1px solid #ccc;">${u}</td><td style="padding:6px; border:1px solid #ccc;">${z}</td></tr>`;
  }).join('');
  return `
  <div class="quotation-section" style="margin:20px 0;">
    <h3 style="margin-top:0; margin-bottom:8px; border-bottom:2px solid #000; padding-bottom:8px;">Supplier Quoted Pricing</h3>
    <table style="width:100%; border-collapse:collapse; margin:8px 0;">
      <thead><tr>
        <th style="padding:6px; border:1px solid #ccc; text-align:left;">Quantity</th>
        <th style="padding:6px; border:1px solid #ccc; text-align:left;">Unit Price (HKD)</th>
        <th style="padding:6px; border:1px solid #ccc; text-align:left;">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/unit/06-quotation-email-html.test.js`
Expected: PASS — prints `6 passed, 0 failed` (or similar) and `summary('shared quotation email html (maps, helpers, tiers)')` with no `FAIL` lines. Exit code 0.

- [ ] **Step 5: Done — no commit (CLAUDE.md)**

Task 1 is complete when Step 4 passes. Do not commit; the user commits when ready.

---

## Task 2: Add `generateQuotationCardHtml` to the shared module

**Files:**
- Modify: `shared/quotationEmailHtml.js` (append the function)
- Modify: `tests/unit/06-quotation-email-html.test.js` (append tests)

**Interfaces:**
- Consumes: `emailProductTypeDisplay`, `PRODUCT_DETAILS_LABELS`, `resolveProductDetailValue`, `formatFileSize` (from Task 1).
- Produces: `generateQuotationCardHtml(quotation, opts)` → inner card markup string.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/06-quotation-email-html.test.js` (before the final `summary(...)` line):

```js
const { generateQuotationCardHtml } = await import('../../shared/quotationEmailHtml.js');

const quotation = {
  productType: 'hang-tag',
  productDetails: { materialType: 'satin', size: '10x20' },
  customerName: 'Acme',
  contactPerson: 'Joe',
  customerItemName: 'CI-1',
  height_mm: 30,
  width_mm: 40,
  brandId: 7,
  variable: 'YES',
  notes: 'Line1\nLine2',
  dateCreated: '2026-06-19T00:00:00Z',
};

// cid image path (server)
const withCid = generateQuotationCardHtml(quotation, {
  brandName: 'BrandX',
  profileImageSrc: 'cid:profile-image-7@longriverlabel.com',
  osRef: 'OS-001',
});
ok(withCid.includes('<div class="quotation-container"'), 'card opens with quotation-container div');
ok(withCid.includes('style="max-width:800px; margin:0 auto; padding:20px; border:2px solid #000;"'), 'container has inlined layout style');
ok(!withCid.includes('<!DOCTYPE'), 'card is NOT a full document (no doctype)');
ok(withCid.includes('QUOTATION'), 'card has QUOTATION header');
ok(withCid.includes('BrandX'), 'card uses opts.brandName');
ok(withCid.includes('src="cid:profile-image-7@longriverlabel.com"'), 'card embeds cid: image');
ok(withCid.includes('OS-001'), 'card shows osRef');
ok(withCid.includes('Satin Tape'), 'card decodes productDetail option (materialType satin -> Satin Tape)');
ok(withCid.includes('Customer Item Name'), 'card shows root-level customer item name');
ok(withCid.includes('Line1<br>Line2'), 'card renders notes with line breaks');

// data URL image path (browser), no brand -> N/A
const withDataUrl = generateQuotationCardHtml(
  { productType: 'woven-label', productDetails: {}, customerName: 'C' },
  { brandName: undefined, profileImageSrc: 'data:image/png;base64,AAAA', osRef: '' }
);
ok(withDataUrl.includes('src="data:image/png;base64,AAAA"'), 'card embeds data URL image');
ok(withDataUrl.includes('N/A'), 'card falls back to N/A brand when brandName missing');
ok(!withDataUrl.includes('Ref:'), 'card omits Ref band when osRef empty');

// self-contained: every section heading + table carry inline styles (no reliance on a <style> block)
ok(withCid.includes('style="width:100%; border-collapse:collapse;"'), 'card table has inlined quotation-table style');
ok(withCid.includes('border-bottom:2px solid #000; padding-bottom:8px;">Product Information'), 'card section h3 has inlined style');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/unit/06-quotation-email-html.test.js`
Expected: FAIL — `generateQuotationCardHtml is not defined` (not exported yet).

- [ ] **Step 3: Implement `generateQuotationCardHtml`**

Append to `shared/quotationEmailHtml.js` (after `generateSupplierResponseTiersHtml`):

```js
// The reusable quotation card — INNER markup only (the quotation-container div:
// header, meta band, attachment reminder, product/customer/brand/spec sections,
// image, notes). No <!DOCTYPE>/<html>/<head>/<body> shell. Layout styles are
// inlined so the card renders standalone / inside any wrapper / in email clients
// that strip <style> blocks.
export function generateQuotationCardHtml(quotation, opts = {}) {
  const productDetails = (typeof quotation.productDetails === 'string') ? JSON.parse(quotation.productDetails || '{}') : (quotation.productDetails || {});
  const productTypeName = emailProductTypeDisplay(quotation.productType, productDetails);
  const fmtDate = (ds) => ds ? new Date(ds).toLocaleString() : '';

  const qrBase64 = opts.qrBase64 || null;
  const osRef = opts.osRef || '';
  const attachmentList = Array.isArray(opts.attachmentList) ? opts.attachmentList : [];

  const qrCellHtml = qrBase64 ? `
    <td width="100" valign="top" style="background:#fff; border:1px solid #ccc; text-align:center; padding:6px;">
      <img src="${qrBase64}" width="84" height="84" style="width:84px; height:84px; display:block; margin:0 auto;" alt="QR Code">
      ${osRef ? `<div style="font-size:11px; color:#000; font-weight:bold; margin-top:4px;">${osRef}</div>` : ''}
    </td>` : '';

  const metaBandHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#f5f5f5; border:1px solid #ccc; padding:8px; font-size:12px;">
          ${osRef ? `<strong style="color:#000;">Ref:</strong> <span style="color:#000;">${osRef}</span> &nbsp;|&nbsp; ` : ''}
          <strong style="color:#000;">Date Created:</strong> <span style="color:#000;">${fmtDate(quotation.dateCreated) || '-'}</span> &nbsp;|&nbsp;
          <strong style="color:#000;">Date Revised:</strong> <span style="color:#000;">${fmtDate(quotation.dateRevised) || '-'}</span>
        </td>
      </tr>
    </table>`;

  const attItems = attachmentList
    .map(a => `${a.filename} (${formatFileSize(a.sizeBytes)})`).join(', ');
  const attachmentReminderHtml = (attachmentList.length > 0)
    ? `<div style="margin-bottom:10px; padding:8px 10px; background:#fff8e1; border:1px solid #ffe082; font-size:12px; color:#5d4037;">
         <strong>📎 Attachments (${attachmentList.length}):</strong> ${attItems}
       </div>`
    : `<div style="margin-bottom:10px; padding:8px 10px; background:#f5f5f5; border:1px solid #ccc; font-size:12px; color:#666;">
         <strong>📎 Attachments:</strong> No additional attachments (a PDF copy of this quotation is attached).
       </div>`;

  const brandName = opts.brandName || 'N/A';

  const cellLabel = 'padding:8px; border:1px solid #ccc; font-weight:bold; width:45%; vertical-align:top;';
  const cellValue = 'padding:8px; border:1px solid #ccc; vertical-align:top;';
  const tableStyle = 'width:100%; border-collapse:collapse;';
  const h3Style = 'margin-top:0; margin-bottom:8px; border-bottom:2px solid #000; padding-bottom:8px;';
  const sectionStyle = 'margin:20px 0;';

  const shownKeys = new Set();
  let specRows = '';
  const addRow = (label, value) => {
    specRows += `<tr><td style="${cellLabel}">${label}</td><td style="${cellValue}">${value}</td></tr>`;
  };

  if (quotation.customerItemName) { addRow('Customer Item Name', quotation.customerItemName); shownKeys.add('customerItemName'); }
  if (quotation.height_mm !== null && quotation.height_mm !== undefined && quotation.height_mm !== '') { addRow('Height (mm, unfolded)', quotation.height_mm); shownKeys.add('height_mm'); }
  if (quotation.width_mm !== null && quotation.width_mm !== undefined && quotation.width_mm !== '') { addRow('Width (mm, unfolded)', quotation.width_mm); shownKeys.add('width_mm'); }

  for (const [key, raw] of Object.entries(productDetails)) {
    if (key.startsWith('_')) continue;
    if (shownKeys.has(key)) continue;
    if (raw === null || raw === undefined || raw === '') continue;
    const label = PRODUCT_DETAILS_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    const value = resolveProductDetailValue(key, raw);
    addRow(label, value);
  }

  if (specRows === '') {
    specRows = '<tr><td style="padding:8px; border:1px solid #ccc; color:#999;">No specifications recorded.</td><td style="padding:8px; border:1px solid #ccc;"></td></tr>';
  }

  const imageHtml = opts.profileImageSrc
    ? `<div style="margin:15px 0; text-align:center;"><img src="${opts.profileImageSrc}" style="max-width:200px; max-height:200px; object-fit:contain; border:1px solid #ddd; padding:5px;" alt="Product Image"></div>`
    : '';

  const notesHtml = quotation.notes
    ? `<div class="quotation-section" style="${sectionStyle}"><h3 style="${h3Style}">Additional Notes</h3><p style="margin:0; white-space:pre-wrap;">${String(quotation.notes).replace(/\n/g, '<br>')}</p></div>`
    : '';

  return `
  <div class="quotation-container" style="max-width:800px; margin:0 auto; padding:20px; border:2px solid #000;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
      <tr>
        <td valign="middle" style="background:#000; color:#fff; padding:15px; text-align:center; border:1px solid #000;">
          <div style="font-size:22px; font-weight:bold; margin:0;">QUOTATION</div>
          <div style="font-size:13px; margin:4px 0 0 0;">${productTypeName}</div>
        </td>
        ${qrCellHtml}
      </tr>
    </table>

    ${metaBandHtml}
    ${attachmentReminderHtml}

    <div class="quotation-section" style="${sectionStyle}">
      <h3 style="${h3Style}">Product Information</h3>
      <table class="quotation-table" style="${tableStyle}">
        <tr><td style="${cellLabel}">Product Type</td><td style="${cellValue}">${productTypeName}</td></tr>
        <tr><td style="${cellLabel}">Variable</td><td style="${cellValue}">${quotation.variable === 'YES' ? 'YES' : 'NO'}</td></tr>
      </table>
    </div>

    <div class="quotation-section" style="${sectionStyle}">
      <h3 style="${h3Style}">Customer Information</h3>
      <table class="quotation-table" style="${tableStyle}">
        <tr><td style="${cellLabel}">Customer Name</td><td style="${cellValue}">${quotation.customerName || 'N/A'}</td></tr>
        <tr><td style="${cellLabel}">Contact Person</td><td style="${cellValue}">${quotation.contactPerson || 'N/A'}</td></tr>
        <tr><td style="${cellLabel}">Email</td><td style="${cellValue}">${quotation.email || 'N/A'}</td></tr>
        <tr><td style="${cellLabel}">Phone</td><td style="${cellValue}">${quotation.phone || 'N/A'}</td></tr>
      </table>
    </div>

    <div class="quotation-section" style="${sectionStyle}">
      <h3 style="${h3Style}">Brand Detail</h3>
      <table class="quotation-table" style="${tableStyle}">
        <tr><td style="${cellLabel}">Brand Name</td><td style="${cellValue}">${brandName}</td></tr>
      </table>
    </div>

    <div class="quotation-section" style="${sectionStyle}">
      <h3 style="${h3Style}">Product Specifications</h3>
      ${imageHtml}
      <table class="quotation-table" style="${tableStyle}">
        ${specRows}
      </table>
    </div>

    ${notesHtml}
  </div>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/unit/06-quotation-email-html.test.js`
Expected: PASS — all assertions including the new card checks; exit code 0.

- [ ] **Step 5: Done — no commit (CLAUDE.md)**

Task 2 is complete when Step 4 passes. Do not commit; the user commits when ready.

---

## Task 3: Add `generateQuotationEmailHtml` wrapper + `buildSupplierConfirmationHtml`

**Files:**
- Modify: `shared/quotationEmailHtml.js` (append both functions)
- Modify: `tests/unit/06-quotation-email-html.test.js` (append tests)

**Interfaces:**
- Consumes: `generateQuotationCardHtml`, `generateSupplierResponseTiersHtml` (Tasks 1–2).
- Produces: `generateQuotationEmailHtml(quotation, opts)` (full document) and `buildSupplierConfirmationHtml(quotation, supplier, supplierMember, submittedData, opts)` (full document: card + confirmation block + tiers). The server uses the latter.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/06-quotation-email-html.test.js` (before the final `summary(...)` line):

```js
const { generateQuotationEmailHtml, buildSupplierConfirmationHtml } = await import('../../shared/quotationEmailHtml.js');

// --- generateQuotationEmailHtml: full document wrapper ---
const doc = generateQuotationEmailHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'C' },
  { brandName: 'B', profileImageSrc: null, emailMeta: { from: 'f@x', date: 'D', subject: 'S' }, originalEmailHtml: '<p>orig</p>' }
);
ok(doc.startsWith('<!DOCTYPE html>'), 'wrapper starts with <!DOCTYPE html>');
ok(doc.includes('<html>'), 'wrapper has <html>');
ok(doc.includes('<div class="quotation-container"'), 'wrapper contains the card');
ok(doc.includes('Original Message'), 'wrapper includes reply-quote header');
ok(doc.includes('f@x'), 'wrapper includes emailMeta.from');
ok(doc.includes('<p>orig</p>'), 'wrapper includes originalEmailHtml body');

const docNoReply = generateQuotationEmailHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'C' },
  { brandName: 'B', profileImageSrc: null }
);
ok(!docNoReply.includes('Original Message'), 'wrapper omits reply block when no originalEmailHtml');

// --- buildSupplierConfirmationHtml: tiered submission ---
const tiered = buildSupplierConfirmationHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'Cust', outsourcingSeq: 'OS-9', brandId: 1 },
  { companyName: 'Supplier Co' },
  { name: 'Alice' },
  { deliveryDays: 14, notes: 'tnx', unitPrice: null, totalPrice: null, sanitizedTiers: [
    { tierIndex: 0, quantity: 1000, unitPrice: 0.5, total: 500 },
    { tierIndex: 1, quantity: 5000, unitPrice: 0.4, total: 2000 },
  ] },
  { brandName: 'BrandZ', profileImageCid: 'profile-image-1@longriverlabel.com' }
);
ok(tiered.startsWith('<!DOCTYPE html>'), 'confirmation is a full document');
ok(tiered.includes('<div class="quotation-container"'), 'confirmation includes the card');
ok(tiered.includes('BrandZ'), 'confirmation card shows brand name');
ok(tiered.includes('Submission Confirmation'), 'confirmation has the confirmation block');
ok(tiered.includes('Supplier Co'), 'confirmation shows supplier company');
ok(tiered.includes('Alice'), 'confirmation shows contact');
ok(tiered.includes('Supplier Quoted Pricing'), 'confirmation includes the tier table');
ok(!tiered.includes('Unit Price (HKD)</td>'), 'tiered submission hides flat Unit Price row');

// --- buildSupplierConfirmationHtml: flat submission (no tiers) ---
const flat = buildSupplierConfirmationHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'Cust', outsourcingSeq: 'OS-9' },
  { companyName: 'Supplier Co' },
  { name: 'Alice' },
  { deliveryDays: 14, notes: '', unitPrice: 0.5, totalPrice: 500, sanitizedTiers: [] },
  { brandName: null, profileImageCid: null }
);
ok(!flat.includes('Supplier Quoted Pricing'), 'flat submission omits tier table');
ok(flat.includes('Unit Price (HKD)'), 'flat submission shows Unit Price row');
ok(flat.includes('0.50'), 'flat submission formats unit price to 2 decimals');
ok(flat.includes('500.00'), 'flat submission formats total to 2 decimals');
ok(flat.includes('N/A'), 'flat submission falls back to N/A brand when brandName null');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/unit/06-quotation-email-html.test.js`
Expected: FAIL — `generateQuotationEmailHtml is not defined` / `buildSupplierConfirmationHtml is not defined`.

- [ ] **Step 3: Implement both functions**

Append to `shared/quotationEmailHtml.js`:

```js
// Full-document wrapper — used when the card IS the entire email body (batch-send
// and reply flows). Thin wrapper over generateQuotationCardHtml + the reply-quote block.
export function generateQuotationEmailHtml(quotation, opts = {}) {
  const cardHtml = generateQuotationCardHtml(quotation, opts);
  const originalEmailHtml = opts.originalEmailHtml || '';
  const emailMeta = opts.emailMeta || null;

  const replyBlock = originalEmailHtml ? `
  <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ccc;">
    <div style="font-size: 0.9em; color: #666; margin-bottom: 10px;">
      <strong>---------- Original Message ----------</strong><br>
      ${emailMeta ? `
      <strong>From:</strong> ${emailMeta.from || 'Unknown'}<br>
      <strong>Date:</strong> ${emailMeta.date || 'Unknown'}<br>
      <strong>Subject:</strong> ${emailMeta.subject || '(No subject)'}
      ` : ''}
    </div>
    <div style="color: #333; border-left: 3px solid #ccc; padding-left: 15px; margin-left: 10px;">
      ${originalEmailHtml}
    </div>
  </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
  </style>
</head>
<body style="margin:0; padding:20px;">
${cardHtml}
${replyBlock}
</body>
</html>`;
}

// Server-side composition for the supplier submission confirmation email.
// Pure: takes already-loaded data, returns a full HTML document string.
//   opts = { brandName, profileImageCid }
//   submittedData.sanitizedTiers = [{tierIndex, quantity, unitPrice, total}, ...]
export function buildSupplierConfirmationHtml(quotation, supplier, supplierMember, submittedData, opts = {}) {
  const cellLabel = 'padding:8px; border:1px solid #ccc; font-weight:bold; width:45%; vertical-align:top;';
  const cellValue = 'padding:8px; border:1px solid #ccc; vertical-align:top;';

  const cardHtml = generateQuotationCardHtml(quotation, {
    brandName: opts.brandName,
    profileImageSrc: opts.profileImageCid ? `cid:${opts.profileImageCid}` : null,
    qrBase64: null,                 // server has no QR (out of scope)
    osRef: quotation.outsourcingSeq || '',
    attachmentList: [],
  });

  const tiers = (submittedData && Array.isArray(submittedData.sanitizedTiers)) ? submittedData.sanitizedTiers : [];
  const tiersHtml = generateSupplierResponseTiersHtml(tiers);

  const sd = submittedData || {};
  const flatRows = tiers.length === 0 ? `
        <tr><td style="${cellLabel}">Unit Price (HKD)</td><td style="${cellValue}">${sd.unitPrice != null ? Number(sd.unitPrice).toFixed(2) : 'N/A'}</td></tr>
        <tr><td style="${cellLabel}">Total Price (HKD)</td><td style="${cellValue}">${sd.totalPrice != null ? Number(sd.totalPrice).toFixed(2) : 'N/A'}</td></tr>` : '';

  const confirmationBlock = `
  <div class="quotation-section" style="margin:20px 0;">
    <h3 style="margin-top:0; margin-bottom:8px; border-bottom:2px solid #000; padding-bottom:8px;">Submission Confirmation</h3>
    <table style="width:100%; border-collapse:collapse;">
      <tr><td style="${cellLabel}">Supplier</td><td style="${cellValue}">${(supplier && supplier.companyName) || 'N/A'}</td></tr>
      <tr><td style="${cellLabel}">Contact</td><td style="${cellValue}">${(supplierMember && supplierMember.name) || 'N/A'}</td></tr>
      <tr><td style="${cellLabel}">Delivery Days</td><td style="${cellValue}">${sd.deliveryDays || 'N/A'}</td></tr>
      <tr><td style="${cellLabel}">Notes</td><td style="${cellValue}">${sd.notes || '-'}</td></tr>${flatRows}
    </table>
  </div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
</style>
</head>
<body style="margin:0; padding:20px;">
${cardHtml}
${confirmationBlock}
${tiersHtml}
<p style="font-size:12px; color:#666; margin-top:24px;">This is an automated notification.</p>
</body>
</html>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/unit/06-quotation-email-html.test.js`
Expected: PASS — every assertion including the wrapper and confirmation (tiered + flat) checks; exit code 0.

- [ ] **Step 5: Done — no commit (CLAUDE.md)**

Task 3 is complete when Step 4 passes. Do not commit; the user commits when ready.

---

## Task 4: Wire the server confirmation email

**Files:**
- Modify: `routes/supplier-portal.js` — add import; rewrite `html` inside `sendSubmissionNotification`; pass `sanitizedTiers` at the call site.

**Interfaces:**
- Consumes: `buildSupplierConfirmationHtml` (Task 3).
- Produces: a richer `html` body in `sendSubmissionNotification`; `sanitizedTiers` passed into the notification.

> **Note on testing:** the HTML-building logic is unit-tested in Task 3 (`buildSupplierConfirmationHtml`). This task is wiring: an import + a call-site change + a body rewrite. Verification is: (a) the unit tests still pass, (b) the server boots without import errors, (c) manual portal submit (Step 6).

- [ ] **Step 1: Add the import**

In `routes/supplier-portal.js`, the existing imports are at lines 1–6. Add after line 6 (`import nodemailer from 'nodemailer';`):

```js
import { buildSupplierConfirmationHtml } from '../shared/quotationEmailHtml.js';
```

- [ ] **Step 2: Pass `sanitizedTiers` into the notification call**

In `routes/supplier-portal.js`, find the call at line ~628 (inside `POST /:token/submit`, after the response insert + token mark). It currently reads:

```js
      sendSubmissionNotification(quotation, supplier, supplierMember, { unitPrice, totalPrice, deliveryDays, notes })
        .catch(err => console.error('Notification error:', err));
```

Replace it with:

```js
      sendSubmissionNotification(quotation, supplier, supplierMember, { unitPrice, totalPrice, deliveryDays, notes, sanitizedTiers })
        .catch(err => console.error('Notification error:', err));
```

(`sanitizedTiers` is built at line ~544 in the same handler and is in scope here.)

- [ ] **Step 3: Add the brand-name lookup + rewrite the `html`**

Inside `sendSubmissionNotification` (`routes/supplier-portal.js`), the function fetches `getProfiles()` and builds a `transport`, then fetches the profile image (`profileImageCid`). Replace the **entire** `const html = ...` block (currently lines ~56–80, the inline `<div>...Quotation Submission Confirmation...</div>` template) with a brand lookup + a call to the shared builder. The replacement block is:

```js
    // Brand name (one small query) — quotation.brandId is already loaded.
    const db = await getTasksDb();
    const brand = quotation.brandId
      ? await db.get('SELECT name FROM brands WHERE id = ?', [quotation.brandId])
      : null;
    const brandName = brand ? brand.name : null;

    const html = buildSupplierConfirmationHtml(quotation, supplier, supplierMember, submittedData, {
      brandName,
      profileImageCid,
    });
```

> `getTasksDb` is already imported at the top of the file (line 2). `submittedData` is the function's 4th parameter (now carrying `sanitizedTiers` from Step 2). `profileImageCid` is computed earlier in the same function (lines ~39–54) and is `null` when there is no image — `buildSupplierConfirmationHtml` handles that.

- [ ] **Step 4: Verify the server boots (import + syntax check)**

Run: `node -e "import('./routes/supplier-portal.js').then(() => console.log('import OK')).catch(e => { console.error(e); process.exit(1); })"`
Expected: prints `import OK`, exit code 0. (The route module's top level only registers routes; it does not open the DB at import time.)

- [ ] **Step 5: Re-run the unit tests (regression)**

Run: `node tests/unit/06-quotation-email-html.test.js`
Expected: PASS, exit code 0.

- [ ] **Step 6: Manual verification — portal submit (both recipients)**

Start the app (`npm start`), then submit a quotation through the supplier portal (`/supplier-portal.html`) for a quotation that has tiers, and inspect the email delivered to both the sender and the supplier. Confirm the email contains:
- The full QUOTATION card (header, meta band, product/customer/brand/spec sections).
- A "Submission Confirmation" block (Supplier, Contact, Delivery Days, Notes).
- A "Supplier Quoted Pricing" table with the submitted per-tier Quantity / Unit Price / Total.

Then submit a flat-price quotation (no tiers) and confirm the email shows the card + confirmation block with **Unit Price (HKD)** and **Total Price (HKD)** rows and **no** tier table.

If SMTP is unavailable locally, set the active profile to a [nodemailer Ethereal](https://ethereal.email) test account and view the captured message URL.

- [ ] **Step 7: Done — no commit (CLAUDE.md)**

Task 4 is complete when Steps 4–5 pass and the manual submit check (Step 6) confirms the email. Do not commit; the user commits when ready.

---

## Task 5: Browser integration — serve the module, expose on window, delete duplicates

**Files:**
- Modify: `server.js` — add the `/shared` static mount.
- Modify: `public/index.html` — add the deferred module `<script>` in `<head>`; delete the six duplicated inline definitions; update the two card callers.
- Create: `tests/unit/07-browser-module-wiring.test.js` — static Node checks that the module loader, the `/shared` mount, the caller conversions, and the six deletions all landed in `public/index.html` / `server.js`. No browser, no Playwright.

**Interfaces:**
- Consumes: the shared module at `/shared/quotationEmailHtml.js` (Task 1–3).
- Produces: `window.generateQuotationEmailHtml`, `window.PRODUCT_*`, `window.emailProductTypeDisplay`, `window.resolveProductDetailValue`, `window.formatFileSize`, `window.generateSupplierResponseTiersHtml` — assigned by the module script, accessible as bare globals by the existing inline code.

> **Why bare references keep working:** assigning `window.X = v` creates a real global `X`, so existing inline code that references these names bare (e.g. `PRODUCT_OPTION_LABELS` inside other functions) still resolves. All such references live inside functions invoked on user interaction (after the deferred module has run), so there is no load-time race. The static wiring test (Step 6) confirms the loader and deletions landed; any residual load-time `ReferenceError` would surface as a broken page during the manual check (Step 8).

- [ ] **Step 1: Serve `/shared` from the server**

In `server.js`, find the existing static mount near line 371:

```js
app.use(express.static(path.join(__dirname, 'public')));
```

Add immediately after it:

```js
app.use('/shared', express.static(path.join(__dirname, 'shared')));
```

- [ ] **Step 2: Add the deferred module loader in `<head>`**

In `public/index.html`, find the `<head>` opening tag and add this as the first child inside `<head>` (so it begins fetching early; it is deferred so it runs after parse regardless of position):

```html
    <script type="module">
      import * as Q from '/shared/quotationEmailHtml.js';
      Object.assign(window, {
        generateQuotationEmailHtml: Q.generateQuotationEmailHtml,
        generateSupplierResponseTiersHtml: Q.generateSupplierResponseTiersHtml,
        emailProductTypeDisplay: Q.emailProductTypeDisplay,
        resolveProductDetailValue: Q.resolveProductDetailValue,
        formatFileSize: Q.formatFileSize,
        PRODUCT_DETAILS_LABELS: Q.PRODUCT_DETAILS_LABELS,
        PRODUCT_OPTION_LABELS: Q.PRODUCT_OPTION_LABELS,
      });
    </script>
```

- [ ] **Step 3: Update the two card callers to the `opts` signature**

In `public/index.html`, replace the batch-send caller at line ~14181:

```js
      const emailHtml = generateQuotationEmailHtml(quotation, null, null, profileImageBase64, qrBase64, osRef, attachmentList);
```

with:

```js
      const emailHtml = generateQuotationEmailHtml(quotation, {
        brandName: getBrandName(quotation.brandId),
        profileImageSrc: profileImageBase64,
        qrBase64, osRef, attachmentList,
      });
```

Replace the reply caller at line ~22209:

```js
      const emailHtml = generateQuotationEmailHtml(quotation, emailMeta, originalEmailHtml, profileImageBase64);
```

with:

```js
      const emailHtml = generateQuotationEmailHtml(quotation, {
        brandName: getBrandName(quotation.brandId),
        profileImageSrc: profileImageBase64,
        emailMeta, originalEmailHtml,
      });
```

(`getBrandName` is defined at `public/index.html:23968` and resolves from `cachedBrands`.)

- [ ] **Step 4: Delete the six duplicated inline definitions**

Delete each block from `public/index.html`:

1. `function formatFileSize(bytes) { ... }` (~line 14265; the whole function through its closing brace at ~14270).
2. `function emailProductTypeDisplay(productType, productDetails) { ... }` (~line 15363–15371).
3. `const PRODUCT_DETAILS_LABELS = { ... };` (~line 15376–15409).
4. `const PRODUCT_OPTION_LABELS = { ... };` (~line 15414–15455).
5. `function resolveProductDetailValue(key, raw) { ... }` (~line 15458–15464).
6. `function generateQuotationEmailHtml(quotation, emailMeta, originalEmailHtml, profileImageBase64 = null, qrBase64 = null, osRef = '', attachmentList = []) { ... }` (~line 22255–22424; the whole function).

> **Do not delete** the sibling functions `emailProductDetailsRows`, `generateSupplierPortalEmailHtml`, `generateSupplierReminderEmailHtml` (~line 15483+), `generateQuotationPdfBase64` (~line 14310), or `getBrandName` (~line 23968). They remain and now reference the helpers via the `window` globals.

- [ ] **Step 5: Sanity-check no other inline callers broke**

Run a search for the old positional signature to confirm nothing else calls the deleted form:

Run: `grep -n "generateQuotationEmailHtml(" public/index.html`
Expected: exactly two hits — the two updated callers from Step 3 (now using the `opts` object form). No other call sites.

Run: `grep -nE "PRODUCT_OPTION_LABELS|PRODUCT_DETAILS_LABELS|emailProductTypeDisplay|resolveProductDetailValue|formatFileSize" public/index.html`
Expected: hits only inside function bodies that run on user interaction (e.g. `emailProductDetailsRows`, `generateSupplierPortalEmailHtml`, `generateQuotationPdfBase64`, the two card callers' surrounding code), plus the new `<script type="module">` import block. No top-level executable statement should reference these names.

- [ ] **Step 6: Write the static wiring test (Node — no browser, no Playwright)**

Create `tests/unit/07-browser-module-wiring.test.js`. It reads `public/index.html` and `server.js` as text and asserts the refactor landed:

```js
import fs from 'fs';
import { ok, summary } from './_helpers.js';

const root = new URL('../../', import.meta.url);
const indexHtml = fs.readFileSync(new URL('public/index.html', root), 'utf8');
const serverJs = fs.readFileSync(new URL('server.js', root), 'utf8');

// Module loader present in index.html
ok(indexHtml.includes('/shared/quotationEmailHtml.js'), 'index.html imports the shared module');
ok(indexHtml.includes('generateQuotationEmailHtml: Q.generateQuotationEmailHtml'), 'generateQuotationEmailHtml exposed on window');
ok(indexHtml.includes('PRODUCT_OPTION_LABELS: Q.PRODUCT_OPTION_LABELS'), 'PRODUCT_OPTION_LABELS exposed on window');

// The six duplicated inline definitions are gone
const removed = [
  'function formatFileSize(bytes)',
  'function emailProductTypeDisplay(productType, productDetails)',
  'const PRODUCT_DETAILS_LABELS = {',
  'const PRODUCT_OPTION_LABELS = {',
  'function resolveProductDetailValue(key, raw)',
  'function generateQuotationEmailHtml(quotation, emailMeta',
];
for (const needle of removed) {
  ok(!indexHtml.includes(needle), `inline definition removed: ${needle}`);
}

// Exactly two call sites remain, both converted to the opts form
const calls = indexHtml.match(/generateQuotationEmailHtml\(/g) || [];
ok(calls.length === 2, 'exactly two generateQuotationEmailHtml call sites remain');
ok(!indexHtml.includes('generateQuotationEmailHtml(quotation, null, null,'), 'batch-send caller converted to opts form');

// /shared static mount added
ok(serverJs.includes("app.use('/shared', express.static(path.join(__dirname, 'shared')))"), "server.js mounts /shared");

summary('browser module wiring (static checks)');
```

- [ ] **Step 7: Run the wiring test**

Run: `node tests/unit/07-browser-module-wiring.test.js`
Expected: PASS, exit code 0. If it fails on a `removed:` assertion, a deleted definition still lingers; if it fails on the call-site count, a caller wasn't converted.

- [ ] **Step 8: Manual verification — batch-send and reply (no regression)**

The user runs this in their own browser (no automation). With the app running (`npm start`):
1. Open a quotation and run the batch **Send** flow (the one that builds the PDF attachment). Inspect the delivered email: the QUOTATION card renders identically to before — header, meta band, attachment reminder, all sections, image, notes — and the PDF is still attached.
2. Open an email → **View** → Quotation → **Reply/Send** flow. Inspect the delivered email: the card renders plus the "Original Message" reply-quote block.

(If SMTP is unavailable locally, point the active profile at a nodemailer Ethereal test account and inspect the captured message URL.)

- [ ] **Step 9: Done — no commit (CLAUDE.md)**

Task 5 is complete when Step 7 passes and the manual check (Step 8) confirms no regression. Do not commit; the user commits when ready.

---

## Final verification

- [ ] Run the unit suite: `node tests/unit/06-quotation-email-html.test.js` and `node tests/unit/07-browser-module-wiring.test.js` → both PASS.
- [ ] Confirm the four spec §9 steps all landed in this branch: module created → server uses it → browser uses it → both flows verified (manual, by the user).

## Self-review notes (resolved before handoff)

- **Spec gap fixed:** `server.js` only served `public/` (`server.js:371`), so `/shared/...` would have 404'd in the browser. Added the `/shared` static mount as Task 5 Step 1. `server.js` is now in Files Touched.
- **Document-nesting avoided:** the shared module splits `generateQuotationCardHtml` (inner) from `generateQuotationEmailHtml` (full-doc wrapper); the server uses `buildSupplierConfirmationHtml` which composes a single well-formed document (card + confirmation + tiers).
- **Self-contained card:** layout styles inlined on elements (Task 2), so the card renders without the document `<style>` block — verified by Task 2 Step 1 assertions.
- **Graceful tiers:** `buildSupplierConfirmationHtml` shows the tier table only when tiers exist, otherwise flat Unit/Total rows — verified by Task 3 Step 1 (tiered + flat cases).
- **Bare-reference safety:** Task 5 Step 5 greps for residual references; Step 6's static Node wiring test asserts the loader + six deletions + caller conversions landed; Step 8's manual check catches any load-time `ReferenceError` (broken page).
- **`notes` escaping:** unchanged from the existing card (raw interpolation of trusted internal data). If `notes` is later shown from untrusted input, escape it then — out of scope here per spec §11.
