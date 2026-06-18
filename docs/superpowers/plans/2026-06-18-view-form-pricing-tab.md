# View-Form Pricing Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the quotation/outsourcing **view** form the same pricing controls as the create form (mode dropdown + tier-table pickers + tier grid), displayed read-only in view mode and fully editable in the existing inline-edit mode, persisting through the unchanged save path.

**Architecture:** One frontend function (`generateQuotationContentForView`) gains an inline pricing section (no mini-tab buttons — single-scroll preserved). A new `populateViewPricing` renders it read-only in view mode; the existing scope-aware `initPricingMode(scope)` is extended with an optional `seedPricing` argument so inline-edit seeds the saved selection using its own private helpers (avoids the closure/race problem). `saveInlineQuotationEdit` already calls `collectProductDetailsFromForm`, which already collects the `pricing` shape — so saves work with zero save-path changes. `getActiveQuotationContainer()` already returns `quotationViewFormContainer` first.

**Tech Stack:** Vanilla JS + inline HTML (`public/index.html`), Express backend (unchanged), Playwright E2E (`npx playwright test … --project=chromium`, server on :5999).

## Global Constraints

- All edits are in `public/index.html` (plus one new test file). No backend changes, no new API endpoints.
- View form stays **single-scroll** — no mini-tab buttons, no `#miniTabDetails`/`#miniTabPricing` wrappers. `initMiniQuotationTabs` is NOT used.
- Tier-table ID ↔ name mapping is preserved: UI value `'factory'` ⇄ stored `tierScopeMode:'customer'`; `'none'` ⇄ no tiers.
- Saved tiers (`productDetails.pricing.tiers`) are the **source of truth** for display — never re-fetch tiers from the tier table when seeding/viewing saved data.
- Flat field IDs (`#quotationQuantity` / `#quotationUnitPrice` / `#quotationTotal`) are unchanged; they move inside `#flatPricingSection`. No duplicate IDs anywhere.
- Pricing controls that the create flow already defines (`#pricingModeSelect`, `#brandTierWrap`, `#brandTierTableSelect`, `#customerTierWrap`, `#customerTierTableSelect`, `#flatPricingSection`, `#tierPricingSection`, `#tierRows`, `#addTierRowBtn`) are reused verbatim so `initPricingMode` behaves identically.
- The create flow calls `initPricingMode(scope)` with one argument — the new second argument defaults to `null`, so create-flow behavior is unchanged.
- Tests run via `npx playwright test tests/unit-pricing-view.spec.js --project=chromium` (Playwright auto-starts `npm start` on :5999; webServer env carries `PLAYWRIGHT_TEST=true`).

## File Structure (this plan)

- **Modify** `public/index.html`:
  - `generateQuotationContentForView` (~18884) — replace the flat "Quantity & Pricing" block (~18978-18994) with the inline pricing section.
  - `viewQuotationDetails` (~16705) — call `populateViewPricing(quotation, viewContainer)` after `populateQuotationViewForm`.
  - `editQuotationFromView` (~16899) — hide `#viewTierTableLabel` and call `initPricingMode(formContainer, savedPricing)`.
  - `initPricingMode` (~19415) — add `seedPricing = null` parameter + `seedPricingIntoGrid` closure.
  - New helper `populateViewPricing(quotation, scope)` (define near `initPricingMode`).
- **Create** `tests/unit-pricing-view.spec.js` — Playwright: view display, edit-and-persist, backward-compat.

---

### Task 1: Inline pricing section HTML + read-only view-mode display

**Files:**
- Modify: `public/index.html` — `generateQuotationContentForView` flat block (~18978-18994); `viewQuotationDetails` setTimeout (~16705-16708).
- Test: `tests/unit-pricing-view.spec.js`

**Interfaces:**
- Produces (DOM, inside `#quotationViewFormContainer`): `#pricingModeSelect`, `#viewTierTableLabel` (new, `display:none`), `#brandTierWrap`/`#brandTierTableSelect`, `#customerTierWrap`/`#customerTierTableSelect`, `#flatPricingSection` (contains the existing `#quotationQuantity`/`#quotationUnitPrice`/`#quotationTotal`), `#tierPricingSection`/`#tierRows`/`#addTierRowBtn`.
- Produces (JS): `async function populateViewPricing(quotation, scope)` — renders the saved pricing read-only. No-op (beyond disabling the mode select) when there is no `pricing` block or mode is `none`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit-pricing-view.spec.js`:

```js
import { test, expect, request } from '@playwright/test';

