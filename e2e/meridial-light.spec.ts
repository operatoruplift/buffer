import { expect, test } from '@playwright/test';

test('Meridial Light hero travels one real scenario into the expanded board and back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const stage = page.locator('.buffer-hero-stage');
  const preview = page.getByLabel('Interactive price scenario');
  await expect(page.getByRole('heading', { name: 'Every position. Every price move. A clearer picture.' })).toBeVisible();
  await expect(page.locator('video[data-media="Meridial Light hero"]')).toHaveCount(1);
  await expect.poll(() => page.locator('video[data-media="Meridial Light hero"]').evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await expect(preview.locator('.buffer-preview-value')).toContainText('+3,500.00');
  await page.getByRole('button', { name: 'Explore the scenario', exact: true }).click();
  await expect(stage).toHaveClass(/is-board/);
  await expect(stage.getByRole('button', { name: 'Back to overview', exact: true })).toBeVisible();
  await expect(stage.locator('input[type="range"]')).toHaveCount(1);
  await expect(preview.locator('.buffer-preview-value')).toContainText('+3,500.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await stage.getByRole('button', { name: 'Back to overview', exact: true }).click();
  await expect(stage).not.toHaveClass(/is-board/);
  await expect(preview.locator('.buffer-preview-value')).toContainText('+3,500.00');
});
