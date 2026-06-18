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
