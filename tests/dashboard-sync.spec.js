import { test, expect } from '@playwright/test';

const uniq = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// The welcome tab is a Dashboard with charts (Quotation/Outsourcing/Brand
// distribution) built from productDetails/quotations data. activateTab('welcome')
// must RELOAD that data on every visit — not just redraw stale charts — so the
// dashboard stays in sync after quotations are created/edited in other views.
test('welcome dashboard reloads quotation data on re-activation (stale-chart sync)', async ({ page, request: req }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // First visit: build the charts + load data (dashboardData is a lexical global,
  // accessed by bare name — not window.dashboardData)
  await page.evaluate(() => window.activateTab('welcome'));
  await page.waitForFunction(() => typeof dashboardData !== 'undefined' && dashboardData !== null, null, { timeout: 10000 });
  const total1 = await page.evaluate(() => dashboardData.total);

  // Create a quotation with a status the dashboard counts ('pending' is in statusCounts)
  const customerName = uniq('SyncCust');
  const createRes = await req.post('/api/quotations', {
    data: {
      customerName,
      productType: 'hang-tag',
      productDetails: { material: 'Cotton', size: '5x5 cm', printingMethod: 'Screen' },
      quantity: 1000,
      unitPrice: 0.5,
      total: 500,
      status: 'pending',
      dateCreated: new Date().toISOString(),
    },
  });
  expect((await createRes.json()).success).toBe(true);

  // Re-activate the welcome tab — must reload fresh data.
  await page.evaluate(() => window.activateTab('welcome'));
  // Before the fix: re-activation only redraws, so total never changes -> timeout -> FAIL.
  await page.waitForFunction(
    (prev) => typeof dashboardData !== 'undefined' && dashboardData !== null && dashboardData.total !== prev,
    total1,
    { timeout: 8000 }
  );
  const total2 = await page.evaluate(() => dashboardData.total);

  // The reload is proven by waitForFunction resolving (total changed off total1).
  // Assert strictly-greater (not exact +1): Playwright repeats share one DB, so a
  // concurrent repeat's quotation may also be counted — but ours is always included.
  expect(total2).toBeGreaterThan(total1);
});
