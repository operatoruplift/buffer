import { expect, test, type Page } from '@playwright/test';

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('the privacy policy is public, specific to Buffer and states what deletion removes', async ({ page }) => {
  const response = await page.goto('/privacy');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Privacy policy — Buffer');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main).toContainText('Last updated: 7 October 2026');
  await expect(main).toContainText('Operator Uplift');
  await expect(main).toContainText('IPs are hashed for rate limiting and no address is stored.');
  for (const processor of ['Vercel', 'Supabase', 'Solana RPC provider', 'Velocity', 'Pacifica', 'Drift', 'Jupiter', 'Discord']) await expect(main).toContainText(processor);
  for (const record of ['Saved reports', 'Monitored wallet addresses and alert rules', 'Alert destinations', 'Alert events and delivery records']) await expect(page.locator('#delete-account')).toContainText(record);
  await expect(page.locator('#delete-account')).toContainText('BUFFER_WEBHOOK_DESTINATIONS_JSON');
  await expect(main).toContainText('18');
  await expect(main.getByRole('link', { name: 'github.com/operatoruplift/buffer/issues' }).first()).toHaveAttribute('href', 'https://github.com/operatoruplift/buffer/issues');
  await expect(main.getByRole('link', { name: 'Terms of use' }).first()).toHaveAttribute('href', '/terms');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await noOverflow(page);
});

test('the terms carry the Solana dApp Store clause and the read-only limits', async ({ page }) => {
  const response = await page.goto('/terms');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Terms of use — Buffer');
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main).toContainText('Last updated: 7 October 2026');
  await expect(main).toContainText('not trading advice');
  await expect(main).toContainText('cross-margin-hold-others-v1');
  await expect(main).toContainText('never asks for your seed phrase or private key');
  await expect(main).toContainText('Alerts can be delayed or fail');
  await expect(page.locator('#dapp-store')).toContainText('If you obtained Buffer through the Solana dApp Store, these terms are between you and Operator Uplift only.');
  await expect(page.locator('#dapp-store')).toContainText('Solana Mobile is not a party to these terms and has no responsibility or liability for Buffer, its content, or its support or maintenance.');
  for (const heading of ['No warranty', 'Limitation of liability', 'Governing law', 'Changes to these terms', 'Contact']) {
    await expect(main.getByRole('heading', { name: heading })).toBeVisible();
  }
  await expect(main.getByRole('link', { name: 'Privacy policy' }).first()).toHaveAttribute('href', '/privacy');
  await noOverflow(page);
});

test('the landing footer, the workspace and the sitemap all reach the legal pages', async ({ page, request }) => {
  await page.goto('/');
  const legal = page.getByRole('navigation', { name: 'Footer legal navigation', exact: true });
  await expect(legal.getByRole('link', { name: 'Terms of use', exact: true })).toHaveAttribute('href', '/terms');
  await legal.getByRole('link', { name: 'Privacy policy', exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();

  await page.goto('/app');
  const workspaceLegal = page.getByRole('navigation', { name: 'Legal', exact: true });
  await expect(workspaceLegal.getByRole('link', { name: 'Privacy', exact: true })).toBeVisible();
  await workspaceLegal.getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeVisible();

  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('<loc>https://bufferonsolana.vercel.app/privacy</loc>');
  expect(sitemap).toContain('<loc>https://bufferonsolana.vercel.app/terms</loc>');
});

test('the landing hero describes the read-only wallet connection accurately', async ({ page }) => {
  await page.goto('/');
  const note = page.locator('.buffer-hero-note');
  await expect(note).toHaveText('Read-only wallet connection. No signatures or trading permissions.');
  await expect(page.getByText('No wallet connection.', { exact: false })).toHaveCount(0);
  await expect(page.locator('#privacy').getByRole('link', { name: 'Read the privacy policy' })).toHaveAttribute('href', '/privacy');
});
