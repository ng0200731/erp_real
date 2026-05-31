import { test, expect } from '@playwright/test';

test.describe('Welcome Tab Chart Scale', () => {
  test('charts should keep same size when clicking welcome tab again', async ({ page }) => {
    await page.goto('http://localhost:3001/');
    await page.waitForSelector('#chartCanvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Get initial chart canvas dimensions
    const initialSize = await page.evaluate(() => {
      const canvas = document.getElementById('chartCanvas');
      return { width: canvas.width, height: canvas.height };
    });
    console.log('Initial chart size:', initialSize);

    // Navigate away using activateTab directly (simulates clicking another tab)
    await page.evaluate(() => activateTab('quotation'));
    await page.waitForTimeout(500);

    // Return to welcome tab
    await page.evaluate(() => activateTab('welcome'));
    await page.waitForTimeout(1000);

    const returnSize = await page.evaluate(() => {
      const canvas = document.getElementById('chartCanvas');
      return { width: canvas.width, height: canvas.height };
    });
    console.log('Return chart size:', returnSize);

    expect(returnSize.width).toBe(initialSize.width);
    expect(returnSize.height).toBe(initialSize.height);
  });

  test('outsourcing chart should keep same size on welcome revisit', async ({ page }) => {
    await page.goto('http://localhost:3001/');
    await page.waitForSelector('#outsourcingChartCanvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const initialSize = await page.evaluate(() => {
      const canvas = document.getElementById('outsourcingChartCanvas');
      return { width: canvas.width, height: canvas.height };
    });
    console.log('Initial outsourcing chart size:', initialSize);

    await page.evaluate(() => activateTab('supplier'));
    await page.waitForTimeout(500);

    await page.evaluate(() => activateTab('welcome'));
    await page.waitForTimeout(1000);

    const returnSize = await page.evaluate(() => {
      const canvas = document.getElementById('outsourcingChartCanvas');
      return { width: canvas.width, height: canvas.height };
    });
    console.log('Return outsourcing chart size:', returnSize);

    expect(returnSize.width).toBe(initialSize.width);
    expect(returnSize.height).toBe(initialSize.height);
  });

  test('brand chart should keep same size on welcome revisit', async ({ page }) => {
    await page.goto('http://localhost:3001/');
    await page.waitForSelector('#brandChartCanvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const initialSize = await page.evaluate(() => {
      const canvas = document.getElementById('brandChartCanvas');
      return { width: canvas.width, height: canvas.height };
    });
    console.log('Initial brand chart size:', initialSize);

    await page.evaluate(() => activateTab('quotation'));
    await page.waitForTimeout(500);

    await page.evaluate(() => activateTab('welcome'));
    await page.waitForTimeout(1000);

    const returnSize = await page.evaluate(() => {
      const canvas = document.getElementById('brandChartCanvas');
      return { width: canvas.width, height: canvas.height };
    });
    console.log('Return brand chart size:', returnSize);

    expect(returnSize.width).toBe(initialSize.width);
    expect(returnSize.height).toBe(initialSize.height);
  });
});