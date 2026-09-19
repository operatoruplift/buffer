import { test, expect } from '@playwright/test';
import { getSampleSnapshot } from '../src/lib/samples';
import { PROTOCOLS } from '../src/lib/protocols';
import { AUTH_MOCK_CONFIGURED, AUTH_STORAGE_KEY, authMockSession, authMockUser, installAuthMock } from './auth-mock';
import type { Page } from '@playwright/test';
import type { MonitoringOverview } from '../src/lib/monitoring';

const AUTHORITY = '11111111111111111111111111111111';

test('explicit local fixture persists once, idles after check, and pauses without losing history', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Know when headroom changes.' })).toBeVisible();
  await page.getByRole('button', { name: 'Configure rule' }).click();
  await expect(page.getByText('Local example rule configured on this device.')).toBeVisible();
  await page.getByRole('button', { name: 'Run example check' }).click();
  await expect(page.getByText('Delivered · mock sink')).toBeVisible();
  await expect(page.getByText('Mock delivery recorded.', { exact: true })).toBeVisible();
  await expect(page.getByText('Idle · manual checks', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run example check' }).click();
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem('buffer.alerts.rehearsal.v2:demo-local-owner')!).deliveries.length);
  expect(count).toBe(1);
  await page.reload();
  await expect(page.getByText('Delivered · mock sink')).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run example check' })).toBeDisabled();
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
  await expect(page.getByRole('region', { name: 'Selected account' }).getByText('Risk unavailable · #0', { exact: true })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Know when headroom changes.' });
  await expect(panel.getByText(/Monitoring unavailable:/)).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Configure live rule' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Run example check' })).toHaveCount(0);
  await expect(panel).not.toContainText('250 USD');
});

test('two tabs coordinate device rule edits and observe pauses', async ({ page, context }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Configure rule' }).click();
  const second = await context.newPage();
  await second.goto('/app');
  await expect(second.getByRole('button', { name: 'Update rule' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(second.getByRole('button', { name: 'Run example check' })).toBeDisabled();
  await expect(second.getByText('Paused', { exact: true })).toBeVisible();
});

test('account switch clears the previous owner monitor and sign-out restores only device settings', async ({ page }) => {
  test.skip(!AUTH_MOCK_CONFIGURED, 'Public Supabase URL required; all auth requests intercepted locally.');
  const a = authMockUser();
  const b = authMockUser('00000000-0000-4000-8000-000000000002', 'b@example.test');
  await installAuthMock(page, { session: authMockSession(a) });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Configure rule' }).click();
  await page.getByRole('button', { name: 'Run example check' }).click();
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
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`buffer.alerts.rehearsal.v2:${id}`)!).deliveries.length, a.id)).toBe(1);
});

