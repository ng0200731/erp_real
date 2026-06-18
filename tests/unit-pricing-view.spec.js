import { test, expect, request } from '@playwright/test';

const uniq = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// Render the hang-tag quotation form directly. The nested menu navigation
// (menu-quotation -> quotation-create-btn -> hang-tag-btn) times out under
// headless Chromium (each onclick toggles display:block on a child submenu),
// mirroring the established approach in tests/unit-pricing-ui.spec.js and
// tests/unit-pricing-persist.spec.js.
async function openQuotationHangTagForm(page) {
  await page.evaluate(async () => {
    if (typeof window.loadBrandsCache === 'function') { try { await window.loadBrandsCache(); } catch (e) {} }
    if (typeof window.showQuotationSubBoard === 'function') window.showQuotationSubBoard('hang-tag', 'Hang Tag');
    ['quotationPanel', 'quotationSubBoard'].forEach((id) => {
      const el = document.getElementById(id); if (el) el.style.display = 'block';
    });
  });
  await page.waitForFunction(() => !!document.querySelector('#pricingModeSelect'), null, { timeout: 10000 });
}

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
  // Reload so the seeded brand appears in the brand <select>.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await openQuotationHangTagForm(page);
  await page.fill('#quotationCustomerName', customerName);
  await page.evaluate((cid) => {
    const ac = window.customerAutocomplete;
    if (ac && typeof ac.selectCustomer === 'function') ac.selectCustomer(cid);
    const cp = document.getElementById('quotationContactPerson');
    if (cp) cp.dispatchEvent(new Event('change'));
    const ef = document.getElementById('quotationEmail');
    if (ef) { ef.disabled = false; ef.style.backgroundColor = '#fff'; ef.style.color = '#000'; }
  }, null);
  await page.fill('#quotationEmail', `${uniq('buyer')}@example.com`);
  await page.selectOption('#quotationMaterial', 'paper');
  await page.fill('#quotationSize', '5x5 cm');
  await page.selectOption('#quotationPrintingMethod', 'screen-printing');
  await page.selectOption('#quotationBrandId', String(brandId));
  await page.evaluate(() => {
    const d = document.getElementById('miniTabDetails'); if (d) d.style.display = 'none';
    const p = document.getElementById('miniTabPricing'); if (p) p.style.display = 'block';
  });
  await page.waitForSelector('#pricingModeSelect');
  await page.evaluate(() => document.getElementById('pricingModeSelect').focus());
  await page.selectOption('#pricingModeSelect', 'brand');
  await page.waitForSelector('.tier-row .tier-qty');
  // The dashboard overlay intercepts clicks; hide it, then force-click SAVE.
  await page.evaluate(() => {
    ['welcomePanel', 'tabsBar'].forEach((id) => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
  });
  await page.locator('#quotationSubBoard button.page-btn', { hasText: /^SAVE$/ }).first().click({ force: true });
  await page.locator('.modal-overlay').last().waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.modal-overlay').last().locator('button', { hasText: /^No$/ }).click();

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

test('inline-edit seeds saved brand tier, edits persist on save', async ({ page, request: req }) => {
  // Seed brand + brand-scoped tier table
  const brandName = uniq('Brand');
  const brandRes = await req.post('/api/brands', { data: { name: brandName } });
  const brandId = (await brandRes.json()).brand.id;
  const tableName = uniq('BrandTiers');
  await req.post('/api/pricing-tier-tables', {
    data: { name: tableName, scope: 'brand', brandId, brandName, tiers: [{ quantity: 1000, unitPrice: 0.5 }, { quantity: 5000, unitPrice: 0.4 }] },
  });

  // Create a quotation saved in brand tier mode via the proven create flow.
  // The nested menu navigation (menu-quotation -> quotation-create-btn -> hang-tag-btn)
  // times out under headless Chromium, so reuse the openQuotationHangTagForm helper.
  const customerName = uniq('Cust');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.reload(); // so the seeded brand appears in the brand <select>
  await page.waitForLoadState('networkidle');
  await openQuotationHangTagForm(page);
  await page.fill('#quotationCustomerName', customerName);
  await page.evaluate((cid) => {
    const ac = window.customerAutocomplete;
    if (ac && typeof ac.selectCustomer === 'function') ac.selectCustomer(cid);
    const cp = document.getElementById('quotationContactPerson');
    if (cp) cp.dispatchEvent(new Event('change'));
    const ef = document.getElementById('quotationEmail');
    if (ef) { ef.disabled = false; ef.style.backgroundColor = '#fff'; ef.style.color = '#000'; }
  }, null);
  await page.fill('#quotationEmail', `${uniq('buyer')}@example.com`);
  await page.selectOption('#quotationMaterial', 'paper');
  await page.fill('#quotationSize', '5x5 cm');
  await page.selectOption('#quotationPrintingMethod', 'screen-printing');
  await page.selectOption('#quotationBrandId', String(brandId));
  await page.evaluate(() => {
    const d = document.getElementById('miniTabDetails'); if (d) d.style.display = 'none';
    const p = document.getElementById('miniTabPricing'); if (p) p.style.display = 'block';
  });
  await page.waitForSelector('#pricingModeSelect');
  await page.evaluate(() => document.getElementById('pricingModeSelect').focus());
  await page.selectOption('#pricingModeSelect', 'brand');
  await page.waitForSelector('.tier-row .tier-qty');
  // The dashboard overlay intercepts clicks; hide it, then force-click SAVE.
  await page.evaluate(() => {
    ['welcomePanel', 'tabsBar'].forEach((id) => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
  });
  await page.locator('#quotationSubBoard button.page-btn', { hasText: /^SAVE$/ }).first().click({ force: true });
  await page.locator('.modal-overlay').last().waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.modal-overlay').last().locator('button', { hasText: /^No$/ }).click();

  // Find the created quotation id
  await page.waitForTimeout(500);
  const list = await req.get('/api/quotations');
  const data = await list.json();
  const all = Array.isArray(data) ? data : (data.quotations || data.rows || []);
  const created = all
    .filter((q) => (q.customerName || '') === customerName)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
  expect(created, 'saved quotation found').toBeTruthy();

  // Open view, then Edit
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async (id) => { await window.viewQuotationDetails(id); }, created.id);
  await page.waitForSelector('#quotationViewFormContainer #pricingModeSelect');
  // The view modal's Edit button lives in .modal-actions — a sibling of the form
  // container inside the .quotation-view-overlay. Scope to that overlay to avoid
  // matching unrelated "Edit" buttons elsewhere in the DOM.
  await page.locator('.quotation-view-overlay').locator('button', { hasText: /^Edit$/ }).click();

  const vc = page.locator('#quotationViewFormContainer');
  await expect(vc.locator('#pricingModeSelect')).toBeEnabled();
  await expect(vc.locator('#brandTierTableSelect')).toBeVisible();
  // Picker pre-selected to the saved table (pricing stored FLAT in productDetails)
  await expect(vc.locator('#brandTierTableSelect')).toHaveValue(String(created.productDetails.brandTierTableId));
  // Edit the first tier's unit price
  await vc.locator('.tier-row .tier-unit').first().fill('0.77');

  await page.click('button:has-text("Save Changes")');

  // Read back via API
  await page.waitForTimeout(500);
  const r2 = await req.get('/api/quotations/' + created.id);
  const d2 = await r2.json();
  const saved = d2.quotation;
  // Pricing is stored FLAT at the top level of productDetails (see unit-pricing-persist.spec.js).
  const pd = saved.productDetails || {};
  expect(pd.tierScopeMode).toBe('brand');
  expect(pd.brandTierTableId).toBe(created.productDetails.brandTierTableId);
  expect(Number(pd.tiers[0].quantity)).toBe(1000);
  expect(Number(pd.tiers[0].unitPrice)).toBeCloseTo(0.77, 2);
});

test('old quotation without pricing block shows flat fields only', async ({ page, request: req }) => {
  // Create a flat-only quotation directly via API (no pricing block), simulating a pre-tier quotation.
  // dateCreated is required by the DB INSERT (db/tasksDb.js:1385 passes it positionally with no
  // default) even though routes/quotations.js:99 only validates customerName/productType/quantity.
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
      dateCreated: new Date().toISOString(),
    },
  });
  // POST /api/quotations responds with { success, quotation } (see routes/quotations.js:105).
  const created = (await createRes.json()).quotation;
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

  // Edit mode -> defaults to none; user is not forced into a tier mode.
  // Scope the Edit button to .quotation-view-overlay — a bare "Edit" selector
  // matches a hidden unrelated #ws-editDetailBtn first and times out.
  await page.locator('.quotation-view-overlay').locator('button', { hasText: /^Edit$/ }).click();
  await expect(vc.locator('#pricingModeSelect')).toHaveValue('none');
  await expect(vc.locator('#flatPricingSection')).toBeVisible();
});
