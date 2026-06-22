# Portal Full Product Info (All Product Types) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the supplier-portal hyperlink page render the same full product detail (Product Information / Customer Information / Brand Detail / Product Specifications) as email, PDF, View, and Compare already do — for every product type — by routing it through the one shared renderer.

**Architecture:** The four other routes already use `generateQuotationDetailSectionsHtml(quotation, opts)` in `shared/quotationEmailHtml.js`, a type-agnostic function that loops everything saved in `productDetails`. The portal currently has its own divergent `renderProductDetails()`. Change: the `GET /:token` route resolves `brandName` + `profileImageSrc`, calls that shared function, and returns `detailSectionsHtml`; the portal injects it and its dead renderer is deleted. No per-type code — whatever is saved in the DB shows, on every route.

**Tech Stack:** Node.js + Express (ESM), SQLite (`sqlite`/`sqlite3`), vanilla JS portal page, jsPDF unaffected. Tests run with plain `node tests/unit/NN-*.test.js`.

## Global Constraints

- **NO git operations.** Never run `git add` / `commit` / `push` / `stage` or any repo-modifying git command. Each task ends with a **review checkpoint** (show the diff, stop for the user's go-ahead) — never a commit.
- **NO Playwright / browser automation.** Manual verification only (curl + the user opens the page in their own browser).
- Reuse the existing shared renderer — do **not** duplicate product-detail rendering logic in the portal.
- Edits use exact-string find/replace (the file's line numbers are unstable because the supporting-documents feature was just added). Locate blocks by their content.

---

### Task 1: Backend — return `detailSectionsHtml` from `GET /:token`

**Files:**
- Create: `tests/unit/11-supplier-portal-detail-sections.test.js`
- Modify: `routes/supplier-portal.js` (inside the `GET /:token` handler, before its `res.json({...})`)

**Interfaces:**
- Consumes: `generateQuotationDetailSectionsHtml` (already imported at `routes/supplier-portal.js:8`); `db` (already in scope in the handler via `const db = await getTasksDb()`).
- Produces: the `GET /api/supplier-portal/:token` JSON response gains a top-level `detailSectionsHtml` string — the four rendered detail sections. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/11-supplier-portal-detail-sections.test.js`:

```js
// Integration test for Task 1: GET /api/supplier-portal/:token must return a
// server-rendered `detailSectionsHtml` — the SAME shared renderer used by
// email / PDF / View / Compare — so the portal shows full Product Information /
// Customer / Brand / Product Specifications for every product type.
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import multer from 'multer';
import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const { getTasksDb, resetTasksDbForTest } = await import('../../db/tasksDb.js');
const { createSupplierPortalRoutes } = await import('../../routes/supplier-portal.js');

await resetTasksDbForTest();
const db = await getTasksDb();

const now = new Date().toISOString();
const future = new Date(Date.now() + 86400000).toISOString();
const QID = 600, SID = 1, MID = 1, BID = 7;

// Brand for the Brand Detail section (createdAt/updatedAt are NOT NULL).
await db.run(`INSERT INTO brands (id, name, createdAt, updatedAt) VALUES (?, 'Acme Brand', ?, ?)`, [BID, now, now]);

// A filled PU Patch quotation: productType='outsource' + _productTag='pu-patch'.
// productDetails carries the pu-patch specs; customer/contact/variable/brand live on the row.
await db.run(
  `INSERT INTO quotations (id, customerName, contactPerson, email, phone, variable, brandId, customerItemName, height_mm, width_mm, productType, productDetails, quantity, unitPrice, total, dateCreated, status)
   VALUES (?, 'Test Cust', 'Jane', 'jane@test.com', '555-0100', 'NO', ?, 'SKU-1', 50, 80, 'outsource', ?, 1000, 1.5, 1500, ?, 'draft')`,
  [QID, BID, JSON.stringify({
    _productTag: 'pu-patch',
    material: 'PU Leather',
    thickness: '2mm',
    screenPrint: '2',
    hotPress: 'YES',
    edge: 'Paint',
    metalEmbedded: 'NO',
    remark: 'sample remark',
    tierScopeMode: 'brand',
    brandTierTableId: 1,
    tiers: [{ quantity: 1000, unitPrice: 0 }],
  }), now]
);

await db.run(`INSERT INTO suppliers (id, companyName, emailDomain, companyType, createdAt, updatedAt) VALUES (?, 'Test Supplier', 'test.com', 'Factory', ?, ?)`, [SID, now, now]);
await db.run(`INSERT INTO supplier_members (id, supplierId, name, createdAt, updatedAt) VALUES (?, ?, 'Test Member', ?, ?)`, [MID, SID, now, now]);
await db.run(`INSERT INTO supplier_quotation_tokens (id, token, quotationId, supplierId, supplierMemberId, expiresAt, createdAt) VALUES (1, 'tok-detail-1', ?, ?, ?, ?, ?)`, [QID, SID, MID, future, now]);

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-pd-'));
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
});

