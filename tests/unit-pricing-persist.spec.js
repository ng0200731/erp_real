import { test, expect } from '@playwright/test';

const uniq = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// Render the hang-tag quotation form directly. The nested menu navigation
// (menu-quotation -> quotation-create-btn -> hang-tag-btn) times out under
// headless Chromium (each onclick toggles display:block on a child submenu).
// We mirror tests/unit-pricing-ui.spec.js's approach: drive the in-page
// showQuotationSubBoard('hang-tag', ...) and force the relevant panels visible.
async function openQuotationHangTagForm(page) {
  await page.evaluate(async () => {
    if (typeof window.loadBrandsCache === 'function') { try { await window.loadBrandsCache(); } catch (e) {} }
    if (typeof window.showQuotationSubBoard === 'function') window.showQuotationSubBoard('hang-tag', 'Hang Tag');
    ['quotationPanel', 'quotationSubBoard'].forEach((id) => {
      const el = document.getElementById(id); if (el) el.style.display = 'block';
    });
  });
  // showQuotationSubBoard re-renders content asynchronously after loadBrandsCache();
  // wait for the pricing-mode select to land in the DOM before tweaking tab visibility.
  await page.waitForFunction(() => !!document.querySelector('#pricingModeSelect'), null, { timeout: 10000 });
}

test('factory tier mode persists as customer scope; all types carry pricing', async ({ page, request: req }) => {
  const customerName = uniq('Acme Factory');
  const custRes = await req.post('/api/customers', { data: { companyName: customerName, emailDomain: 'acme.com', companyType: 'Garment Factory' } });
  const customerId = (await custRes.json()).customer.id;
  // Customer-scope filter (Phase 1) matches by customerId, so the seed must set it
  await req.post('/api/pricing-tier-tables', {
    data: { name: uniq('AcmeTiers'), scope: 'customer', customerId, customerName, tiers: [{ quantity: 2000, unitPrice: 0 }, { quantity: 8000, unitPrice: 0 }] },
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await openQuotationHangTagForm(page);

  // Resolve the seeded customer via the in-page autocomplete (the email field
  // is disabled until a customer/contact is resolved). The customer was seeded
  // without members, so selecting it leaves the contact dropdown empty and the
  // change handler enables email/phone for manual entry.
  await page.fill('#quotationCustomerName', customerName);
  await page.evaluate((cid) => {
    const ac = window.customerAutocomplete;
    if (ac && typeof ac.selectCustomer === 'function') {
      ac.selectCustomer(cid);
    }
    // Ensure email/phone are enabled (the no-member-selected branch).
    const cp = document.getElementById('quotationContactPerson');
    if (cp) cp.dispatchEvent(new Event('change'));
    const ef = document.getElementById('quotationEmail');
    if (ef) { ef.disabled = false; ef.style.backgroundColor = '#fff'; ef.style.color = '#000'; }
  }, customerId);

  // Customer + product fields (minimal valid). Material/PrintingMethod are
  // <select> elements with fixed option values for hang-tag.
  await page.fill('#quotationEmail', `${uniq('buyer')}@example.com`);
  await page.selectOption('#quotationMaterial', 'paper');
  await page.fill('#quotationSize', '5x5 cm');
  await page.selectOption('#quotationPrintingMethod', 'screen-printing');

  // Reveal pricing mini-tab, pick factory mode -> tiers auto-load.
  // (Re-apply mini-tab visibility right before driving the pricing select; the
  // form may be re-rendered asynchronously once loadBrandsCache() resolves.)
  await page.evaluate(() => {
    const d = document.getElementById('miniTabDetails'); if (d) d.style.display = 'none';
    const p = document.getElementById('miniTabPricing'); if (p) p.style.display = 'block';
  });
  await page.waitForFunction(() => !!document.querySelector('#pricingModeSelect'), null, { timeout: 10000 });
  await page.evaluate(() => document.getElementById('pricingModeSelect').focus());

  // The quotation save validates quantity > 0. Set quantity/unitPrice directly
  // via evaluate (rather than Playwright fill, which requires visibility): the
  // flat pricing section lives inside #miniTabPricing and the form can be
  // re-rendered asynchronously, making it intermittently hidden. The save reads
  // these inputs' .value regardless of CSS visibility.
  await page.evaluate(() => {
    const q = document.getElementById('quotationQuantity'); if (q) q.value = '2000';
    const u = document.getElementById('quotationUnitPrice'); if (u) u.value = '0.42';
    const t = document.getElementById('quotationTotal'); if (t) t.value = '840';
  });

  await page.selectOption('#pricingModeSelect', 'factory');
  await page.waitForSelector('.tier-row .tier-qty');
  await page.fill('.tier-row .tier-unit', '0.42');

  // The quotation SAVE button (button.page-btn with exact text "SAVE").
  // Several "Save ..." buttons exist on the page; scope to the quotation panel
  // and require the button be visible. The dashboard's #welcomePanel / #tabsBar
  // overlay the form and intercept pointer events, so hide them first, then
  // force-click (the button itself is visible/enabled).
  await page.evaluate(() => {
    ['welcomePanel', 'tabsBar'].forEach((id) => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
  });
  const saveBtn = page.locator('#quotationSubBoard button.page-btn', { hasText: /^SAVE$/ }).first();
  await saveBtn.click({ force: true });

  // SAVE triggers showModal("...send to customer directly?", okText=Yes,
  // cancelText=No). Wait for the modal overlay to appear, then click "No"
  // (save with status 'pending'). Scope to the visible overlay to avoid
  // matching stray hidden buttons.
  const modalOverlay = page.locator('.modal-overlay').last();
  await modalOverlay.waitFor({ state: 'visible', timeout: 10000 });
  await modalOverlay.locator('button', { hasText: /^No$/ }).click();

  // Read back via API: newest matching quotation. The /api/quotations list
  // response shape varies -- handle both an array and {quotations:[]}/{rows:[]}.
  await page.waitForTimeout(500);
  const list = await req.get('/api/quotations');
  const data = await list.json();
  const all = Array.isArray(data) ? data : (data.quotations || data.rows || []);
  const created = all
    .filter((q) => (q.customerName || '') === customerName && (q.productType || '').toLowerCase().includes('hang'))
    .sort((a, b) => Number(b.id) - Number(a.id))[0];
  expect(created, 'saved quotation found').toBeTruthy();
  // collectProductDetailsFromForm (brief Step 3, verbatim) spreads `...pricing`
  // flat into the productDetails return, so tierScopeMode/customerTierTableId/
  // tiers land at the top level of productDetails (matching the historical flat
  // convention used by productDetails.pricingMode/pricingTiers). Read flat.
  const pricing = created.productDetails || {};
  expect(pricing.tierScopeMode).toBe('customer');
  expect(pricing.customerTierTableId).toBeTruthy();
  expect(pricing.tiers.map((t) => Number(t.quantity)).sort((a, b) => a - b)).toEqual([2000, 8000]);
});
