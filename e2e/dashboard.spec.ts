import { chooseOption } from './select-helper';
import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { getSampleSnapshot, SAMPLE_ACCOUNTS } from '../src/lib/samples';
import type { Discovery, Snapshot } from '../src/lib/types';

// Synthetic responses test UI behavior only. They are not successful live verification.
const AUTHORITY = '11111111111111111111111111111111';
const OTHER_AUTHORITY = 'So11111111111111111111111111111111111111112';
const errors = new WeakMap<Page, string[]>();

function mockSnapshot(id = 0, name = 'Mock main', authority = AUTHORITY): Snapshot {
  const snapshot = getSampleSnapshot('long-short');
  const now = Date.now();
  return {
    ...snapshot, source: 'live', network: 'mainnet-beta', authority, sampleName: null,
    subaccount: { id, name, address: AUTHORITY },
    retrievedAt: new Date(now).toISOString(), expiresAt: new Date(now + 120_000).toISOString(),
    accountSlot: 123, observedSlot: 124,
    warnings: ['Mocked response for UI verification only.'],
    provenance: ['Synthetic browser-test data. This does not verify Solana or protocol reads.'],
  };
}

function discovery(authority = AUTHORITY): Discovery {
  return {
    authority, retrievedAt: new Date().toISOString(),
    subaccounts: [{ id: 0, name: 'Mock main', address: AUTHORITY }, { id: 1, name: 'Mock second', address: AUTHORITY }],
  };
}

async function readAddress(page: Page, authority = AUTHORITY) {
  await page.getByRole('textbox', { name: 'Solana wallet address', exact: true }).fill(authority);
  await page.getByRole('button', { name: 'Read account', exact: true }).click();
}

async function mockedDiscovery(page: Page) {
  await page.route('**/api/accounts?*', route => route.fulfill({ json: discovery() }));
}

async function noOverflow(page: Page) {
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
}

test.beforeEach(async ({ page }) => {
  const collected: string[] = [];
  errors.set(page, collected);
  page.on('pageerror', error => collected.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) collected.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'No JavaScript exceptions or unexpected console errors').toEqual([]);
});

test('selectors support keyboard navigation, typeahead, dismissal, and a contained mobile menu', async ({ page }) => {
  await page.goto('/app');
  const selector = page.getByRole('combobox', { name: 'Try a sample', exact: true });
  await selector.focus();
  await page.keyboard.press('ArrowDown');
  const list = page.getByRole('listbox', { name: 'Try a sample', exact: true });
  await expect(list).toBeVisible();
  const menu = await list.boundingBox();
  const viewport = page.viewportSize()!;
  expect(menu!.x).toBeGreaterThanOrEqual(0);
  expect(menu!.y).toBeGreaterThanOrEqual(0);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(viewport.width);
  expect(menu!.y + menu!.height).toBeLessThanOrEqual(viewport.height);
  await page.keyboard.press('End');
  const last = list.getByRole('option', { name: SAMPLE_ACCOUNTS.at(-1)!.name, exact: true });
  await expect(last).toBeInViewport();
  await expect(selector).toHaveAttribute('aria-activedescendant', (await last.getAttribute('id'))!);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(selector).toHaveAttribute('aria-activedescendant', (await list.getByRole('option', { name: 'Long + short', exact: true }).getAttribute('id'))!);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(selector).toHaveText('SOL long');
  await expect(selector).toBeFocused();
  await expect(list).not.toBeVisible();
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('−1,500.00');
  await selector.focus();
  await page.keyboard.type('partial');
  await page.keyboard.press('Enter');
  await expect(selector).toHaveText('Partial coverage');
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  await selector.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Escape');
  await expect(selector).toHaveText('Partial coverage');
  await expect(selector).toBeFocused();
  await expect(list).not.toBeVisible();
  await selector.click();
  await page.getByRole('heading', { name: 'A little more perspective.' }).click();
  await expect(list).not.toBeVisible();
  await noOverflow(page);
});