const app = express();
app.use(express.json());
app.use('/api/supplier-portal', createSupplierPortalRoutes({ upload }));

const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

// GET /:token now returns detailSectionsHtml
let r = await fetch(`${base}/api/supplier-portal/tok-detail-1`);
let d = await r.json();
eq(r.status, 200, 'GET :token -> 200');
eq(d.success, true, 'GET :token -> success');
ok(typeof d.detailSectionsHtml === 'string' && d.detailSectionsHtml.length > 0, 'response includes detailSectionsHtml');

// All four section headings are present
ok(d.detailSectionsHtml.includes('Product Information'), 'has Product Information section');
ok(d.detailSectionsHtml.includes('Customer Information'), 'has Customer Information section');
ok(d.detailSectionsHtml.includes('Brand Detail'), 'has Brand Detail section');
ok(d.detailSectionsHtml.includes('Product Specifications'), 'has Product Specifications section');

// Resolved brand name, decoded product type, and a decoded pu-patch spec value
ok(d.detailSectionsHtml.includes('Acme Brand'), 'resolves brand name');
ok(d.detailSectionsHtml.includes('PU Patch'), 'shows decoded PU Patch product type');
ok(d.detailSectionsHtml.includes('PU Leather'), 'shows pu-patch Material value');

// Internal tier-config keys never leak into the spec list
ok(!d.detailSectionsHtml.includes('brandTierTableId'), 'internal tier-config keys are hidden');
ok(!d.detailSectionsHtml.includes('tierScopeMode'), 'internal tierScopeMode is hidden');

// Invalid token -> 404 (unchanged)
r = await fetch(`${base}/api/supplier-portal/no-such-token`);
eq(r.status, 404, 'invalid token -> 404');

