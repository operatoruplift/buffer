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

test('scenario values survive keyboard changes, resize, and rapid return actions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const preview = page.getByLabel('Interactive price scenario');
  const range = preview.locator('input[type="range"]');
  const sliderBounds = await range.boundingBox();
  expect(sliderBounds).not.toBeNull();
  await range.click({ position: { x: sliderBounds!.width - 2, y: sliderBounds!.height / 2 } });
  await expect(range).toHaveValue('20');
  await range.focus();
  await page.keyboard.press('ArrowLeft');
  const changed = await preview.locator('.buffer-preview-value').innerText();
  expect(changed).not.toContain('7,000.00');
  for (let index = 0; index < 3; index++) {
    // Interrupt the in-flight transition rather than waiting for pointer stability.
    await page.getByRole('button', { name: 'Explore the scenario', exact: true }).dispatchEvent('click');
    await expect(preview.locator('.buffer-preview-value')).toHaveText(changed);
    await page.getByRole('button', { name: 'Back to overview', exact: true }).dispatchEvent('click');
  }
  await page.getByRole('button', { name: 'Explore the scenario', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(range).toHaveCount(1);
  await expect(preview.locator('.buffer-preview-value')).toHaveText(changed);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Back to overview', exact: true }).click();
  await expect(preview.locator('.buffer-preview-value')).toHaveText(changed);
});
