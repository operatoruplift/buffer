import { expect, test } from '@playwright/test';

test('brand kit exposes usable previews and downloadable assets', async ({ page }) => {
  await page.goto('/brand-kit');
  await expect(page.getByRole('heading', { name: 'Download the kit.' })).toBeVisible();
  const cards = page.locator('article');
  await expect(cards).toHaveCount(8);
  await expect.poll(() => cards.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.getByRole('link', { name: 'Save to device' })).toHaveCount(8);
  await expect(page.locator('a[download]')).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Save to device' }).first().click();
  await download;
});