server.close();
summary('11-supplier-portal-detail-sections');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/unit/11-supplier-portal-detail-sections.test.js`
Expected: FAIL — the assertion `response includes detailSectionsHtml` fails (the response has no `detailSectionsHtml` yet).

- [ ] **Step 3: Implement — render + return `detailSectionsHtml`**

In `routes/supplier-portal.js`, inside the `GET /:token` handler, find this exact block (it sits just before `res.json({`):

```js
    // Attach the supplier's previously-submitted per-tier prices (normalized table).
    if (existingResponse) {
      const tierRows = await getSupplierQuotationResponseTiers(existingResponse.id);
      existingResponse.tiers = tierRows.map((t) => ({
        tierIndex: t.tierIndex, quantity: t.quantity, unitPrice: t.unitPrice, total: t.total
      }));
    }

    res.json({
```

Replace it with (adds the render block before `res.json({`):

```js
    // Attach the supplier's previously-submitted per-tier prices (normalized table).
    if (existingResponse) {
      const tierRows = await getSupplierQuotationResponseTiers(existingResponse.id);
      existingResponse.tiers = tierRows.map((t) => ({
        tierIndex: t.tierIndex, quantity: t.quantity, unitPrice: t.unitPrice, total: t.total
      }));
    }

    // Render the same shared detail sections used by email / PDF / View / Compare, so
    // the portal shows full Product Information / Customer / Brand / Product
    // Specifications for every product type (identical to the other routes).
    let brandName = 'N/A';
    try {
      if (quotation.brandId) {
        const brand = await db.get('SELECT name FROM brands WHERE id = ?', [quotation.brandId]);
        if (brand && brand.name) brandName = brand.name;
      }
    } catch (e) { /* keep N/A */ }
    const profileImageSrc = quotation.hasProfileImage
      ? `/api/quotations/${quotation.id}/profile-image`
      : null;
    const detailSectionsHtml = generateQuotationDetailSectionsHtml(quotation, { brandName, profileImageSrc });

    res.json({
```

Then, in the same handler's response object, find:

```js
      alreadySubmitted: !!existingResponse,
      existingResponse: existingResponse || null
    });
```

Replace with (adds `detailSectionsHtml` to the payload):

```js
      alreadySubmitted: !!existingResponse,
      existingResponse: existingResponse || null,
      detailSectionsHtml
    });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/unit/11-supplier-portal-detail-sections.test.js`
Expected: PASS — prints `11-supplier-portal-detail-sections ... ok` (per the `_helpers.js` `summary` convention; no thrown errors).

- [ ] **Step 5: Sanity — existing portal route test still passes**

Run: `node tests/unit/10-supplier-files-routes.test.js`
Expected: PASS (the `GET /:token` change is additive; file routes untouched).

- [ ] **Step 6: Review checkpoint**

Show the diff of `routes/supplier-portal.js` and the new test file. **Stop and wait for the user's go-ahead.** Do not run any git command.

---

### Task 2: Frontend — portal injects `detailSectionsHtml`, dead renderer deleted

**Files:**
- Modify: `public/supplier-portal.html` (the `<div class="info-section">` block; the `loadQuotation` body; delete `formatProductType` / `detailLabels` / `renderProductDetails`)

**Interfaces:**
- Consumes: `data.detailSectionsHtml` (the string produced by Task 1's `GET /:token`).
- Produces: the portal "Quotation Details" area now renders the four shared sections. No JS exports.

- [ ] **Step 1: Replace the info-section HTML**

In `public/supplier-portal.html`, find this exact block:

```html
      <div class="info-section">
        <h2>Quotation Details</h2>
        <div id="profileImageSection" style="margin-bottom:16px; display:none;">
          <img id="profileImage" style="max-width:100%; max-height:200px; object-fit:contain; border:1px solid #000;">
        </div>
        <div class="info-row" id="customerItemNameRow" style="display:none;"><span class="info-label">Customer Item</span><span class="info-value" id="customerItemName"></span></div>
        <div class="info-row"><span class="info-label">Customer</span><span class="info-value" id="customerName"></span></div>
        <div class="info-row"><span class="info-label">Product Type</span><span class="info-value" id="productType"></span></div>
        <div id="productDetailsHtml"></div>
        <div class="info-row" id="notesRow" style="display:none;"><span class="info-label">Notes</span><span class="info-value" id="notes"></span></div>
      </div>
```

Replace with:

```html
      <div class="info-section">
        <h2>Quotation Details</h2>
        <div id="detailSections"><!-- server-rendered Product Information / Customer / Brand / Product Specifications (same as email / PDF / View / Compare) --></div>
        <div class="info-row" id="notesRow" style="display:none;"><span class="info-label">Notes</span><span class="info-value" id="notes"></span></div>
      </div>
```

(The product image now renders inside `detailSectionsHtml`, under Product Specifications — matching the email.)

- [ ] **Step 2: Replace the `loadQuotation` detail-rendering calls**

Find this exact block:

```js
        document.getElementById('customerName').textContent = data.quotation.customerName || '-';
        document.getElementById('productType').textContent = formatProductType(data.quotation.productType) || '-';

        // Apply the quotation's currency to all price labels
        applyCurrencyLabels(data.quotation.currency || 'HKD');

        // Format product details as HTML rows
        renderProductDetails(data.quotation);
```

Replace with:

```js
        // Apply the quotation's currency to all price labels
        applyCurrencyLabels(data.quotation.currency || 'HKD');

        // Inject the server-rendered detail sections (Product Information / Customer /
        // Brand / Product Specifications) — identical to email / PDF / View / Compare.
        document.getElementById('detailSections').innerHTML = data.detailSectionsHtml || '';
```

- [ ] **Step 3: Remove the now-dead profile-image block in `loadQuotation`**

Find:

```js
        // Show profile image if available
        if (data.quotation.hasProfileImage) {
          document.getElementById('profileImageSection').style.display = 'block';
          document.getElementById('profileImage').src = `/api/quotations/${data.quotation.id}/profile-image`;
        }

```

Replace with a single blank line (i.e. delete the block). The image is now part of `detailSectionsHtml`.

- [ ] **Step 4: Remove the now-dead customer-item-name block in `loadQuotation`**

Find:

```js
        // Show customer item name if available
        if (data.quotation.customerItemName) {
          document.getElementById('customerItemNameRow').style.display = 'flex';
          document.getElementById('customerItemName').textContent = data.quotation.customerItemName;
        }

```

Replace with a single blank line (delete the block). Customer Item Name now renders inside `detailSectionsHtml`.

- [ ] **Step 5: Delete the three dead helpers — `formatProductType`, `detailLabels`, `renderProductDetails`**

These three blocks are contiguous. Find this exact span:

```js
    // Format product type to readable name
    function formatProductType(type) {
      const names = {
        'hang-tag': 'Hang Tag', 'woven-label': 'Woven Label', 'printed-label': 'Printed Label',
        'heat-transfer': 'Heat Transfer', 'silicon-patch': 'Silicon Patch',
        'embroidery-patch': 'Embroidery Patch', 'outsource': 'Outsource', 'other': 'Other'
      };
      return names[type] || type || '-';
    }

    // Friendly labels for product detail keys
    const detailLabels = {
      material: 'Material', size: 'Size', printingMethod: 'Printing Method',
      colorCount: 'Color Count', edgeFinish: 'Edge Finish',
      materialType: 'Material Type', frontColor: 'Front Color', backColor: 'Back Color',
      transferType: 'Transfer Type', application: 'Application Method',
      thickness: 'Thickness', colorMode: 'Color Mode', backingType: 'Backing Type',
      designComplexity: 'Design Complexity',
      stitchType: 'Stitch Type', borderType: 'Border Type', threadColorCount: 'Thread Color Count',
      productDescription: 'Description', category: 'Category', complexity: 'Complexity',
      _productTag: null // hidden internal field
    };

    // Render product details object as HTML info-rows. Mirrors the email HTML
    // (shared/quotationEmailHtml.js): Height/Width live on the quotation root (not in
    // productDetails) and empty spec values are omitted rather than shown as "-".
    function renderProductDetails(quotation) {
      const container = document.getElementById('productDetailsHtml');
      const details = quotation && quotation.productDetails;
      const productType = quotation && quotation.productType;
      if (!details || typeof details !== 'object') {
        container.innerHTML = '<div class="info-row"><span class="info-label">Product Details</span><span class="info-value">' + (details || '-') + '</span></div>';
        return;
      }
      let html = '';
      // Show the actual product type if it's an outsource with _productTag
      if (productType === 'outsource' && details._productTag) {
        html += '<div class="info-row"><span class="info-label">Product Type</span><span class="info-value">' + formatProductType(details._productTag) + '</span></div>';
      }
      // Height / Width (stored on the quotation root, same source as the email HTML)
      if (quotation.height_mm !== null && quotation.height_mm !== undefined && quotation.height_mm !== '') {
        html += '<div class="info-row"><span class="info-label">Height (mm, unfolded)</span><span class="info-value">' + quotation.height_mm + '</span></div>';
      }
      if (quotation.width_mm !== null && quotation.width_mm !== undefined && quotation.width_mm !== '') {
        html += '<div class="info-row"><span class="info-label">Width (mm, unfolded)</span><span class="info-value">' + quotation.width_mm + '</span></div>';
      }
      // Internal/non-display keys: _-prefixed fields, tier config, tier-table ids, and
      // quantity (the buyer's requested quantity is shown in the pricing tiers, not as a
      // spec row). Mirrors INTERNAL_PRODUCT_DETAIL_KEYS in shared/quotationEmailHtml.js.
      const INTERNAL_DETAIL_KEYS = ['tiers', 'tierScopeMode', 'brandTierTableId', 'customerTierTableId', 'quantity'];
      for (const [key, value] of Object.entries(details)) {
        if (key.startsWith('_')) continue; // skip internal fields
        if (INTERNAL_DETAIL_KEYS.includes(key)) continue; // internal config / duplicate — not a display spec
        if (value === null || value === undefined || value === '') continue; // omit empty specs (matches email HTML)
        const label = detailLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        html += '<div class="info-row"><span class="info-label">' + label + '</span><span class="info-value">' + value + '</span></div>';
      }
      container.innerHTML = html;
    }
```

Replace with a single blank line (delete the whole span — all three helpers are now unused).

- [ ] **Step 6: Verify no dangling references remain**

Search `public/supplier-portal.html` for each of these — every one must return **zero** matches:
- `productDetailsHtml`
- `profileImageSection`
- `customerItemNameRow`
- `formatProductType`
- `renderProductDetails`
- `detailLabels`
- `getElementById('customerName')`
- `getElementById('productType')`

(If any match remains, an edit in Steps 1–5 was incomplete — fix it before continuing. Note: `supplierName` / `companyName` / `notes` / `notesRow` MUST still be present — those are intentionally retained.)

- [ ] **Step 7: Manual verification (no Playwright)**

1. Start the app: `node server.js`.
2. Generate/open a real supplier portal link for any quotation (e.g. quotation #265 — a filled PU Patch). The token link format is `http://localhost:3000/supplier-portal/<token>`.
3. In a browser, open that link. Confirm the **Quotation Details** area shows the four sections — **Product Information** (Product Type = PU Patch, Variable), **Customer Information** (name/contact/email/phone), **Brand Detail** (brand name), **Product Specifications** (Customer Item Name, Height, Width, Material, Thickness, Screen Print, Hot Press, Edge, Metal Embedded) — and that there are no console errors. The Notes row still appears when the quotation has notes.
4. Repeat with quotation #266 (empty PU Patch): confirm the four section headings still show, with only the filled fields (Customer Item Name, Remark) under Product Specifications.
5. Stop the server.

- [ ] **Step 8: Review checkpoint**

Show the diff of `public/supplier-portal.html`. **Stop and wait for the user's go-ahead.** Do not run any git command.

---

## Self-Review (run after writing, before handoff)

- **Spec coverage:** Spec §4a (backend render + return) → Task 1. Spec §4b (portal inject + delete dead renderer) → Task 2. Spec §7 (test) → Task 1 test. ✅
- **Placeholder scan:** No TBD/TODO; every code step contains the exact find/replace strings. ✅
- **Type consistency:** `detailSectionsHtml` is the name used in the Task 1 response, the Task 1 test, and the Task 2 injection — consistent. ✅
- **Out-of-scope items** from spec §6 (`lastSampleCardDate` leak, pu-patch field-storage normalization) are deliberately **not** tasks — they don't affect route parity. ✅
