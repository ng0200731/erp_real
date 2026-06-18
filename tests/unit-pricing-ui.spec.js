import { test, expect, request } from '@playwright/test';

const uniq = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// Render the hang-tag quotation form directly. The nested menu navigation times out
// under headless Chromium (each onclick toggles display:block on a child submenu, and
// the email-modal flow lives inside a permanently-hidden #emails panel), so we drive
// the visible non-email sub-board path in-page and force the relevant parent panels
// visible. This mirrors the brief's page.evaluate strategy for revealing miniTabPricing.
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

test('pricing mode dropdown is conditional on brand/customer; brand tiers populate', async ({ page, request: req }) => {
  // Seed a brand + brand-scoped tier table via API
  const brandName = uniq('Brand');
  const brandRes = await req.post('/api/brands', { data: { name: brandName } });
  const brandId = (await brandRes.json()).brand.id;

  const tiers = [{ quantity: 1000, unitPrice: 0 }, { quantity: 5000, unitPrice: 0 }];
  await req.post('/api/pricing-tier-tables', {
    data: { name: uniq('BrandTiers'), scope: 'brand', brandId, brandName, tiers },
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await openQuotationHangTagForm(page);

  // Reveal the pricing mini-tab directly (avoid tab-button selector fragility)
  await page.evaluate(() => {
    const d = document.getElementById('miniTabDetails'); if (d) d.style.display = 'none';
    const p = document.getElementById('miniTabPricing'); if (p) p.style.display = 'block';
  });
  await page.waitForSelector('#pricingModeSelect');

  // No brand/customer set yet -> only "none"
  await page.evaluate(() => document.getElementById('pricingModeSelect').focus());
  let options = await page.$$eval('#pricingModeSelect option', (os) => os.map((o) => o.value));
  expect(options).toEqual(['none']);

  // Reload so the seeded brand appears in the brand <select>, then pick it
  await page.reload();
  await page.waitForLoadState('networkidle');
  await openQuotationHangTagForm(page);
  await page.evaluate(() => {
    const d = document.getElementById('miniTabDetails'); if (d) d.style.display = 'none';
    const p = document.getElementById('miniTabPricing'); if (p) p.style.display = 'block';
  });
  await page.selectOption('#quotationBrandId', String(brandId));
  // The form may be re-rendered asynchronously once loadBrandsCache() resolves after
  // reload; re-apply the mini-tab visibility right before driving the pricing select.
  await page.evaluate(() => {
    const d = document.getElementById('miniTabDetails'); if (d) d.style.display = 'none';
    const p = document.getElementById('miniTabPricing'); if (p) p.style.display = 'block';
  });
  await page.evaluate(() => document.getElementById('pricingModeSelect').focus());
  options = await page.$$eval('#pricingModeSelect option', (os) => os.map((o) => o.value));
  expect(options).toContain('brand');

  // Select brand mode -> brand picker auto-loads the one table -> tier rows populate
  await page.selectOption('#pricingModeSelect', 'brand');
  await page.waitForSelector('.tier-row .tier-qty');
  const quantities = await page.$$eval('.tier-row .tier-qty', (qs) => qs.map((q) => q.value));
  expect(quantities).toEqual(['1000', '5000']);
});
