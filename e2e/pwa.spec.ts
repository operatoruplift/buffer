import { expect, test, type Page } from '@playwright/test';

const publicAssets = [
  '/offline.html',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
].sort();

async function prepareWorker(page: Page) {
  await page.goto('/app');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
  });
}

test('install manifest and original app icons are usable', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ id: '/', short_name: 'Buffer', start_url: '/app', scope: '/', display: 'standalone' });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: '/icons/icon-maskable-512.png', purpose: 'maskable', sizes: '512x512' }),
    expect.objectContaining({ src: '/icons/icon-192.png', purpose: 'any', sizes: '192x192' }),
  ]));
  for (const asset of [...manifest.icons.filter((icon: { type: string }) => icon.type === 'image/png'), { src: '/icons/apple-touch-icon.png', sizes: '180x180' }]) {
    const image = await request.get(asset.src);
    expect(image.ok(), asset.src).toBe(true);
    expect(image.headers()['content-type']).toContain('image/png');
    const bytes = await image.body();
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    const [width, height] = asset.sizes.split('x').map(Number);
    expect(bytes.readUInt32BE(16), asset.src).toBe(width);
    expect(bytes.readUInt32BE(20), asset.src).toBe(height);
  }
});

test('real offline navigation provides bounded deterministic fixture arithmetic', async ({ page, context }) => {
  await prepareWorker(page);
  await context.setOffline(true);
  await page.goto('/app');
  await expect(page).toHaveTitle('Buffer — Offline mode');
  await expect(page.getByText('Offline mode · fixed data', { exact: true })).toBeVisible();
  await expect(page.getByText('This is deterministic reference data, not your account.')).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Shared price move' });
  const total = page.locator('#scenario-total');
  await expect(total).toHaveText('0.00 USDC');
  await page.getByRole('button', { name: '−10%', exact: true }).click();
  await expect(total).toHaveText('+3,500.00 USDC');
  await expect(page.locator('#sol-delta')).toHaveText('−1,500.00 USDC');
  await expect(page.locator('#btc-delta')).toHaveText('+5,000.00 USDC');
  await page.getByRole('button', { name: 'Increase price move', exact: true }).click();
  await expect(slider).toHaveValue('-9');
  await expect(total).toHaveText('+3,150.00 USDC');
  await page.getByRole('button', { name: 'Decrease price move', exact: true }).click();
  await expect(total).toHaveText('+3,500.00 USDC');
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('-20');
  await expect(page.getByRole('button', { name: 'Decrease price move', exact: true })).toBeDisabled();
  await expect(total).toHaveText('+7,000.00 USDC');
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('20');
  await expect(page.getByRole('button', { name: 'Increase price move', exact: true })).toBeDisabled();
  await expect(total).toHaveText('−7,000.00 USDC');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(total).toHaveText('0.00 USDC');
  await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Your browser reports a connection' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to the app' }).click();
  await expect(page.getByRole('complementary', { name: 'Buffer app installation' })).toBeVisible();
});

test('service worker caches only fixed public files and cannot replay private responses', async ({ page, context }) => {
  await prepareWorker(page);
  const privatePaths = ['/api/pwa-private-probe/account', '/auth/pwa-private-probe/session', '/app/reports/pwa-private-probe/report'];
  await page.route('**/pwa-private-probe/**', (route) => route.fulfill({
    json: { privateTestPayload: true },
    headers: { 'Cache-Control': 'no-store' },
  }));
  for (const path of privatePaths) {
    expect(await page.evaluate(async (url) => (await fetch(url)).json(), path)).toEqual({ privateTestPayload: true });
  }
  const keys = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('buffer-public-'));
    const paths: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) paths.push(new URL(request.url).pathname);
    }
    return paths.sort();
  });
  expect(keys).toEqual(publicAssets);
  await page.unroute('**/pwa-private-probe/**');
  await context.setOffline(true);
  for (const path of privatePaths) {
    const outcome = await page.evaluate(async (url) => {
      try { return (await fetch(url)).status; } catch { return 'network-unavailable'; }
    }, path);
    expect(outcome).toBe('network-unavailable');
  }
});

test('install guide is available and a browser-supplied prompt is consumed once', async ({ page }) => {
  await page.goto('/app');
  const installation = page.getByRole('complementary', { name: 'Buffer app installation' });
  await installation.getByRole('link', { name: 'How to install' }).click();
  await expect(installation.getByText('iPhone & iPad', { exact: true })).toBeVisible();
  await expect(installation.getByText('Desktop', { exact: true })).toBeVisible();
  // This synthetic event checks our UI contract; it is not evidence of native device installation.
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => { document.documentElement.dataset.installPromptCount = String(Number(document.documentElement.dataset.installPromptCount ?? 0) + 1); },
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
    });
    window.dispatchEvent(event);
  });
  await installation.getByRole('button', { name: 'Install Buffer', exact: true }).click();
  await expect(installation.getByText('Installation dismissed.', { exact: false })).toBeVisible();
  await expect(installation.getByRole('button', { name: 'Install Buffer', exact: true })).toHaveCount(0);
  expect(await page.locator('html').getAttribute('data-install-prompt-count')).toBe('1');
});
