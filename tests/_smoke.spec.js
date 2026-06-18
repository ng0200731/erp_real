import { test, expect } from '@playwright/test';

test('app boots under the Playwright webServer', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('body')).toBeVisible();
});
