import { expect, test } from '@playwright/test';

test('selected template clips advance only in view, and stage switches without fetching both variants', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const mediaRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (request.url().includes('/videos/design/') && request.url().endsWith('.mp4')) mediaRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const hero = page.locator('video[data-media="Meridial Light hero"]');
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  const start = await hero.evaluate(video => (video as HTMLVideoElement).currentTime);
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(start + .15);
  // At first paint the portrait cards are below the viewport and have no source.
  expect(mediaRequests.some(url => /\/(positions|coverage|math)\.mp4$/.test(url))).toBe(false);
  expect(mediaRequests.some(url => /\/meridial-light\.mp4$/.test(url))).toBe(true);
  for (const name of ['positions', 'coverage', 'math']) {
    const video = page.locator(`video[data-media="feature-${name}"]`);
    await video.scrollIntoViewIfNeeded();
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  }
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).paused)).toBe(true);
  const isWide = page.viewportSize()!.width >= 768;
  const selected = isWide ? 'wide' : 'narrow';
  const unselected = isWide ? 'narrow' : 'wide';
  expect(mediaRequests.some(url => url.endsWith(`stage-${selected}.mp4`))).toBe(true);
  expect(mediaRequests.some(url => url.endsWith(`stage-${unselected}.mp4`))).toBe(false);
  await page.setViewportSize({ width: isWide ? 375 : 1440, height: 900 });
  await page.locator('#features').scrollIntoViewIfNeeded();
  await expect(page.locator(`video[data-media="features-stage-${unselected}"]`)).toHaveCount(1);
  await expect(page.locator(`video[data-media="features-stage-${selected}"]`)).toHaveCount(0);
  await expect.poll(() => page.locator(`video[data-media="features-stage-${unselected}"]`).evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('shared pause persists across routes and reduced motion never starts decorative sources', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('.buffer-hero-stage').getByRole('button', { name: 'Pause page animations' }).click();
  await page.goto('/auth');
  await expect(page.getByRole('button', { name: 'Resume page animations' })).toBeVisible();
  await expect(page.locator('video')).not.toHaveAttribute('src');
  await page.getByRole('button', { name: 'Resume page animations' }).click();
  await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#features').scrollIntoViewIfNeeded();
  expect(await page.locator('video').evaluateAll(videos => videos.every(video => !video.hasAttribute('src') && (video as HTMLVideoElement).paused))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Explainable math', exact: true })).toBeVisible();
});

test('mobile sheet contains keyboard focus, restores scroll and reaches real routes in short landscape', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Open navigation' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Navigation' });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 10; index++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await opener.click();
  await dialog.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await expect(page.getByRole('link', { name: 'Continue without an account' })).toBeVisible();
  // 200% browser zoom corresponds to half the CSS viewport. Check reflow there.
  await page.setViewportSize({ width: 720, height: 450 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Continue without an account' }).click();
  await expect(page.getByText('Demo mode', { exact: true })).toBeVisible();
});
