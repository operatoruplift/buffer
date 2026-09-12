import { expect, test } from '@playwright/test';

test('wordmarks share the landing header typography and blue across pages and footer', async ({ page }) => {
  const identities = [];
  for (const path of ['/', '/app', '/demo', '/auth']) {
    await page.goto(path);
    for (const brand of await page.locator('[data-brand="buffer"]').all()) {
      identities.push(await brand.evaluate(element => {
        const style = getComputedStyle(element);
        return { font: style.fontFamily, weight: style.fontWeight, color: style.color, trackingRatio: parseFloat(style.letterSpacing) / parseFloat(style.fontSize) };
      }));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(identities.length).toBeGreaterThanOrEqual(5);
  for (const identity of identities) {
    expect(identity.font).toBe(identities[0].font);
    expect(identity.weight).toBe('550');
    expect(identity.color).toBe('rgb(49, 95, 232)');
    expect(identity.trackingRatio).toBeCloseTo(identities[0].trackingRatio, 4);
  }
});

test('hero and attached caption keep moving beyond the first loop and can be paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const values = () => page.evaluate(() => {
    const hero = document.querySelector('.buffer-shader-orb-one')!;
    const lockup = document.querySelector('.buffer-app-lockup')!;
    const caption = lockup.querySelector<HTMLElement>('.buffer-app-caption')!;
    return {
      hero: getComputedStyle(hero).transform,
      lockup: getComputedStyle(lockup).transform,
      offset: caption.offsetLeft - (lockup as HTMLElement).clientWidth / 2,
      playing: lockup.getAnimations().some(animation => animation.playState === 'running'),
    };
  });
  await page.waitForTimeout(5500);
  const first = await values();
  await page.waitForTimeout(700);
  const second = await values();
  expect(second.hero).not.toBe(first.hero);
  expect(second.lockup).not.toBe(first.lockup);
  expect(second.playing).toBe(true);
  expect(Math.abs(second.offset - 4)).toBeLessThanOrEqual(0.5);
  await page.locator('.buffer-hero-stage').getByRole('button', { name: 'Pause page animations' }).click();
  await page.waitForFunction(() => document.querySelector('.buffer-app-lockup')!.getAnimations().every(animation => animation.playState === 'paused' && !animation.pending));
  const paused = await values();
  await page.waitForTimeout(300);
  expect((await values()).lockup).toBe(paused.lockup);
  await page.locator('.buffer-install-art').getByRole('button', { name: 'Resume page animations' }).click();
  await page.waitForTimeout(300);
  expect((await values()).lockup).not.toBe(paused.lockup);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await values()).playing).toBe(false);
});

test('browser favicon restores the blue app tile with a fresh cache key', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/icons/icon.svg?v=tile4');
  const svg = await (await request.get('/icons/icon.svg?v=tile4')).text();
  expect(svg).toContain('#315FE8');
  const icon = await (await request.get('/favicon.ico?v=tile4')).body();
  expect(icon.readUInt16LE(2)).toBe(1);
  const original = await (await request.get('/icons/icon-192.png')).body();
  expect(icon.subarray(icon.readUInt32LE(18))).toEqual(original);
});