test('complete deterministic sample journey: positions, preset, keyboard slider, Method, JSON, reset, refresh', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByText('Sample mode', { exact: true })).toBeVisible();
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  await chooseOption(page, 'Try a sample', 'SOL long');
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('−1,500.00');
  await chooseOption(page, 'Try a sample', 'Long + short');
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  await expect(page.getByRole('heading', { name: 'Your perpetual positions' })).toBeVisible();
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('+3,500.00');
  const contributions = page.locator('.contributions');
  await expect(contributions).toContainText('SOL-PERP');
  await expect(contributions).toContainText('−1,500.00 USDC');
  await expect(contributions).toContainText('BTC-PERP');
  await expect(contributions).toContainText('+5,000.00 USDC');
  const slider = page.getByRole('slider', { name: 'Shared price move' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('-9');
  await expect(page.getByTestId('scenario-total')).toContainText('+3,150.00');
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('-20');
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('20');
  await expect(page.getByTestId('scenario-total')).toContainText('−7,000.00');
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  const method = page.getByRole('button', { name: 'Method', exact: true });
  await method.click();
  const drawer = page.getByRole('dialog', { name: 'Method & coverage' });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('signed size × oracle price × price move');
  await expect(drawer).toContainText('Sample fixture — not a live read');
  await expect(drawer).toContainText('Modeled positions only: 2 of 2');
  await expect(drawer.getByRole('button', { name: 'Close Method' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(method).toBeFocused();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('buffer-sample-subaccount-0--10pct.json');
  const report = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(report.sourceMode).toBe('sample');
  expect(report.scenario.totalsByQuoteCurrency).toEqual([{ quote: 'USDC', delta: '3500' }]);
  expect(report.scenario.shockPercent).toBe(-10);
  expect(report.scenario.includedPositions).toHaveLength(2);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '-5%', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await noOverflow(page);
});

test('partial sample keeps excluded exposure, spot collateral/debt, and orders visible', async ({ page }) => {
  await page.goto('/app');
  await chooseOption(page, 'Try a sample', 'Partial coverage');
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('+3,500.00');
  await expect(page.locator('.coverage')).toContainText('Modeled positions only: 2 of 3');
  await expect(page.locator('.coverage')).toContainText('OTHER-PERP: Excluded');
  const inventory = page.getByRole('region', { name: 'Outside this price model' });
  await expect(inventory).toContainText('Collateral');
  await expect(inventory).toContainText('Debt');
  await expect(inventory).toContainText('35,000.00000');
  await expect(inventory).toContainText('12.50000');
  await expect(inventory).toContainText('2 orders');
  await noOverflow(page);
});

test('sample layout has responsive positions and result above controls; capture delivery screenshot', async ({ page }, testInfo) => {
  await page.goto('/app');
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('+1,000.00');
  await expect(page.getByRole('form', { name: 'Edit SOL-PERP', exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Edit XRP-PERP', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add perps', exact: true })).toBeVisible();
  const result = await page.getByTestId('scenario-total').boundingBox();
  const slider = await page.getByRole('slider').boundingBox();
  expect(result && slider && result.y < slider.y).toBe(true);
  await noOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await mkdir('screenshots', { recursive: true });
  await page.screenshot({ path: `screenshots/${testInfo.project.name}.png`, fullPage: true, animations: 'disabled', style: '.toast, nextjs-portal { visibility: hidden !important; }' });
});

test('invalid address has an explicit error and keeps the sample intact', async ({ page }) => {
  await page.goto('/app');
  await readAddress(page, 'invalid address');
  await expect(page.getByRole('alert').filter({ hasText: 'Check the address' })).toContainText('Check the address');
  await expect(page.getByText('Sample mode', { exact: true })).toBeVisible();
});

test('mocked live provider error is honest, retryable, and never swaps in fixtures', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/accounts?*', route => {
    reads++;
    return route.fulfill({ status: 503, json: { error: { code: 'RPC_UNAVAILABLE', message: 'Mock RPC unavailable. Retry this read.', retryable: true } } });
  });
  await page.goto('/app');
  await readAddress(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Mock RPC unavailable' })).toContainText('Mock RPC unavailable');
  await expect(page.getByText('Live mode', { exact: true })).toBeVisible();
  await expect(page.getByTestId('scenario-total')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  await expect(page.getByRole('alert').filter({ hasText: 'Mock RPC unavailable' })).toContainText('Mock RPC unavailable');
});

test('mocked no-account response offers a working sample entry', async ({ page }) => {
  await page.route('**/api/accounts?*', route => route.fulfill({ json: { ...discovery(), subaccounts: [] } }));
  await page.goto('/app');
  await readAddress(page);
  await expect(page.getByRole('heading', { name: 'No Velocity subaccounts found' })).toBeVisible();
  await page.getByRole('button', { name: 'Explore a sample' }).click();
  await expect(page.getByText('Sample mode', { exact: true })).toBeVisible();
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
});

test('mocked success requires explicit subaccount selection and refresh resets the scenario', async ({ page }) => {
  await mockedDiscovery(page);
  let reads = 0;
  await page.route('**/api/snapshot?*', route => { reads++; return route.fulfill({ json: mockSnapshot() }); });
  await page.goto('/app');
  await readAddress(page);
  await expect(page.getByRole('heading', { name: 'Choose one subaccount' })).toBeVisible();
  expect(reads).toBe(0);
  await chooseOption(page, 'Subaccount', 'Mock main · #0');
  await expect(page.getByRole('button', { name: 'Add perps', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Sample denomination', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('+3,500.00');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('slider')).toHaveValue('0');
  expect(reads).toBe(2);
  await page.getByRole('button', { name: 'Method', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Mock main · #0');
  await expect(page.getByRole('dialog')).toContainText('123');
  await expect(page.getByRole('dialog')).toContainText(AUTHORITY);
  await page.getByRole('button', { name: 'Close Method' }).click();
  await expect(page.getByRole('button', { name: 'Method', exact: true })).toBeFocused();
});

test('mocked selected subaccount with no positions and incomplete baseline shows unavailable metrics', async ({ page }) => {
  await mockedDiscovery(page);
  const snapshot = mockSnapshot();
  snapshot.positions = [];
  snapshot.metrics = snapshot.metrics.map(metric => ({ ...metric, value: null, explanation: 'Mock incomplete account coverage.' }));
  snapshot.inventoryAvailable = false;
  snapshot.spots = [];
  snapshot.orders = [];
  await page.route('**/api/snapshot?*', route => route.fulfill({ json: snapshot }));
  await page.goto('/app');
  await readAddress(page);
  await chooseOption(page, 'Subaccount', 'Mock main · #0');
  await expect(page.getByRole('heading', { name: 'No open perpetual positions' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Baseline account metrics' })).toContainText('Unavailable');
  await expect(page.getByTestId('scenario-total')).toContainText('Unavailable');
  await expect(page.getByRole('slider')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download report JSON' })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Outside this price model' })).toContainText('Spot balances unavailable.');
});

test('mocked failed refresh retains the original snapshot and pauses calculation', async ({ page }) => {
  await mockedDiscovery(page);
  const snapshot = mockSnapshot();
  let reads = 0;
  await page.route('**/api/snapshot?*', route => ++reads === 1
    ? route.fulfill({ json: snapshot })
    : route.fulfill({ status: 503, json: { error: { code: 'RPC_ERROR', message: 'Mock refresh failed.', retryable: true } } }));
  await page.goto('/app');
  await readAddress(page);
  await chooseOption(page, 'Subaccount', 'Mock main · #0');
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  const originalTime = await page.locator('.freshness small').textContent();
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Stale snapshot · calculations paused', { exact: true })).toBeVisible();
  await expect(page.getByTestId('scenario-total')).toContainText('Unavailable');
  await expect(page.getByRole('slider')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download report JSON' })).toBeDisabled();
  await expect(page.locator('.freshness small')).toHaveText(originalTime!);
  await expect(page.getByRole('heading', { name: 'Your perpetual positions' })).toBeVisible();
});

test('mocked live freshness expiry disables the result without replacing the snapshot', async ({ page }) => {
  await page.clock.install();
  await mockedDiscovery(page);
  const snapshot = mockSnapshot();
  await page.route('**/api/snapshot?*', route => route.fulfill({ json: snapshot }));
  await page.goto('/app');
  await readAddress(page);
  await chooseOption(page, 'Subaccount', 'Mock main · #0');
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  await page.clock.fastForward(121_000);
  await expect(page.getByText('Stale snapshot · calculations paused', { exact: true })).toBeVisible();
  await expect(page.getByRole('slider')).toBeDisabled();
  await expect(page.getByTestId('scenario-total')).toContainText('Unavailable');
});

test('mocked late previous subaccount response cannot overwrite the latest selection', async ({ page }) => {
  await mockedDiscovery(page);
  let releaseOld: (() => void) | undefined;
  let finishOld: (() => void) | undefined;
  let oldRequested = false;
  const oldResponse = new Promise<void>(resolve => { releaseOld = resolve; });
  const oldCompleted = new Promise<void>(resolve => { finishOld = resolve; });
  await page.route('**/api/snapshot?*', async route => {
    const id = new URL(route.request().url()).searchParams.get('subaccount');
    if (id === '0') { oldRequested = true; await oldResponse; }
    try {
      await route.fulfill({ json: mockSnapshot(Number(id), id === '0' ? 'Old delayed snapshot' : 'Current second snapshot') });
    } finally {
      if (id === '0') finishOld!();
    }
  });
  await page.goto('/app');
  await readAddress(page);
  const selection = page.getByLabel('Subaccount', { exact: true });
  await chooseOption(page, 'Subaccount', 'Mock main · #0');
  await expect.poll(() => oldRequested).toBe(true);
  await expect(page.getByRole('status').filter({ hasText: 'Reading selected subaccount' })).toBeVisible();
  await chooseOption(page, 'Subaccount', 'Mock second · #1');
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  releaseOld!();
  await oldCompleted;
  await page.getByRole('button', { name: 'Method', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Current second snapshot · #1');
  await expect(page.getByRole('dialog')).not.toContainText('Old delayed snapshot');
  await expect(selection).toHaveText('Mock second · #1');
});

test('mocked pending old wallet response cannot replace a newly chosen sample', async ({ page }) => {
  let releaseOld: (() => void) | undefined;
  let finishOld: (() => void) | undefined;
  let requested = false;
  const oldResponse = new Promise<void>(resolve => { releaseOld = resolve; });
  const oldCompleted = new Promise<void>(resolve => { finishOld = resolve; });
  await page.route('**/api/accounts?*', async route => {
    requested = true;
    await oldResponse;
    try {
      await route.fulfill({ json: discovery(OTHER_AUTHORITY) });
    } finally {
      finishOld!();
    }
  });
  await page.goto('/app');
  await readAddress(page, OTHER_AUTHORITY);
  await expect.poll(() => requested).toBe(true);
  await chooseOption(page, 'Try a sample', 'SOL long');
  releaseOld!();
  await oldCompleted;
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('−1,500.00');
  await expect(page.getByText('Sample mode', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Subaccount', { exact: true })).toHaveText('SOL long · #0');
});

test('mocked address copy controls and explorer links expose the full selected public addresses', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockedDiscovery(page);
  await page.route('**/api/snapshot?*', route => route.fulfill({ json: mockSnapshot() }));
  await page.goto('/app');
  await readAddress(page);
  await chooseOption(page, 'Subaccount', 'Mock main · #0');
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  await page.getByRole('button', { name: 'Copy full authority address' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(AUTHORITY);
  await expect(page.getByRole('link', { name: 'View authority on Solana Explorer' })).toHaveAttribute('href', `https://explorer.solana.com/address/${AUTHORITY}`);
  await page.getByRole('button', { name: 'Method', exact: true }).click();
  await page.getByRole('button', { name: 'Copy authority from Method' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(AUTHORITY);
  await page.getByRole('button', { name: 'Copy subaccount address' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(AUTHORITY);
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Explorer ↗', exact: true })).toHaveAttribute('href', `https://explorer.solana.com/address/${AUTHORITY}`);
  await noOverflow(page);
});
