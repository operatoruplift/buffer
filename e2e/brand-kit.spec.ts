import { expect, test } from '@playwright/test';

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('brand collection filters artwork and restores the complete selection', async ({ page }) => {
  await page.goto('/brand-kit');
  await expect(page.getByRole('heading', { name: 'Find your frame.' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(15);
  const filters = page.getByRole('group', { name: 'Filter artwork by category' });
  await filters.getByRole('button', { name: 'Wallpapers', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(4);
  await expect(page.getByRole('status', { name: 'Artwork count' })).toHaveText('4 compositions');
  await expect(page.getByRole('heading', { name: 'Clarity / phone', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Blue hour / desktop', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The original, refined.', exact: true })).toHaveCount(0);
  await filters.getByRole('button', { name: 'Headers', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'The bigger picture.', exact: true })).toBeVisible();
  await filters.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(15);
  await expect(filters.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expectNoHorizontalOverflow(page);
});

test('wallpaper preview preserves the whole artwork, closes with Escape and returns focus', async ({ page }) => {
  await page.goto('/brand-kit');
  await page.getByRole('button', { name: 'Wallpapers', exact: true }).click();
  const opener = page.getByRole('button', { name: 'Preview Clarity / phone', exact: true });
  await opener.click();
  const preview = page.getByRole('dialog', { name: 'Clarity / phone', exact: true });
  await expect(preview).toBeVisible();
  const image = preview.locator('img');
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1290);
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalHeight)).toBe(2796);
  // The entire tall composition must remain visible within the preview, with no cover crop.
  expect(await image.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain');
  const imageBounds = await image.boundingBox();
  expect(imageBounds).not.toBeNull();
  expect(imageBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(imageBounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(preview.getByRole('link', { name: 'Open original image', exact: true })).toHaveAttribute('href', '/brand-kit/buffer-wallpaper-phone.png');
  await page.keyboard.press('Escape');
  await expect(preview).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expectNoHorizontalOverflow(page);
});

test('original PNG, vector logo and complete collection download as real files', async ({ page }) => {
  await page.goto('/brand-kit');
  await page.getByRole('button', { name: 'Profiles', exact: true }).click();
  await page.getByRole('button', { name: 'Preview The original, refined.', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'The original, refined.', exact: true });
  const pngDownload = page.waitForEvent('download');
  await preview.getByRole('link', { name: 'Save PNG', exact: true }).click();
  const png = await pngDownload;
  expect(png.suggestedFilename()).toBe('buffer-profile.png');
  expect(await png.failure()).toBeNull();
  const vectorDownload = page.waitForEvent('download');
  await preview.getByRole('link', { name: 'Download source SVG', exact: true }).click();
  const vector = await vectorDownload;
  expect(vector.suggestedFilename()).toBe('buffer-profile.svg');
  expect(await vector.failure()).toBeNull();
  await preview.getByRole('button', { name: 'Close artwork preview', exact: true }).click();
  const zipDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download the collection', exact: true }).click();
  const zip = await zipDownload;
  expect(zip.suggestedFilename()).toBe('buffer-brand-kit.zip');
  expect(await zip.failure()).toBeNull();
  await expect(page.getByRole('link', { name: 'Download Blue wordmark SVG', exact: true })).toHaveAttribute('href', '/brand/wordmark.svg');
});
