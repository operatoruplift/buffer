import { expect, test } from '@playwright/test';

test('website sample uses real scenario arithmetic and leads to the explorer', async ({ page }) => {
  await page.goto('/');
  const preview = page.getByLabel('Interactive sample scenario');
  await expect(preview.locator('.buffer-preview-value')).toContainText('+3,500.00');
  await preview.getByRole('button', { name: '0%', exact: true }).click();
  await expect(preview.locator('.buffer-preview-value')).toContainText('0.00');
  await preview.getByRole('button', { name: '+20%', exact: true }).click();
  await expect(preview.locator('.buffer-preview-value')).toContainText('7,000.00');
  await expect(preview.locator('.buffer-preview-value')).toContainText('−');
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  await page.getByRole('link', { name: 'Explore Buffer', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('Sample mode', { exact: true })).toBeVisible();
});

test('optional account route gives a working public path when cloud setup is pending', async ({ page }) => {
  await page.goto('/auth?mode=signup');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  const pending = page.getByText(/Cloud accounts are being configured/);
  if (await pending.isVisible()) {
    await expect(page.getByRole('button', { name: 'Create account', exact: true })).toHaveCount(0);
  } else {
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('minlength', '12');
  }
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  await page.getByRole('link', { name: 'Continue to the public explorer' }).click();
  await expect(page.getByText('Sample mode', { exact: true })).toBeVisible();
});
