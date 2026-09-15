import { test, expect } from '@playwright/test';

test('local threshold monitor persists a rule and records mock delivery', async ({ page }) => {
  await page.goto('/app');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Know when headroom changes.' })).toBeVisible();
  await page.getByRole('button', { name: 'Configure rule' }).click();
  await expect(page.getByText('Local demo monitoring configured on this device.')).toBeVisible();
  await page.getByRole('button', { name: 'Run fresh check' }).click();
  await expect(page.getByText('Delivered · mock sink')).toBeVisible();
  await expect(page.getByText('Mock delivery recorded.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Delivered · mock sink')).toBeVisible();
  await expect(page.getByText('Delivery state').locator('..').getByText('Delivered')).toBeVisible();
});
