import { expect, test, type Page } from '@playwright/test';
import { buildLiveLink, LIVE_RISK_EXAMPLE, LIVE_RISK_LINK } from '../src/lib/live-link';
import { PROTOCOLS } from '../src/lib/protocols';
import { getSampleSnapshot } from '../src/lib/samples';
import type { Snapshot } from '../src/lib/types';
import { chooseOption } from './select-helper';

// Synthetic responses verify browser state only; provider verification is separate.
const OTHER = 'So11111111111111111111111111111111111111112';
function account(id = 0) { return { id, name: id === 0 ? 'Primary' : 'Second', address: LIVE_RISK_EXAMPLE.authority }; }
function observation(authority: string, id: number): Snapshot {
  const sample = getSampleSnapshot('long-short');
  return { ...sample, source: 'live', network: 'mainnet-beta', protocol: PROTOCOLS.velocity, authority, sampleName: null,
    subaccount: account(id), retrievedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString(), accountSlot: 123, observedSlot: 124,
    positions: sample.positions.map(position => ({ ...position, oracle: { ...position.oracle, slot: 123, readSlot: 124 } })),
    risk: { scope: 'cross-margin', totalCollateral: '11000', maintenanceRequirement: '1000', maintenanceHeadroom: '10000', canBeLiquidated: false, status: 'clear', explanation: 'Synthetic cross-margin maintenance observation.' },
  };
}
async function mockReads(page: Page, ids = [0]) {
  const reads: URL[] = [];
  await page.route('**/api/accounts?*', route => {
    const url = new URL(route.request().url()); reads.push(url);
    return route.fulfill({ json: { protocol: PROTOCOLS.velocity, authority: url.searchParams.get('authority'), retrievedAt: new Date().toISOString(), subaccounts: ids.map(account) } });
  });
  await page.route('**/api/snapshot?*', route => {
    const url = new URL(route.request().url()); reads.push(url);
    return route.fulfill({ json: observation(url.searchParams.get('authority')!, Number(url.searchParams.get('subaccount'))) });
  });
  return reads;
}

test('landing live-risk entry loads a single fresh account and keeps current risk separate from the scenario', async ({ page }) => {
  const reads = await mockReads(page);
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Explore live risk Public Velocity account' });
  await expect(link).toHaveAttribute('href', LIVE_RISK_LINK);
  await link.click();
  await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
  await expect(page.locator('.selected-subaccount')).toContainText('Primary · #0');
  await expect(page.getByRole('button', { name: 'Change subaccount', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Subaccount', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Change subaccount', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Subaccount', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox', { name: 'Subaccount', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('+3,500.00');
  await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
  expect(reads.filter(url => url.pathname === '/api/snapshot')).toHaveLength(1);
  const discoveryCount = reads.filter(url => url.pathname === '/api/accounts').length;
  expect(discoveryCount).toBeGreaterThanOrEqual(1); // Development Strict Mode may abort and replay the first discovery.
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  await page.reload();
  await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
  expect(reads.filter(url => url.pathname === '/api/accounts').length).toBeGreaterThan(discoveryCount);
  expect(reads.filter(url => url.pathname === '/api/snapshot')).toHaveLength(3);
  await expect(page.locator('.public-example-note')).toContainText('account is not yours');
  const risk = await page.locator('.risk-context').boundingBox();
  const scenario = await page.locator('.scenario').boundingBox();
  expect(risk!.y).toBeLessThanOrEqual(scenario!.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('initial app exposes live risk without sign-in, and multiple accounts remain a deliberate choice', async ({ page }) => {
  const reads = await mockReads(page, [0, 1]);
  await page.goto('/app');
  await page.getByRole('button', { name: 'Explore live risk', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose one subaccount' })).toBeVisible();
  expect(reads.filter(url => url.pathname === '/api/snapshot')).toHaveLength(0);
  await chooseOption(page, 'Subaccount', 'Second · #1');
  await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
  expect(reads.at(-1)!.searchParams.get('subaccount')).toBe('1');
});

test('direct links respect a discovered ID, changed authority and browser history', async ({ page }) => {
  const reads = await mockReads(page, [0, 1]);
  await page.goto(buildLiveLink({ ...LIVE_RISK_EXAMPLE, subaccount: 1 }));
  await expect(page.getByRole('combobox', { name: 'Subaccount', exact: true })).toHaveText('Second · #1');
  await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
  await page.goto(buildLiveLink({ protocol: 'velocity', authority: OTHER, subaccount: 0 }));
  await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
  expect(reads.at(-1)!.searchParams.get('authority')).toBe(OTHER);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('combobox', { name: 'Subaccount', exact: true })).toHaveText('Second · #1');
  await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
  expect(reads.at(-1)!.searchParams.get('authority')).toBe(LIVE_RISK_EXAMPLE.authority);
});

test('invalid links, absent accounts and provider errors leave a working preset path', async ({ page }) => {
  const reads = await mockReads(page, []);
  await page.goto('/app?protocol=velocity&authority=bad&subaccount=-1');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('valid Solana public address');
  expect(reads).toHaveLength(0);
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  await page.goto(LIVE_RISK_LINK);
  await expect(page.getByRole('heading', { name: 'No Velocity subaccounts found' })).toBeVisible();
  await page.getByRole('button', { name: 'Explore a preset', exact: true }).click();
  await expect(page.getByRole('slider')).toBeEnabled();
  await page.route('**/api/accounts?*', route => route.fulfill({ status: 503, json: { error: { code: 'READ_FAILED', message: 'Provider unavailable.', retryable: true } } }));
  await page.getByRole('button', { name: 'Explore live risk', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Provider unavailable.');
  await page.getByRole('button', { name: 'Explore a preset', exact: true }).click();
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).not.toContainText('Unavailable');
});

test('a missing linked ID cannot silently select a different account', async ({ page }) => {
  const reads = await mockReads(page, [0]);
  await page.goto(buildLiveLink({ ...LIVE_RISK_EXAMPLE, subaccount: 9 }));
  await expect(page.getByRole('main').getByRole('alert')).toContainText('linked subaccount was not returned');
  expect(reads.filter(url => url.pathname === '/api/snapshot')).toHaveLength(0);
  await chooseOption(page, 'Subaccount', 'Primary · #0');
  await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
});