test('corrupt device state stays intact and cannot be silently overwritten', async ({ page }) => {
  const broken = '{"version":1,"rules":"broken-history"}';
  await page.addInitScript(raw => localStorage.setItem('buffer.alerts.rehearsal.v2:demo-local-owner', raw), broken);
  await page.goto('/app');
  await expect(page.getByText(/Stored data is preserved/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Configure rule' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('buffer.alerts.rehearsal.v2:demo-local-owner'))).toBe(broken);
});

const RULE_ID = '00000000-0000-4000-8000-000000000010';
const DESTINATION_ID = '00000000-0000-4000-8000-000000000020';
const EVENT_ID = '00000000-0000-4000-8000-000000000030';
function monitoringFixture(): MonitoringOverview {
  const at = new Date().toISOString();
  return { capability: { configured: true, sendEnabled: true, destinationAvailable: true, message: 'Discord monitoring configured.' },
    heartbeat: { lastRunAt: at, lastCompletedAt: at, status: 'healthy', mode: 'send' },
    destinations: [{ id: DESTINATION_ID, label: 'Buffer testing', provider: 'discord', verifiedAt: at, enabled: true, maskedDestination: 'Discord channel …1234' }],
    rules: [{ id: RULE_ID, version: 1, authority: AUTHORITY, subaccountId: 0, provider: 'velocity', network: 'mainnet-beta', metric: 'maintenance_headroom', unit: 'USD', direction: 'below', threshold: '300', cadenceMinutes: 15, timezone: 'UTC', cooldownMinutes: 15, hysteresis: '10', destinationId: DESTINATION_ID, enabled: true, monitoringState: 'fresh', lastAttemptAt: at, lastFreshCheck: at, inputExpiresAt: new Date(Date.now() + 120000).toISOString(), nextCheckAt: at, lastError: null, breached: true, createdAt: at, updatedAt: at }],
    events: [{ id: EVENT_ID, ruleId: RULE_ID, ruleVersion: 1, state: 'accepted_by_provider', observedAt: at, value: '250', threshold: '300', reason: 'Observed maintenance threshold crossed.', acceptedAt: at, deliveredAt: null, messageId: '123456789012345678', lastError: null, attempts: 1, preview: 'Buffer | TEST alert\nVelocity / Solana mainnet\nObserved: 250 USD' }],
  };
}
async function openLiveMonitoring(page: Page) {
  const now = Date.now();
  await page.route('**/api/accounts?*', route => route.fulfill({ json: { authority: AUTHORITY, protocol: PROTOCOLS.velocity, retrievedAt: new Date(now).toISOString(), subaccounts: [{ id: 0, name: 'Alert account', address: AUTHORITY }] } }));
  await page.route('**/api/snapshot?*', route => route.fulfill({ json: {
    ...getSampleSnapshot('long-short'), source: 'live', network: 'mainnet-beta', protocol: PROTOCOLS.velocity,
    authority: AUTHORITY, sampleName: null, subaccount: { id: 0, name: 'Alert account', address: AUTHORITY },
    retrievedAt: new Date(now).toISOString(), expiresAt: new Date(now + 120000).toISOString(), accountSlot: 123, observedSlot: 123,
    positions: getSampleSnapshot('long-short').positions.map(position => ({ ...position, oracle: { ...position.oracle, slot: 123, readSlot: 123 } })),
    risk: { scope: 'cross-margin', totalCollateral: '1200', maintenanceRequirement: '950', maintenanceHeadroom: '250', canBeLiquidated: false, status: 'clear', explanation: 'Verified fixture for intercepted browser transport.' },
  } }));
  await page.goto(`/app?protocol=velocity&authority=${AUTHORITY}&subaccount=0`);
  await expect(page.getByRole('region', { name: 'Know when headroom changes.' }).getByText('LIVE MONITORING', { exact: true })).toBeVisible();
}

test('live monitoring uses fresh-check API, separates acceptance from receipt, and cannot import rehearsal', async ({ page }) => {
  test.skip(!AUTH_MOCK_CONFIGURED, 'Public Supabase URL required; all auth and monitoring requests intercepted locally.');
  await installAuthMock(page, { session: authMockSession() });
  let state = monitoringFixture(); let freshRequests = 0;
  await page.route('**/api/monitoring**', route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    if (route.request().url().endsWith('/check')) {
      freshRequests++;
      state = structuredClone(state); state.events[0].state = 'delivered'; state.events[0].deliveredAt = new Date().toISOString();
    }
    return route.fulfill({ json: state });
  });
  await page.addInitScript(() => localStorage.setItem('buffer.alerts.rehearsal.v2:demo-local-owner', '{"broken":"must never be read by live mode"}'));
  await openLiveMonitoring(page);
  const panel = page.getByRole('region', { name: 'Know when headroom changes.' });
  await expect(panel.getByText('Accepted by Discord', { exact: true }).first()).toBeVisible();
  await expect(panel.getByText('Receipt verified', { exact: true })).toHaveCount(0);
  await expect(panel).not.toContainText('mock sink');
  await panel.getByRole('button', { name: 'Run fresh check' }).click();
  await expect(panel.getByText('Receipt verified', { exact: true }).first()).toBeVisible();
  expect(freshRequests).toBe(1);
  await panel.getByText('Delivery history (1)', { exact: true }).click();
  await expect(panel.getByText('Discord message: 123456789012345678')).toBeVisible();
});

test('uncertain sends remain visible and unavailable status cannot claim a running worker', async ({ page }) => {
  test.skip(!AUTH_MOCK_CONFIGURED, 'Public Supabase URL required; all auth and monitoring requests intercepted locally.');
  await installAuthMock(page, { session: authMockSession() });
  const state = monitoringFixture(); state.events[0].state = 'unknown_outcome'; state.events[0].messageId = null; state.events[0].acceptedAt = null;
  let unavailable = false;
  await page.route('**/api/monitoring**', route => unavailable ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Monitoring storage unavailable.', retryable: true } } }) : route.fulfill({ json: state }));
  await openLiveMonitoring(page);
  const panel = page.getByRole('region', { name: 'Know when headroom changes.' });
  await expect(panel.getByText('Outcome unknown', { exact: true }).first()).toBeVisible();
  await panel.getByText('Delivery history (1)', { exact: true }).click();
  await expect(panel.getByText(/will not be posted again automatically/)).toBeVisible();
  unavailable = true;
  await panel.getByRole('button', { name: 'Refresh monitoring status' }).click();
  await expect(panel.getByText('Monitoring storage unavailable.')).toBeVisible();
  await expect(panel.getByText('Running · sending enabled', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Run fresh check' })).toBeDisabled();
});

test('a recorded heartbeat expires on screen while the browser remains open', async ({ page }) => {
  test.skip(!AUTH_MOCK_CONFIGURED, 'Public Supabase URL required; all auth and monitoring requests intercepted locally.');
  await page.clock.install();
  await installAuthMock(page, { session: authMockSession() });
  const state = monitoringFixture();
  await page.route('**/api/monitoring**', route => route.fulfill({ json: state }));
  await openLiveMonitoring(page);
  const panel = page.getByRole('region', { name: 'Know when headroom changes.' });
  await expect(panel.getByText('Running · sending enabled', { exact: true })).toBeVisible();
  await page.clock.fastForward(195000);
  await expect(panel.getByText('Running · sending enabled', { exact: true })).toHaveCount(0);
});

test('sign-out clears hosted rule and receipt data immediately', async ({ page }) => {
  test.skip(!AUTH_MOCK_CONFIGURED, 'Public Supabase URL required; all auth and monitoring requests intercepted locally.');
  await installAuthMock(page, { session: authMockSession() });
  await page.route('**/api/monitoring**', route => route.fulfill({ json: monitoringFixture() }));
  await openLiveMonitoring(page);
  const panel = page.getByRole('region', { name: 'Know when headroom changes.' });
  await expect(panel.getByRole('button', { name: 'Update live rule' })).toBeVisible();
  await page.evaluate(key => {
    localStorage.removeItem(key); const channel = new BroadcastChannel(key);
    channel.postMessage({ event: 'SIGNED_OUT', session: null }); channel.close();
  }, AUTH_STORAGE_KEY);
  await expect(panel.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Update live rule' })).toHaveCount(0);
  await expect(panel.getByText('Accepted by Discord', { exact: true })).toHaveCount(0);
});

test('saved live rules remain manageable when provider discovery fails on a cold visit', async ({ page }) => {
  test.skip(!AUTH_MOCK_CONFIGURED, 'Public Supabase URL required; all auth and monitoring requests intercepted locally.');
  await installAuthMock(page, { session: authMockSession() });
  const state = monitoringFixture(); let paused = false;
  await page.route('**/api/accounts?*', route => route.fulfill({ status: 503, json: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Public provider unavailable.', retryable: true } } }));
  await page.route('**/api/monitoring**', route => {
    if (route.request().method() === 'PATCH') {
      expect(route.request().url()).toContain(RULE_ID); expect(route.request().postDataJSON()).toEqual({ enabled: false });
      paused = true; state.rules[0].enabled = false; state.rules[0].monitoringState = 'paused'; state.rules[0].version++;
    }
    return route.fulfill({ json: state });
  });
  await page.goto(`/app?protocol=velocity&authority=${AUTHORITY}`);
  await expect(page.getByRole('main').getByText('Public provider unavailable.', { exact: true })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Know when headroom changes.' });
  await panel.getByRole('combobox', { name: 'Saved live rule' }).click();
  await page.getByRole('option', { name: /Enabled/ }).click();
  await expect(panel.getByRole('button', { name: 'Update live rule' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  expect(paused).toBe(true);
  await expect(panel.getByText('Accepted by Discord', { exact: true }).first()).toBeVisible();
});
