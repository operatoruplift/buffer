import { expect, test, type Page } from '@playwright/test';

async function openNavigationWithKeyboard(page: Page) {
  const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Navigation', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close navigation', exact: true })).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  return { dialog, opener };
}

test.beforeEach(async ({ page }) => {
  // Exercise the compact header in both the desktop and touch projects.
  await page.setViewportSize({ width: Math.min(page.viewportSize()!.width, 740), height: 812 });
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`mobile section navigation continues keyboard focus at the destination with ${reducedMotion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/');
    await expect(page.locator('.buffer-site')).toHaveAttribute('data-scroll-motion', reducedMotion === 'reduce' ? 'reduced' : 'active');
    const { dialog } = await openNavigationWithKeyboard(page);
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('link', { name: 'Features', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('link', { name: 'How it works', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');

    const method = page.locator('#method');
    await expect(page).toHaveURL(/\/#method$/);
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
    await expect(method).toBeFocused();
    await expect.poll(() => method.evaluate(element => {
      const margin = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
      return Math.abs(element.getBoundingClientRect().top - margin);
    })).toBeLessThan(3);
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', reducedMotion === 'reduce' ? 'auto' : 'smooth');

    await page.keyboard.press('Tab');
    await expect(page.locator('#install').getByRole('link', { name: 'Open the app', exact: true })).toBeFocused();
    await expect(method).not.toHaveAttribute('tabindex');
  });
}

test('dismissing the mobile sheet restores opener focus and the previous body scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.buffer-site')).toHaveAttribute('data-scroll-motion', 'reduced');
  await page.evaluate(() => { document.body.style.overflow = 'auto'; });

  for (const dismissal of ['Escape', 'Close button', 'backdrop'] as const) {
    const { dialog, opener } = await openNavigationWithKeyboard(page);
    if (dismissal === 'Escape') {
      await page.keyboard.press('Escape');
    } else if (dismissal === 'Close button') {
      await dialog.getByRole('button', { name: 'Close navigation', exact: true }).click();
    } else {
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThan(0);
      await page.mouse.click(bounds!.x / 2, 30);
    }
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('auto');
  }
});
