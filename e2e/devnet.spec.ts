import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { PROTOCOLS } from '../src/lib/protocols';
import { getSampleSnapshot } from '../src/lib/samples';
import { buildLiveLink, DEVNET_ACCOUNT_EXAMPLE, LIVE_RISK_EXAMPLE } from '../src/lib/live-link';
import type { Discovery, Snapshot } from '../src/lib/types';

// Synthetic responses test UI behavior only. They are not successful live verification.
function devnetSnapshot(): Snapshot {
  const sample = getSampleSnapshot('long-short');
  const now = Date.now();
  return {
    ...sample, protocol: PROTOCOLS.velocity, source: 'live', network: 'devnet', authority: DEVNET_ACCOUNT_EXAMPLE, sampleName: null,
    subaccount: { id: 1, name: 'Subaccount 2', address: DEVNET_ACCOUNT_EXAMPLE }, retrievedAt: new Date(now).toISOString(), expiresAt: new Date(now + 120_000).toISOString(),
    accountSlot: 123, observedSlot: 124, positions: sample.positions.map(position => ({ ...position, oracle: { ...position.oracle, slot: 123, readSlot: 124 } })),
    risk: { scope: 'cross-margin', totalCollateral: '50094.3', maintenanceRequirement: '16.5', maintenanceHeadroom: '50077.8', canBeLiquidated: false, status: 'clear', explanation: 'Synthetic devnet context.' },
    warnings: [], provenance: ['Synthetic devnet browser-test data.'],
  };
}
const discovery: Discovery = { authority: DEVNET_ACCOUNT_EXAMPLE, protocol: PROTOCOLS.velocity, retrievedAt: new Date().toISOString(), network: 'devnet',
  subaccounts: [{ id: 0, name: 'Main Account', address: DEVNET_ACCOUNT_EXAMPLE }, { id: 1, name: 'Subaccount 2', address: DEVNET_ACCOUNT_EXAMPLE }] };

async function mockNetworkReads(page: Page) {
  const requests: URL[] = [];
  await page.route('**/api/accounts?*', route => {
    const url = new URL(route.request().url()); requests.push(url);
    const devnet = url.searchParams.get('network') === 'devnet';
    const authority = url.searchParams.get('authority')!;
    return route.fulfill({ json: {
      authority, protocol: PROTOCOLS.velocity, retrievedAt: new Date().toISOString(),
      ...(devnet ? { network: 'devnet' } : {}),
      subaccounts: [{ id: devnet ? 1 : 0, name: devnet ? 'Devnet account' : 'Mainnet account', address: authority }],
    } });
  });
  await page.route('**/api/snapshot?*', route => {
    const url = new URL(route.request().url()); requests.push(url);
    const devnet = url.searchParams.get('network') === 'devnet';
    const authority = url.searchParams.get('authority')!;
    return route.fulfill({ json: {
      ...devnetSnapshot(), authority, network: devnet ? 'devnet' : 'mainnet-beta',
      subaccount: { id: Number(url.searchParams.get('subaccount')), name: devnet ? 'Devnet account' : 'Mainnet account', address: authority },
    } });
  });
  return requests;
}

