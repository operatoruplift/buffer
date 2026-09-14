import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { chooseOption } from './select-helper';
import { PROTOCOLS } from '../src/lib/protocols';
import { CONFIGURED_PERP_MARKETS } from '../src/lib/perp-markets';
import type { Snapshot } from '../src/lib/types';

test('Pacifica markets, account reads, source timestamps and portable scenarios work together', async ({ page }) => {
  // Synthetic account data verifies the UI contract; live public API checks are separate.
  const authority = 'Ep1d8JdFw4FnB85XDgXGVabYutro4JzK285HQqW6TZE2';
  const observedAt = new Date().toISOString();
  const subaccount = { id: 0, name: 'Wallet account', address: null };
  const snapshot: Snapshot = {
    protocol: PROTOCOLS.pacifica, source: 'live', network: 'mainnet-beta', authority,
    sampleName: null, subaccount, retrievedAt: observedAt, expiresAt: new Date(Date.now() + 120_000).toISOString(),
    accountSlot: null, observedSlot: null, metrics: [], spots: [], orders: [], inventoryAvailable: false,
    warnings: ['Synthetic browser-test account.'], provenance: ['Public API test response. No chain slot is supplied.'],
    positions: [{
      ...CONFIGURED_PERP_MARKETS.pacifica.find(market => market.asset === 'kBONK')!,
      id: 'test-kbonk', size: '-10000', price: '0.01', quote: 'USD', notional: '100', modeled: true,
      exclusionReason: null, isolated: false,
      oracle: { slot: null, readSlot: null, valid: true, reason: null, observedAt },
    }],
  };
  const requested: URL[] = [];
  await page.route('**/api/accounts?*', route => {
    requested.push(new URL(route.request().url()));
    return route.fulfill({ json: { authority, retrievedAt: observedAt, subaccounts: [subaccount], protocol: PROTOCOLS.pacifica } });
  });
  await page.route('**/api/snapshot?*', route => {
    requested.push(new URL(route.request().url()));
    return route.fulfill({ json: snapshot });
  });
  await page.goto('/app');
  await chooseOption(page, 'Protocol', 'Pacifica');
  await page.getByRole('button', { name: 'Method', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Reference fixture — no live read');
  await expect(page.getByRole('dialog')).not.toContainText('API price timestamp:');
  await expect(page.getByRole('dialog')).not.toContainText('Pacifica public API');
  await page.keyboard.press('Escape');
  await page.getByText('76 perpetual markets on Pacifica', { exact: true }).click();
  await expect(page.locator('.market-symbols > span')).toHaveCount(76);
  await page.getByLabel('Find a market', { exact: true }).fill('bonk');
  await expect(page.locator('.market-symbols > span')).toHaveText(['kBONK']);
  await page.getByLabel('Find a market', { exact: true }).fill('not-a-market');
  await expect(page.getByText('No matching markets.')).toBeVisible();
  await page.getByRole('button', { name: 'Explore a live account', exact: true }).click();
  await chooseOption(page, 'Account', 'Wallet account · #0');
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('+10.00');
  await expect(page.getByTestId('scenario-total')).toContainText('USD');
  expect(requested).toHaveLength(2);
  for (const url of requested) {
    expect(url.searchParams.get('authority')).toBe(authority);
    expect(url.searchParams.get('protocol')).toBe('pacifica');
  }
  await page.getByRole('button', { name: 'Method', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Method & coverage' });
  await expect(dialog).toContainText('Pacifica public API');
  await expect(dialog).toContainText('API price timestamp:');
  await expect(dialog.locator('dt').filter({ hasText: /^Program$/ })).toHaveCount(0);
  await expect(dialog).not.toContainText('Unavailable (fixture)');
  await page.keyboard.press('Escape');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report JSON' }).click();
  const report = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  expect(report.protocol).toEqual(PROTOCOLS.pacifica);
  expect(report.positions[0].oracle.observedAt).toBe(observedAt);
  expect(report.observedSlots.account).toBeNull();
  expect(report.scenario.totalsByQuoteCurrency).toEqual([{ quote: 'USD', delta: '10' }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
