import { test, expect } from '@playwright/test';
import { PROTOCOLS } from '../src/lib/protocols';
import { getSampleSnapshot } from '../src/lib/samples';
import { DEVNET_ACCOUNT_EXAMPLE } from '../src/lib/live-link';
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