async function expectMainnetExample(page: Page, requests: URL[], startIndex = 0) {
  await expect(page.locator('footer')).toContainText('Mainnet public account data');
  await expect(page.getByRole('group', { name: 'Network' }).getByRole('button', { name: 'Mainnet', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.selected-subaccount')).toContainText('Mainnet account · #0');
  const mainnetRequests = requests.slice(startIndex);
  expect(mainnetRequests.some(url => url.pathname === '/api/accounts')).toBe(true);
  expect(mainnetRequests.some(url => url.pathname === '/api/snapshot')).toBe(true);
  for (const url of mainnetRequests) {
    expect(url.searchParams.get('authority')).toBe(LIVE_RISK_EXAMPLE.authority);
    expect(url.searchParams.get('protocol')).toBe('velocity');
    expect(url.searchParams.get('network')).toBeNull();
  }
  await expect(page.locator('.public-example-note')).toContainText('account is not yours');
}

test('the fixed live-risk entry keeps its mainnet authority after choosing devnet', async ({ page }) => {
  const requests = await mockNetworkReads(page);
  await page.goto('/app');
  const network = page.getByRole('group', { name: 'Network' });
  await network.getByRole('button', { name: 'Devnet', exact: true }).click();
  await expect(network.getByRole('button', { name: 'Devnet', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Explore live risk', exact: true }).click();
  await expectMainnetExample(page, requests);
});

test('client navigation to a mainnet link replaces a previously selected devnet network', async ({ page }) => {
  const requests = await mockNetworkReads(page);
  await page.goto(buildLiveLink({ protocol: 'velocity', authority: DEVNET_ACCOUNT_EXAMPLE, subaccount: 1, network: 'devnet' }));
  await expect(page.locator('footer')).toContainText('Solana devnet public account data');
  await expect(page.getByRole('group', { name: 'Network' }).getByRole('button', { name: 'Devnet', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const firstMainnetRequest = requests.length;
  const mainnetLink = buildLiveLink({ ...LIVE_RISK_EXAMPLE, subaccount: 0 });
  // Use Next's exposed App Router so the existing Dashboard receives new query
  // props. page.goto would reload it and hide a stale network-state regression.
  await page.evaluate(link => {
    const browser = window as typeof window & { next: { router: { push: (href: string) => void } }; bufferNavigationSentinel?: boolean };
    browser.bufferNavigationSentinel = true;
    browser.next.router.push(link);
  }, mainnetLink);
  await expect(page).toHaveURL(new URL(mainnetLink, page.url()).href);
  await expectMainnetExample(page, requests, firstMainnetRequest);
  expect(await page.evaluate(() => (window as typeof window & { bufferNavigationSentinel?: boolean }).bufferNavigationSentinel)).toBe(true);
});

test('the Velocity network switch reads devnet, labels it, and keeps monitoring on mainnet', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/accounts?*', route => { requests.push(route.request().url()); return route.fulfill({ json: discovery }); });
  await page.route('**/api/snapshot?*', route => { requests.push(route.request().url()); return route.fulfill({ json: devnetSnapshot() }); });
  await page.goto('/app');
  const network = page.getByRole('group', { name: 'Network' });
  await expect(network.getByRole('button', { name: 'Mainnet' })).toHaveAttribute('aria-pressed', 'true');
  await network.getByRole('button', { name: 'Devnet' }).click();
  await expect(network.getByRole('button', { name: 'Devnet' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Reads Velocity’s devnet deployment/)).toBeVisible();
  await page.getByRole('button', { name: /Explore a live account/ }).click();
  await expect(page.getByText('Solana devnet public account data')).toBeVisible();
  expect(requests[0]).toContain('network=devnet');
  expect(new URL(requests[1]).searchParams.get('subaccount')).toBe('1');
  expect(new URL(requests[1]).searchParams.get('network')).toBe('devnet');
  await expect(page.getByText(/Monitoring covers Velocity accounts on Solana mainnet/).first()).toBeVisible();
  const explorer = `https://explorer.solana.com/address/${DEVNET_ACCOUNT_EXAMPLE}?cluster=devnet`;
  await expect(page.getByRole('link', { name: 'View authority on Solana Explorer', exact: true })).toHaveAttribute('href', explorer);
  await page.getByRole('button', { name: 'Method', exact: true }).click();
  const method = page.getByRole('dialog', { name: 'Method & coverage', exact: true });
  await expect(method.getByRole('link', { name: 'Explorer ↗', exact: true })).toHaveAttribute('href', explorer);
  await method.getByRole('button', { name: 'Close Method', exact: true }).click();

  await page.getByRole('button', { name: 'My reports', exact: true }).click();
  const reports = page.getByRole('dialog', { name: 'Saved perspectives.', exact: true });
  await expect(reports.getByText('ON THIS DEVICE', { exact: true })).toBeVisible();
  await reports.getByRole('button', { name: 'Save current scenario', exact: true }).click();
  await expect(reports.locator('li')).toHaveCount(1);
  await expect(reports.locator('li small')).toContainText('Live snapshot · Solana devnet · Historical');
  const [download] = await Promise.all([
    page.waitForEvent('download'), reports.getByRole('button', { name: 'Download JSON', exact: true }).click(),
  ]);
  const report = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(report).toMatchObject({ sourceMode: 'live', network: 'devnet', authority: DEVNET_ACCOUNT_EXAMPLE, selectedSubaccount: { id: 1 } });
  await page.reload();
  await page.getByRole('button', { name: 'My reports', exact: true }).click();
  await expect(reports.locator('li small')).toContainText('Live snapshot · Solana devnet · Historical');
});

test('a devnet link opens devnet, and devnet is not offered for other protocols', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/accounts?*', route => { requests.push(route.request().url()); return route.fulfill({ json: discovery }); });
  await page.route('**/api/snapshot?*', route => route.fulfill({ json: devnetSnapshot() }));
  await page.goto(`/app?protocol=velocity&authority=${DEVNET_ACCOUNT_EXAMPLE}&subaccount=1&network=devnet`);
  await expect(page.getByText('Solana devnet public account data')).toBeVisible();
  expect(requests[0]).toContain('network=devnet');
  await page.goto(`/app?protocol=pacifica&authority=${DEVNET_ACCOUNT_EXAMPLE}&network=devnet`);
  await expect(page.getByText('Devnet links are available for Velocity only. Choose a network below.')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Network' })).toHaveCount(1);
});
