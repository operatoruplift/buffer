import { test, expect } from '@playwright/test';
import { chooseOption } from './select-helper';
import { getSampleSnapshot } from '../src/lib/samples';
import { PROTOCOLS } from '../src/lib/protocols';
import { AUTH_MOCK_CONFIGURED, AUTH_STORAGE_KEY, authMockSession, authMockUser, installAuthMock } from './auth-mock';

const AUTHORITY = '11111111111111111111111111111111';

test('explicit local fixture persists once, idles after check, and pauses without losing history', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Know when headroom changes.' })).toBeVisible();
  await page.getByRole('button', { name: 'Configure rule' }).click();
  await expect(page.getByText('Local fixture rule configured on this device.')).toBeVisible();
  await page.getByRole('button', { name: 'Run fixture check' }).click();
  await expect(page.getByText('Delivered · mock sink')).toBeVisible();
  await expect(page.getByText('Mock delivery recorded.', { exact: true })).toBeVisible();
  await expect(page.getByText('Idle · manual checks', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run fixture check' }).click();
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem('buffer.alerts.v1:demo-local-owner')!).deliveries.length);
  expect(count).toBe(1);
  await page.reload();
  await expect(page.getByText('Delivered · mock sink')).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run fixture check' })).toBeDisabled();
  await expect(page.getByText('Monitoring paused. Pending deliveries cancelled.')).toBeVisible();
});

test('a live account with unavailable risk never becomes a fixture or configured monitor', async ({ page }) => {
  const now = Date.now();
  await page.route('**/api/accounts?*', route => route.fulfill({ json: { authority: AUTHORITY, protocol: PROTOCOLS.velocity, retrievedAt: new Date(now).toISOString(), subaccounts: [{ id: 0, name: 'Risk unavailable', address: AUTHORITY }] } }));
  await page.route('**/api/snapshot?*', route => route.fulfill({ json: {
    ...getSampleSnapshot('long-short'), source: 'live', network: 'mainnet-beta', protocol: PROTOCOLS.velocity,
    authority: AUTHORITY, sampleName: null, subaccount: { id: 0, name: 'Risk unavailable', address: AUTHORITY },
    retrievedAt: new Date(now).toISOString(), expiresAt: new Date(now + 120_000).toISOString(),
    positions: getSampleSnapshot('long-short').positions.map(position => ({ ...position, oracle: { ...position.oracle, slot: 123, readSlot: 123 } })),
    accountSlot: 123, observedSlot: 123,
    risk: { scope: 'cross-margin', totalCollateral: null, maintenanceRequirement: null, maintenanceHeadroom: null, canBeLiquidated: null, status: 'unavailable', explanation: 'Missing verified oracle inputs.' },
  } }));
  await page.goto('/app');
  await page.getByRole('textbox', { name: 'Solana wallet address', exact: true }).fill(AUTHORITY);
  await page.getByRole('button', { name: 'Read account', exact: true }).click();
  await chooseOption(page, 'Subaccount', 'Risk unavailable · #0');
  const panel = page.getByRole('region', { name: 'Know when headroom changes.' });
  await expect(panel.getByText(/Monitoring unavailable:/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Configure rule' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Run fixture check' })).toHaveCount(0);
  await expect(panel).not.toContainText('250 USD');
});

test('two tabs coordinate device rule edits and observe pauses', async ({ page, context }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Configure rule' }).click();
  const second = await context.newPage();
  await second.goto('/app');
  await expect(second.getByRole('button', { name: 'Update rule' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(second.getByRole('button', { name: 'Run fixture check' })).toBeDisabled();
  await expect(second.getByText('Paused', { exact: true })).toBeVisible();
});

test('account switch clears the previous owner monitor and sign-out restores only device settings', async ({ page }) => {
  test.skip(!AUTH_MOCK_CONFIGURED, 'Public Supabase URL required; all auth requests intercepted locally.');
  const a = authMockUser();
  const b = authMockUser('00000000-0000-4000-8000-000000000002', 'b@example.test');
  await installAuthMock(page, { session: authMockSession(a) });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Configure rule' }).click();
  await page.getByRole('button', { name: 'Run fixture check' }).click();
  await expect(page.getByText('Delivered · mock sink')).toBeVisible();
  await page.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: 'SIGNED_IN', session }); channel.close();
  }, { key: AUTH_STORAGE_KEY, session: authMockSession(b) });
  await expect(page.getByRole('button', { name: 'Configure rule' })).toBeVisible();
  await expect(page.getByText('Delivered · mock sink')).toHaveCount(0);
  await page.evaluate(key => {
    localStorage.removeItem(key);
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: 'SIGNED_OUT', session: null }); channel.close();
  }, AUTH_STORAGE_KEY);
  await expect(page.getByRole('button', { name: 'Configure rule' })).toBeVisible();
  await expect(page.getByText('Delivered · mock sink')).toHaveCount(0);
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`buffer.alerts.v1:${id}`)!).deliveries.length, a.id)).toBe(1);
});

test('corrupt device state stays intact and cannot be silently overwritten', async ({ page }) => {
  const broken = '{"version":1,"rules":"broken-history"}';
  await page.addInitScript(raw => localStorage.setItem('buffer.alerts.v1:demo-local-owner', raw), broken);
  await page.goto('/app');
  await expect(page.getByText(/Stored data is preserved/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Configure rule' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('buffer.alerts.v1:demo-local-owner'))).toBe(broken);
});
