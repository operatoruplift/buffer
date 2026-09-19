import { expect, test } from '@playwright/test';
import { chooseOption } from './select-helper';
import { PROTOCOLS } from '../src/lib/protocols';
import type { Snapshot } from '../src/lib/types';

// Synthetic UI contract; canonical bytes/live verification are separate provider tests.
const authority = '8vXZp5DRsAKGv6QwfqKjZ2MQgMT6arfYYpoCqAN2b9aw';
const account = { id: 0, name: 'Wallet account', address: authority };
function snapshot(): Snapshot {
  const retrievedAt = new Date().toISOString();
  return {
    protocol: PROTOCOLS.jupiter, source: 'live', network: 'mainnet-beta', authority, sampleName: null, subaccount: account,
    retrievedAt, expiresAt: new Date(Date.now() + 120_000).toISOString(), accountSlot: null, observedSlot: 123,
    metrics: [], spots: [], orders: [], inventoryAvailable: false, warnings: ['Synthetic Jupiter inventory.'], provenance: ['Mocked UI data; no live verification claimed.'],
    positions: [{ id: 'jupiter-short', marketIndex: 0, market: 'SOL-PERP', asset: 'SOL', size: '0', price: null, quote: 'USD', notional: '5353.838028',
      modeled: false, isolated: false, exclusionReason: 'Jupiter inventory only: current prices, collateral dependencies, and lockedAmount caps are not modeled.',
      oracle: { valid: false, reason: 'Current price not decoded.', slot: null, readSlot: null },
      inventory: { kind: 'jupiter-perps', direction: 'short', sizeUsd: '5353.838028', entryPriceUsd: '105.140073', collateralUsd: '1000',
        lockedAmount: '5354.639992', lockedAmountAtomic: '5354639992', lockedToken: 'USDC', lockedTokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        positionAddress: '13pmELWTxfCxLnKSSeNUH1eevMQVHTZr8vqDEiSDBT5', custody: '7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz', collateralCustody: 'G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa',
        oracleAddress: authority, oracleType: 'pyth', oracleMaxPriceAgeSec: 5, updatedAt: retrievedAt, positionSlot: 123, custodySlot: 122, collateralCustodySlot: 122 },
    }],
  };
}

test('Jupiter is selectable and shows exact inventory without a price-effect total', async ({ page }) => {
  const requested: string[] = [];
  await page.route('**/api/accounts?*', route => { requested.push(route.request().url()); return route.fulfill({ json: { protocol: PROTOCOLS.jupiter, authority, subaccounts: [account], retrievedAt: new Date().toISOString() } }); });
  await page.route('**/api/snapshot?*', route => { requested.push(route.request().url()); return route.fulfill({ json: snapshot() }); });
  await page.goto('/app');
  await expect(page.getByRole('combobox', { name: 'Protocol', exact: true })).toContainText('Velocity');
  await chooseOption(page, 'Protocol', 'Jupiter Perps');
  await expect(page.getByText('3 perpetual markets on Jupiter Perps · inventory only')).toBeVisible();
  await page.getByRole('button', { name: 'Explore a live account' }).click();
  await expect(page.locator('.selected-subaccount')).toContainText('Wallet account · #0');
  await expect(page.getByRole('button', { name: 'Change account', exact: true })).toBeVisible();
  await expect(page.getByText('Inventory only', { exact: true })).toBeVisible();
  await expect(page.getByText('↘ Short', { exact: true })).toBeVisible();
  await expect(page.getByTestId('scenario-total')).toContainText('Unavailable');
  await expect(page.getByRole('slider')).toBeDisabled();
  await expect(page.getByText('105.140073 USD', { exact: false })).toBeVisible();
  await expect(page.getByText('5,354.639992000 USDC', { exact: false })).toBeVisible();
  await page.getByText('Position sources', { exact: true }).click();
  await expect(page.getByText('5354639992', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Method', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Jupiter position units and maximum-profit constraints' })).toBeVisible();
  await page.keyboard.press('Escape');
  const originalTime = await page.locator('.freshness small').textContent();
  await chooseOption(page, 'Protocol', 'Velocity');
  const prior = page.getByRole('alert').filter({ hasText: 'Showing the previous Jupiter Perps observation' });
  await expect(prior).toContainText(authority);
  await expect(prior).toContainText('Wallet account · #0');
  await expect(prior).toContainText('These values do not describe the new selection.');
  await expect(page.getByRole('combobox', { name: 'Protocol', exact: true })).toContainText('Velocity');
  await expect(page.getByText('Inventory only', { exact: true })).toBeVisible();
  await expect(page.locator('.freshness small')).toHaveText(originalTime!);
  await expect(page.getByTestId('scenario-total')).toContainText('Unavailable');
  await expect(page.getByRole('slider')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download report JSON' })).toBeDisabled();
  expect(requested.every(url => new URL(url).searchParams.get('protocol') === 'jupiter')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Jupiter outage stays an error and is never represented as zero positions', async ({ page }) => {
  await page.route('**/api/accounts?*', route => route.fulfill({ status: 503, json: { error: { code: 'RPC_ERROR', message: 'Jupiter test read unavailable.', retryable: true } } }));
  await page.goto('/app');
  await chooseOption(page, 'Protocol', 'Jupiter Perps');
  await page.getByRole('button', { name: 'Explore a live account' }).click();
  await expect(page.getByText('Jupiter test read unavailable.')).toBeVisible();
  await expect(page.getByText(/No Jupiter Perps/)).toHaveCount(0);
  await expect(page.getByText('Demo mode', { exact: true })).toHaveCount(0);
});
