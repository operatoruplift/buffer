import { expect, test } from '@playwright/test';

function inspectPixels(element: HTMLCanvasElement) {
  const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
  let hash = 2166136261;
  for (const pixel of pixels) hash = Math.imul(hash ^ pixel, 16777619) >>> 0;
  return { frames: Number(element.dataset.frames), hash, nonzero: pixels.some(value => value > 0), size: element.width * element.height };
}

test('auth refracts decoded video frames and pauses while native controls stay usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/auth');
  const surface = page.locator('[data-refraction]');
  const video = page.locator('video[data-media="auth"]');
  const canvas = surface.locator('canvas');
  await expect(surface).toHaveAttribute('data-refraction', 'active');
  const before = await canvas.evaluate(inspectPixels);
  expect(before.size).toBeLessThanOrEqual(120_000);
  expect(before.nonzero).toBe(true);
  await expect.poll(() => canvas.evaluate(element => Number(element.dataset.frames))).toBeGreaterThan(before.frames + 5);
  expect((await canvas.evaluate(inspectPixels)).hash).not.toBe(before.hash);
  await expect(video).toHaveAttribute('crossorigin', 'anonymous');

  const password = page.getByLabel('Password', { exact: true });
  if (await password.count()) {
    await password.fill('local-browser-test');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'password');
    await password.fill('');
  }
  await page.getByRole('button', { name: 'Pause page animations', exact: true }).click();
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
  await expect(surface).toHaveAttribute('data-refraction', 'still');
  const pausedFrame = await canvas.getAttribute('data-frames');
  await page.waitForTimeout(300);
  expect(await canvas.getAttribute('data-frames')).toBe(pausedFrame);
  await page.getByRole('button', { name: 'Resume page animations', exact: true }).click();
  await expect(surface).toHaveAttribute('data-refraction', 'active');
  await expect(page.getByRole('link', { name: 'Continue without an account' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('reduced motion presents the poster immediately without starting decorative work', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/auth');
  const video = page.locator('video[data-media="auth"]');
  await expect(page.locator('[data-refraction]')).toHaveAttribute('data-refraction', 'reduced');
  await expect(video).not.toHaveAttribute('src');
  expect(await video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Sign in to Buffer' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue without an account' })).toBeVisible();
});

test('unavailable canvas falls back without blocking authentication or the public explorer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null });
  });
  await page.goto('/auth');
  await expect(page.locator('[data-refraction]')).toHaveAttribute('data-refraction', 'unavailable');
  await expect(page.getByRole('heading', { name: 'Sign in to Buffer' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue without an account' }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test('an unreadable video frame leaves a usable glass fallback and native fields', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'getImageData', {
      configurable: true,
      value: () => { throw new DOMException('The canvas is tainted.', 'SecurityError'); },
    });
  });
  await page.goto('/auth');
  await expect(page.locator('[data-refraction]')).toHaveAttribute('data-refraction', 'unavailable');
  const email = page.getByLabel('Email address');
  if (await email.count()) {
    await email.fill('browser-check@example.com');
    await expect(email).toHaveValue('browser-check@example.com');
  }
  await expect(page.getByRole('link', { name: 'Continue without an account' })).toBeVisible();
});