const uniq = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test('view form shows saved brand-tier pricing read-only with fetched table name', async ({ page, request: req }) => {
  // Seed brand + brand-scoped tier table
  const brandName = uniq('Brand');
  const brandRes = await req.post('/api/brands', { data: { name: brandName } });
  const brandId = (await brandRes.json()).brand.id;
  const tableName = uniq('BrandTiers');
  await req.post('/api/pricing-tier-tables', {
    data: { name: tableName, scope: 'brand', brandId, brandName, tiers: [{ quantity: 1000, unitPrice: 0.5 }, { quantity: 5000, unitPrice: 0.4 }] },
  });

  // Create a quotation saved in brand tier mode via the create flow
  const customerName = uniq('Cust');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.click('[data-testid="menu-quotation"]');
  await page.click('[data-testid="quotation-create-btn"]');
  await page.click('[data-testid="hang-tag-btn"]');
  await page.fill('#quotationCustomerName', customerName);
  await page.fill('#quotationEmail', `${uniq('buyer')}@example.com`);
  await page.fill('#quotationMaterial', 'Cotton');
  await page.fill('#quotationSize', '5x5 cm');
  await page.fill('#quotationPrintingMethod', 'Screen');
  await page.selectOption('#quotationBrandId', String(brandId));
  await page.evaluate(() => {
    const d = document.getElementById('miniTabDetails'); if (d) d.style.display = 'none';
    const p = document.getElementById('miniTabPricing'); if (p) p.style.display = 'block';
  });
  await page.waitForSelector('#pricingModeSelect');
  await page.evaluate(() => document.getElementById('pricingModeSelect').focus());
  await page.selectOption('#pricingModeSelect', 'brand');
  await page.waitForSelector('.tier-row .tier-qty');
  await page.click('button:has-text("SAVE")');
  await page.locator('button:has-text("No")').click().catch(() => {});

  // Find the created quotation id
  await page.waitForTimeout(500);
  const list = await req.get('/api/quotations');
  const data = await list.json();
  const all = Array.isArray(data) ? data : (data.quotations || data.rows || []);
  const created = all
    .filter((q) => (q.customerName || '') === customerName)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
  expect(created, 'saved quotation found').toBeTruthy();

  // Open the view form for it
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async (id) => {
    await window.viewQuotationDetails(id);
  }, created.id);
  await page.waitForSelector('#quotationViewFormContainer #pricingModeSelect');

  // Assert read-only view-mode pricing display
  const vc = page.locator('#quotationViewFormContainer');
  await expect(vc.locator('#pricingModeSelect')).toHaveValue('brand');
  await expect(vc.locator('#pricingModeSelect')).toBeDisabled();
  await expect(vc.locator('#viewTierTableLabel')).toContainText(tableName);
  await expect(vc.locator('#flatPricingSection')).toBeHidden();
  await expect(vc.locator('#tierPricingSection')).toBeVisible();
  await expect(vc.locator('#addTierRowBtn')).toBeHidden();
  const qtys = await vc.locator('.tier-row .tier-qty').evaluateAll((els) => els.map((e) => e.value));
  expect(qtys).toEqual(['1000', '5000']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/unit-pricing-view.spec.js --project=chromium`
Expected: FAIL — `#quotationViewFormContainer #pricingModeSelect` does not exist (the view form has no pricing controls yet), or `#viewTierTableLabel` not found.

- [ ] **Step 3: Replace the flat block with the inline pricing section**

In `public/index.html`, in `generateQuotationContentForView` (~18978-18994), replace this exact block:

```js
            '<div style="margin-bottom:20px;">' +
              '<h4>Quantity & Pricing</h4>' +
              '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px;">' +
                '<div>' +
                  '<label style="display:block; margin-bottom:5px; font-weight:600;">Quantity *</label>' +
                  '<input type="number" id="quotationQuantity" style="width:100%; padding:4px; font-size:12px; border:1px solid #ccc;" placeholder="1000" min="1" value="' + (quotation.quantity || '') + '">' +
                '</div>' +
                '<div>' +
                  '<label style="display:block; margin-bottom:5px; font-weight:600;">Unit Price (HKD)</label>' +
                  '<input type="number" id="quotationUnitPrice" style="width:100%; padding:4px; font-size:12px; border:1px solid #ccc;" placeholder="0.50" step="0.01" min="0" value="' + (quotation.unitPrice ? quotation.unitPrice.toFixed(2) : '') + '">' +
                '</div>' +
                '<div>' +
                  '<label style="display:block; margin-bottom:5px; font-weight:600;">Total (Auto)</label>' +
                  '<input type="text" id="quotationTotal" style="width:100%; padding:4px; font-size:12px; border:1px solid #ccc; background:#f5f5f5;" readonly value="' + (quotation.total ? quotation.total.toFixed(2) : '') + '">' +
                '</div>' +
              '</div>' +
            '</div>' +
```

with:

```js
            '<div style="margin-bottom:20px;">' +
              '<h4>Quantity & Pricing</h4>' +
              '<div style="margin-bottom:16px;">' +
                '<label style="display:block; margin-bottom:5px; font-weight:600;">Pricing Mode</label>' +
                '<select id="pricingModeSelect" style="width:220px; padding:4px; font-size:12px; border:1px solid #ccc;">' +
                  '<option value="none" selected>None (flat)</option>' +
                '</select>' +
                '<div id="viewTierTableLabel" style="margin-top:6px; font-size:12px; color:#444; display:none;"></div>' +
                '<div id="brandTierWrap" style="margin-top:10px; display:none;">' +
                  '<label style="font-size:12px; display:block; margin-bottom:4px;">Brand tier table</label>' +
                  '<select id="brandTierTableSelect" style="width:100%; padding:4px; border:1px solid #ccc;"><option value="">Select…</option></select>' +
                '</div>' +
                '<div id="customerTierWrap" style="margin-top:10px; display:none;">' +
                  '<label style="font-size:12px; display:block; margin-bottom:4px;">Garment-factory tier table</label>' +
                  '<select id="customerTierTableSelect" style="width:100%; padding:4px; border:1px solid #ccc;"><option value="">Select…</option></select>' +
                '</div>' +
              '</div>' +
              '<div id="flatPricingSection" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px;">' +
                '<div>' +
                  '<label style="display:block; margin-bottom:5px; font-weight:600;">Quantity *</label>' +
                  '<input type="number" id="quotationQuantity" style="width:100%; padding:4px; font-size:12px; border:1px solid #ccc;" placeholder="1000" min="1" value="' + (quotation.quantity || '') + '">' +
                '</div>' +
                '<div>' +
                  '<label style="display:block; margin-bottom:5px; font-weight:600;">Unit Price (HKD)</label>' +
                  '<input type="number" id="quotationUnitPrice" style="width:100%; padding:4px; font-size:12px; border:1px solid #ccc;" placeholder="0.50" step="0.01" min="0" value="' + (quotation.unitPrice ? quotation.unitPrice.toFixed(2) : '') + '">' +
                '</div>' +
                '<div>' +
                  '<label style="display:block; margin-bottom:5px; font-weight:600;">Total (Auto)</label>' +
                  '<input type="text" id="quotationTotal" style="width:100%; padding:4px; font-size:12px; border:1px solid #ccc; background:#f5f5f5;" readonly value="' + (quotation.total ? quotation.total.toFixed(2) : '') + '">' +
                '</div>' +
              '</div>' +
              '<div id="tierPricingSection" style="display:none; border:1px solid #ccc; padding:10px; margin-top:10px; background:#fafafa;">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
                  '<div style="font-weight:600;">Tiers</div>' +
                  '<button type="button" id="addTierRowBtn" class="btn" style="padding:4px 8px; font-size:12px;">+ Add Tier</button>' +
                '</div>' +
                '<div style="display:grid; grid-template-columns:1fr 1fr 1fr 80px; gap:8px; font-size:12px; margin-bottom:6px;">' +
                  '<div style="font-weight:600;">Quantity</div>' +
                  '<div style="font-weight:600;">Unit Price</div>' +
                  '<div style="font-weight:600;">Total</div>' +
                  '<div></div>' +
                '</div>' +
                '<div id="tierRows"></div>' +
              '</div>' +
            '</div>' +
```

- [ ] **Step 4: Add `populateViewPricing` and call it from `viewQuotationDetails`**

First, define the helper. In `public/index.html`, immediately **before** `function initPricingMode(scope) {` (~19415), insert:

```js
    // Render saved pricing read-only in the view form (does NOT call initPricingMode).
    async function populateViewPricing(quotation, scope) {
      const s = scope || document;
      const modeSel = s.querySelector('#pricingModeSelect');
      if (!modeSel) return;
      const flatSec = s.querySelector('#flatPricingSection');
      const tierSec = s.querySelector('#tierPricingSection');
      const rowsWrap = s.querySelector('#tierRows');
      const addBtn = s.querySelector('#addTierRowBtn');
      const label = s.querySelector('#viewTierTableLabel');
      const brandWrap = s.querySelector('#brandTierWrap');
      const custWrap = s.querySelector('#customerTierWrap');

      const pricing = (quotation && quotation.productDetails && quotation.productDetails.pricing) || null;
      const mode = pricing ? pricing.tierScopeMode : 'none';
      const hasTiers = pricing && Array.isArray(pricing.tiers) && pricing.tiers.length > 0;

      if (!pricing || mode === 'none' || !hasTiers) {
        modeSel.value = 'none';
        modeSel.disabled = true;
        return; // flat section already populated; tier section stays hidden (display:none)
      }

      const uiMode = mode === 'customer' ? 'factory' : mode;
      modeSel.value = uiMode;
      modeSel.disabled = true;
      if (flatSec) flatSec.style.display = 'none';
      if (tierSec) tierSec.style.display = 'block';
      if (brandWrap) brandWrap.style.display = 'none';
      if (custWrap) custWrap.style.display = 'none';
      if (addBtn) addBtn.style.display = 'none';

      // Fetch the saved tier-table name for the read-only label
      const tableId = uiMode === 'brand' ? pricing.brandTierTableId : pricing.customerTierTableId;
      let nameText = '';
      if (tableId != null) {
        try {
          const res = await fetch('/api/pricing-tier-tables/' + encodeURIComponent(tableId));
          const data = await res.json();
          nameText = (data && data.success && data.table && data.table.name) ? data.table.name : '';
        } catch (e) { nameText = ''; }
      }
      const scopeLabel = uiMode === 'brand' ? 'Brand tier table' : 'Garment-factory tier table';
      if (label) {
        label.textContent = nameText ? (scopeLabel + ': ' + nameText) : (scopeLabel + ': (table no longer available)');
        label.style.display = 'block';
      }

      // Render read-only tier rows from saved tiers (source of truth)
      if (rowsWrap) {
        rowsWrap.innerHTML = '';
        pricing.tiers.forEach((t) => {
          const q = Number(t.quantity || 0);
          const u = Number(t.unitPrice || 0);
          const row = document.createElement('div');
          row.className = 'tier-row';
          row.style.cssText = 'display:grid; grid-template-columns:1fr 1fr 1fr 80px; gap:8px; margin-bottom:6px;';
          row.innerHTML =
            '<input type="number" class="tier-qty" value="' + q + '" disabled style="padding:4px; border:1px solid #ccc; background:#f5f5f5;">' +
            '<input type="number" class="tier-unit" value="' + u.toFixed(2) + '" disabled style="padding:4px; border:1px solid #ccc; background:#f5f5f5;">' +
            '<input type="text" class="tier-total" value="' + (q * u).toFixed(2) + '" readonly style="padding:4px; border:1px solid #ccc; background:#f5f5f5;">' +
            '<span></span>';
          rowsWrap.appendChild(row);
        });
      }
    }

```

Second, call it. In `viewQuotationDetails`, the setTimeout at ~16705-16708 currently is:

```js
      // Populate the form with quotation data after DOM is fully ready
      setTimeout(() => {
        const viewContainer = document.getElementById('quotationViewFormContainer');
        populateQuotationViewForm(quotation, viewContainer);
      }, 100);
```

Replace it with:

```js
      // Populate the form with quotation data after DOM is fully ready
      setTimeout(() => {
        const viewContainer = document.getElementById('quotationViewFormContainer');
        populateQuotationViewForm(quotation, viewContainer);
        populateViewPricing(quotation, viewContainer);
      }, 100);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/unit-pricing-view.spec.js --project=chromium`
Expected: PASS — view form shows `#pricingModeSelect` disabled at `brand`, `#viewTierTableLabel` contains the table name, flat section hidden, tier section visible, `#addTierRowBtn` hidden, tier quantities `['1000','5000']`.

- [ ] **Step 6: Commit**

```bash
git add public/index.html tests/unit-pricing-view.spec.js
git commit -m "feat(ui): inline pricing section + read-only view-mode display in quotation view

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Edit-mode seeding via `initPricingMode(scope, seedPricing)`

**Files:**
- Modify: `public/index.html` — `initPricingMode` signature + tail (~19415, ~19612-19615); `editQuotationFromView` tail (~16899).
- Test: `tests/unit-pricing-view.spec.js` (append a second test).

**Interfaces:**
- Consumes: the DOM produced by Task 1; the saved `quotation.productDetails.pricing`.
- Produces: `initPricingMode(scope, seedPricing = null)` — when `seedPricing` is a non-`none` pricing object with tiers, seeds the mode/picker/grid from it (using the function's private `addTierRow`/`refreshBrandPicker`/`refreshCustomerPicker`/`syncBaseFromTiers`); otherwise behaves exactly as today (create flow).

- [ ] **Step 1: Write the failing test**

Append to `tests/unit-pricing-view.spec.js`:

```js
test('inline-edit seeds saved brand tier, edits persist on save', async ({ page, request: req }) => {
  const brandName = uniq('Brand');
  const brandRes = await req.post('/api/brands', { data: { name: brandName } });
  const brandId = (await brandRes.json()).brand.id;
  const tableName = uniq('BrandTiers');
  await req.post('/api/pricing-tier-tables', {
    data: { name: tableName, scope: 'brand', brandId, brandName, tiers: [{ quantity: 1000, unitPrice: 0.5 }, { quantity: 5000, unitPrice: 0.4 }] },
  });

  const customerName = uniq('Cust');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.click('[data-testid="menu-quotation"]');
  await page.click('[data-testid="quotation-create-btn"]');
  await page.click('[data-testid="hang-tag-btn"]');
  await page.fill('#quotationCustomerName', customerName);
  await page.fill('#quotationEmail', `${uniq('buyer')}@example.com`);
  await page.fill('#quotationMaterial', 'Cotton');
  await page.fill('#quotationSize', '5x5 cm');
  await page.fill('#quotationPrintingMethod', 'Screen');
  await page.selectOption('#quotationBrandId', String(brandId));
  await page.evaluate(() => {
    const d = document.getElementById('miniTabDetails'); if (d) d.style.display = 'none';
    const p = document.getElementById('miniTabPricing'); if (p) p.style.display = 'block';
  });
  await page.waitForSelector('#pricingModeSelect');
  await page.evaluate(() => document.getElementById('pricingModeSelect').focus());
  await page.selectOption('#pricingModeSelect', 'brand');
  await page.waitForSelector('.tier-row .tier-qty');
  await page.click('button:has-text("SAVE")');
  await page.locator('button:has-text("No")').click().catch(() => {});

  await page.waitForTimeout(500);
  const list = await req.get('/api/quotations');
  const data = await list.json();
  const all = Array.isArray(data) ? data : (data.quotations || data.rows || []);
  const created = all
    .filter((q) => (q.customerName || '') === customerName)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
  expect(created).toBeTruthy();

  // Open view, then Edit
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async (id) => { await window.viewQuotationDetails(id); }, created.id);
  await page.waitForSelector('#quotationViewFormContainer #pricingModeSelect');
  await page.click('button:has-text("Edit")');

  const vc = page.locator('#quotationViewFormContainer');
  await expect(vc.locator('#pricingModeSelect')).toBeEnabled();
  await expect(vc.locator('#brandTierTableSelect')).toBeVisible();
  // Picker pre-selected to the saved table
  await expect(vc.locator('#brandTierTableSelect')).toHaveValue(String(created.productDetails.pricing.brandTierTableId));
  // Edit the first tier's unit price
  await vc.locator('.tier-row .tier-unit').first().fill('0.77');

  await page.click('button:has-text("Save Changes")');

  // Read back via API
  await page.waitForTimeout(500);
  const r2 = await req.get('/api/quotations/' + created.id);
  const d2 = await r2.json();
  const saved = d2.quotation;
  const pricing = (saved.productDetails || {}).pricing || {};
  expect(pricing.tierScopeMode).toBe('brand');
  expect(pricing.brandTierTableId).toBe(created.productDetails.pricing.brandTierTableId);
  expect(Number(pricing.tiers[0].quantity)).toBe(1000);
  expect(Number(pricing.tiers[0].unitPrice)).toBeCloseTo(0.77, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/unit-pricing-view.spec.js --project=chromium -g "edits persist on save"`
Expected: FAIL — after Edit, `#pricingModeSelect` is not enabled / `#brandTierTableSelect` has no options (initPricingMode was never wired in edit mode; `seedPricing` parameter does not exist yet).

- [ ] **Step 3: Extend `initPricingMode` with the seed parameter**

In `public/index.html`, change the function signature (~19415) from:

```js
    function initPricingMode(scope) {
```

to:

```js
    function initPricingMode(scope, seedPricing = null) {
```

Then add a new closure function right before the existing tail (the tail is the `// Initial population (after all functions defined)` comment + `populateModeOptions(); onModeChange();` at ~19612-19614). Insert this function immediately above that comment:

```js
      // Seed saved pricing into the grid using the private helpers (view→edit).
      // Runs entirely inside the closure so addTierRow/refresh*Picker/syncBaseFromTiers
      // are available, and is fully awaited so there is no race with the default onModeChange.
      async function seedPricingIntoGrid(seed) {
        const uiMode = seed.tierScopeMode === 'customer' ? 'factory' : seed.tierScopeMode;
        await populateModeOptions(); // ensures the brand/factory <option> exists in the select
        modeSel.value = uiMode;
        if (brandWrap) brandWrap.style.display = 'none';
        if (custWrap) custWrap.style.display = 'none';
        flatSec.style.display = 'none';
        tierSec.style.display = 'block';
        if (uiMode === 'brand') {
          if (brandWrap) brandWrap.style.display = '';
          await refreshBrandPicker();
          if (seed.brandTierTableId != null && brandSel) brandSel.value = String(seed.brandTierTableId);
        } else if (uiMode === 'factory') {
          if (custWrap) custWrap.style.display = '';
          await refreshCustomerPicker();
          if (seed.customerTierTableId != null && custSel) custSel.value = String(seed.customerTierTableId);
        }
        // Populate grid from SAVED tiers (source of truth). Clear AFTER the picker refresh —
        // populateScopePicker auto-loads a single matching table's rows into the grid, which
        // we must discard in favour of the saved tiers.
        rowsWrap.innerHTML = '';
        seed.tiers.forEach((t) => addTierRow(t.quantity || 0, t.unitPrice || 0));
        syncBaseFromTiers();
      }

```

Then replace the existing tail:

```js
      // Initial population (after all functions defined)
      populateModeOptions();
      onModeChange();
    }
```

with:

```js
      // Initial population (after all functions defined)
      const hasSeed = seedPricing && seedPricing.tierScopeMode && seedPricing.tierScopeMode !== 'none'
        && Array.isArray(seedPricing.tiers) && seedPricing.tiers.length > 0;
      if (hasSeed) {
        seedPricingIntoGrid(seedPricing);
      } else {
        populateModeOptions();
        onModeChange();
      }
    }
```

- [ ] **Step 4: Call `initPricingMode` from `editQuotationFromView`**

In `public/index.html` `editQuotationFromView`, the function ends (~16899) with:

```js
      window.originalQuotationData = quotation;
    }
```

Replace those two lines with:

```js
      window.originalQuotationData = quotation;

      // Wire pricing controls and seed with the saved selection (view → edit).
      const vLabel = formContainer.querySelector('#viewTierTableLabel');
      if (vLabel) vLabel.style.display = 'none';
      const savedPricing = (quotation && quotation.productDetails && quotation.productDetails.pricing) || null;
      initPricingMode(formContainer, savedPricing);
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/unit-pricing-view.spec.js --project=chromium -g "edits persist on save"`
Expected: PASS — after Edit, mode select enabled, brand picker visible and pre-selected to the saved table; editing the first tier unit price to `0.77` and saving persists `tiers[0].unitPrice ≈ 0.77` with `tierScopeMode` unchanged.

- [ ] **Step 6: Run the full view test file**

Run: `npx playwright test tests/unit-pricing-view.spec.js --project=chromium`
Expected: both tests PASS (Task 1 view-display test still green).

- [ ] **Step 7: Commit**

```bash
git add public/index.html tests/unit-pricing-view.spec.js
git commit -m "feat(ui): seed saved tier pricing in quotation view inline-edit mode

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Backward compatibility — old quotations with no pricing block

**Files:**
- Test: `tests/unit-pricing-view.spec.js` (append a third test).
- No production-code changes expected (this task verifies the `none`/missing path already handled by Task 1's `populateViewPricing` early-return and Task 2's `hasSeed` guard). If the test fails, fix the specific branch — do not add speculative code.

**Interfaces:**
- Consumes: Task 1's `populateViewPricing` early-return for missing/`none` pricing; Task 2's `hasSeed` guard in `initPricingMode`.

- [ ] **Step 1: Write the test**

Append to `tests/unit-pricing-view.spec.js`:

```js
test('old quotation without pricing block shows flat fields only', async ({ page, request: req }) => {
  // Create a flat-only quotation directly via API (no pricing block), simulating a pre-tier quotation
  const customerName = uniq('OldCust');
  const createRes = await req.post('/api/quotations', {
    data: {
      customerName,
      email: `${uniq('buyer')}@example.com`,
      productType: 'hang-tag',
      productDetails: { material: 'Cotton', size: '5x5 cm', printingMethod: 'Screen' },
      quantity: 1000,
      unitPrice: 0.5,
      total: 500,
      status: 'draft',
    },
  });
  const created = (await createRes.json()).quotation || (await createRes.json()).quotation;
  expect(created).toBeTruthy();

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async (id) => { await window.viewQuotationDetails(id); }, created.id);
  await page.waitForSelector('#quotationViewFormContainer #pricingModeSelect');

  const vc = page.locator('#quotationViewFormContainer');
  // No pricing block -> flat fields visible, tier section hidden, mode disabled at none
  await expect(vc.locator('#pricingModeSelect')).toHaveValue('none');
  await expect(vc.locator('#flatPricingSection')).toBeVisible();
  await expect(vc.locator('#tierPricingSection')).toBeHidden();
  await expect(vc.locator('#viewTierTableLabel')).toBeHidden();

  // Edit mode -> defaults to none; user is not forced into a tier mode
  await page.click('button:has-text("Edit")');
  await expect(vc.locator('#pricingModeSelect')).toHaveValue('none');
  await expect(vc.locator('#flatPricingSection')).toBeVisible();
});
```

> **Note for the implementer:** the `/api/quotations` POST response shape may be `{ success, quotation }` or `{ quotation }`. The line `const created = (await createRes.json()).quotation || …` handles the common shape; if the test fails at `expect(created).toBeTruthy()` with a different shape, inspect the response and adjust that one line. Do not change production code for this.

- [ ] **Step 2: Run the test**

Run: `npx playwright test tests/unit-pricing-view.spec.js --project=chromium -g "old quotation without pricing block"`
Expected: PASS. If it FAILS, the failure points at a specific branch in `populateViewPricing` (missing-pricing early-return) or `initPricingMode` (`hasSeed` guard) — fix that branch minimally. Do not add speculative handling.

- [ ] **Step 3: Run the whole file once more**

Run: `npx playwright test tests/unit-pricing-view.spec.js --project=chromium`
Expected: all three tests PASS.

- [ ] **Step 4: Commit (only if a production fix was needed)**

If Step 2 required a production-code fix:

```bash
git add public/index.html tests/unit-pricing-view.spec.js
git commit -m "fix(ui): guard view pricing for quotations without a pricing block

Co-Authored-By: Claude <noreply@anthropic.com>"
```

If no production change was needed, commit only the test:

```bash
git add tests/unit-pricing-view.spec.js
git commit -m "test: backward-compat for quotations without a pricing block

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Definition of done

- `npx playwright test tests/unit-pricing-view.spec.js --project=chromium` — all three tests pass.
- Opening a brand/customer tier-saved quotation shows the mode + fetched table name + read-only tiers; flat section hidden.
- Clicking Edit enables the controls, pre-selects the saved tier table, and shows saved tiers as editable; saving persists tier edits with `tierScopeMode` unchanged.
- An old quotation (no `pricing` block) shows flat fields only in view, and defaults to "None" in edit.
- The create flow is unaffected (`initPricingMode(scope)` still called with one argument; existing Phase-2 tests still pass: `npx playwright test tests/unit-pricing-ui.spec.js tests/unit-pricing-persist.spec.js --project=chromium`).

## Out of scope

- No mini-tab buttons (single-scroll preserved).
- No backend / API changes.
- Send-to-supplier spinner fix and SMTP diagnosis are tracked separately (spinner cleanup already applied to `public/index.html`).
