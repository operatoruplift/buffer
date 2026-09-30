import { expect, test, type Page } from '@playwright/test';
import { buildLiveLink, LIVE_RISK_EXAMPLE } from '../src/lib/live-link';
import { PROTOCOLS } from '../src/lib/protocols';
import { getSampleSnapshot } from '../src/lib/samples';

async function mockMainnet(page: Page) {
  const reads: string[] = [];
  await page.route('**/api/accounts?*', route => {
    reads.push(route.request().url());
    return route.fulfill({ json: {
      // Mainnet discovery omits network; only devnet discovery carries it.
      authority: LIVE_RISK_EXAMPLE.authority, protocol: PROTOCOLS.velocity,
      retrievedAt: new Date().toISOString(),
      subaccounts: [{ id: 0, name: 'Navigation fixture', address: LIVE_RISK_EXAMPLE.authority }],
    } });
  });
  await page.route('**/api/snapshot?*', route => {
    reads.push(route.request().url());
    const fixture = getSampleSnapshot('long-short');
    return route.fulfill({ json: {
      ...fixture, source: 'live', network: 'mainnet-beta', protocol: PROTOCOLS.velocity,
      authority: LIVE_RISK_EXAMPLE.authority, sampleName: null,
      subaccount: { id: 0, name: 'Navigation fixture', address: LIVE_RISK_EXAMPLE.authority },
      retrievedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString(),
      accountSlot: 123, observedSlot: 124,
      positions: fixture.positions.map(position => ({ ...position, oracle: { ...position.oracle, slot: 123, readSlot: 124 } })),
      risk: { scope: 'cross-margin', totalCollateral: '11000', maintenanceRequirement: '1000', maintenanceHeadroom: '10000', canBeLiquidated: false, status: 'clear', explanation: 'Synthetic navigation-test observation.' },
    } });
  });
  return reads;
}

test('workspace navigation preserves an edited portfolio and focuses its destination', async ({ page }) => {
  const reads: string[] = [];
  page.on('request', request => { if (/\/api\/(accounts|snapshot)\?/.test(request.url())) reads.push(request.url()); });
  await page.goto('/app');
  const navigation = page.getByRole('navigation', { name: 'App navigation', exact: true });
  await expect(navigation).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove XRP-PERP', exact: true }).click();
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  const result = await page.getByTestId('scenario-total').innerText();
  const scenarioLink = navigation.getByRole('link', { name: 'What-if', exact: true });
  await scenarioLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#app-scenario$/);
  await expect(scenarioLink).toHaveAttribute('aria-current', 'location');
  await expect(page.getByRole('heading', { name: 'What if the market moves?', exact: true })).toBeFocused();

  await expect(page.locator('#monitoring [aria-busy="true"]')).toHaveCount(0);
  await navigation.getByRole('link', { name: 'Alerts', exact: true }).click();
  await expect(page).toHaveURL(/#monitoring$/);
  await expect(page.locator('#monitoring h2').first()).toBeFocused();
  await navigation.getByRole('link', { name: 'Positions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your perpetual positions', exact: true })).toBeFocused();
  await expect(page.getByRole('form', { name: /^Edit .+-PERP$/ })).toHaveCount(3);
  await expect(page.getByRole('form', { name: 'Edit XRP-PERP', exact: true })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Shared price move', exact: true })).toHaveValue('-10');
  await expect(page.getByTestId('scenario-total')).toHaveText(result);
  await navigation.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  expect(reads).toEqual([]);
});

test('section history preserves the mainnet account query and does not refetch its snapshot', async ({ page }) => {
  const reads = await mockMainnet(page);
  const link = buildLiveLink({ ...LIVE_RISK_EXAMPLE, subaccount: 0 });
  await page.goto(link);
  await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  const readCount = reads.length;
  const navigation = page.getByRole('navigation', { name: 'App navigation', exact: true });
  await navigation.getByRole('link', { name: 'What-if', exact: true }).click();
  await expect(page).toHaveURL(new URL(`${link}#app-scenario`, page.url()).href);
  await navigation.getByRole('link', { name: 'Positions', exact: true }).click();
  await expect(page).toHaveURL(new URL(`${link}#app-positions`, page.url()).href);
  await page.goBack();
  await expect(page).toHaveURL(new URL(`${link}#app-scenario`, page.url()).href);
  await expect(navigation.getByRole('link', { name: 'What-if', exact: true })).toHaveAttribute('aria-current', 'location');
  await expect(page.getByRole('heading', { name: 'What if the market moves?', exact: true })).toBeFocused();
  await expect(page.getByRole('slider', { name: 'Shared price move', exact: true })).toHaveValue('-10');
  await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
  expect(reads).toHaveLength(readCount);
});

test('unavailable panels cannot be opened while a live account has no snapshot', async ({ page }) => {
  await page.route('**/api/accounts?*', route => route.fulfill({ status: 503, json: { error: { code: 'RPC_UNAVAILABLE', message: 'Navigation test provider is unavailable.', retryable: true } } }));
  await page.goto(buildLiveLink(LIVE_RISK_EXAMPLE));
  await expect(page.getByRole('alert').filter({ hasText: 'Navigation test provider is unavailable.' })).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'App navigation', exact: true });
  for (const label of ['Positions', 'What-if']) {
    const destination = navigation.getByRole('link', { name: label, exact: true });
    await expect(destination).toHaveAttribute('aria-disabled', 'true');
    await expect(destination).not.toHaveAttribute('href');
    await expect(destination).toHaveAttribute('tabindex', '-1');
  }
  await navigation.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.getByRole('button', { name: 'Explore a preset', exact: true }).click();
  await expect(navigation.getByRole('link', { name: 'What-if', exact: true })).toHaveAttribute('href', '#app-scenario');
  await navigation.getByRole('link', { name: 'What-if', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Shared price move', exact: true })).toBeEnabled();
});

test('account selection keeps validation and pending feedback beside the form, then focuses the new snapshot', async ({ page }) => {
  const reads = await mockMainnet(page);
  await page.goto(buildLiveLink({ ...LIVE_RISK_EXAMPLE, subaccount: 0 }));
  await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
  const initialReads = reads.length;
  const panel = page.locator('#app-account');
  const address = panel.getByRole('textbox', { name: 'Solana wallet address', exact: true });
  await page.getByRole('link', { name: 'Choose an account', exact: true }).click();
  await expect(address).toBeFocused();
  await expect(address).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

  await address.fill('not-a-solana-address');
  await panel.getByRole('button', { name: 'Read account', exact: true }).click();
  const invalid = panel.getByRole('alert').filter({ hasText: 'Check the address' });
  await expect(invalid).toHaveCount(1);
  await expect(page.getByRole('alert').filter({ hasText: 'Check the address' })).toHaveCount(1);
  await expect(invalid).toBeInViewport({ ratio: 1 });
  await expect(address).toBeInViewport({ ratio: 1 });
  await expect(address).toHaveAttribute('aria-describedby', 'address-help account-read-error');
  expect(reads).toHaveLength(initialReads);

  let releaseDiscovery!: () => void;
  const discoveryReady = new Promise<void>(resolve => { releaseDiscovery = resolve; });
  await page.route('**/api/accounts?*', async route => {
    await discoveryReady;
    await route.fallback();
  });
  try {
    await address.fill(LIVE_RISK_EXAMPLE.authority);
    await panel.getByRole('button', { name: 'Read account', exact: true }).click();
    const pending = panel.getByRole('status').filter({ hasText: 'Finding Velocity accounts' });
    await expect(pending).toBeVisible();
    await expect(pending).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('status').filter({ hasText: 'Finding Velocity accounts' })).toHaveCount(1);
    await expect(address).toBeDisabled();
    await expect(invalid).toHaveCount(0);
    releaseDiscovery();

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('current-headroom')).toHaveText('+10,000.00 USD');
    await expect(page.locator('.freshness')).toContainText('Snapshot retrieved');
    await expect(pending).toHaveCount(0);
    await expect(address).toBeEnabled();
    expect(reads).toHaveLength(initialReads + 2);
  } finally {
    releaseDiscovery();
  }

  // A provider failure from the lower form must keep a usable path back to a preset.
  await page.route('**/api/accounts?*', route => route.fulfill({ status: 503, json: { error: { code: 'RPC_UNAVAILABLE', message: 'Account-form test provider is unavailable.', retryable: true } } }));
  await page.getByRole('link', { name: 'Choose an account', exact: true }).click();
  await expect(address).toBeFocused();
  await panel.getByRole('button', { name: 'Read account', exact: true }).click();
  const failure = panel.getByRole('alert').filter({ hasText: 'Account-form test provider is unavailable.' });
  await expect(failure).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('alert').filter({ hasText: 'Account-form test provider is unavailable.' })).toHaveCount(1);
  await failure.getByRole('button', { name: 'Explore a preset', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('current-headroom')).toHaveCount(0);
  await expect(page.getByRole('form', { name: /^Edit .+-PERP$/ })).toHaveCount(4);
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('+1,000.00');
});

test('smooth workspace navigation settles below the header and above mobile navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/app');
  // Establish hydration and font readiness before measuring a native animated scroll.
  await page.getByRole('button', { name: 'Method', exact: true }).click();
  const method = page.getByRole('dialog', { name: 'Method & coverage', exact: true });
  await expect(method).toBeVisible();
  await method.getByRole('button', { name: 'Close Method', exact: true }).click();
  await expect(method).not.toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const navigation = page.getByRole('navigation', { name: 'App navigation', exact: true });
  const destination = navigation.getByRole('link', { name: 'What-if', exact: true });
  await destination.focus();
  await page.keyboard.press('Enter');
  const section = page.locator('#app-scenario');
  // Poll the final visual position, rather than only checking focus while scrolling is in progress.
  await expect.poll(() => section.evaluate(element => Math.abs(element.getBoundingClientRect().top - parseFloat(getComputedStyle(element).scrollMarginTop)))).toBeLessThan(2);
  const heading = page.getByRole('heading', { name: 'What if the market moves?', exact: true });
  await expect(heading).toBeFocused();
  await expect(destination).toHaveAttribute('aria-current', 'location');
  const headingBox = (await heading.boundingBox())!;
  const headerBox = (await page.locator('.buffer-app .header').boundingBox())!;
  const navBox = (await navigation.boundingBox())!;
  expect(headingBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  if ((page.viewportSize()?.width ?? 0) < 1180) expect(headingBox.y + headingBox.height).toBeLessThan(navBox.y);
  else expect(headingBox.x).toBeGreaterThan(navBox.x + navBox.width);
});

for (const width of [375, 768, 1440]) {
  test(`workspace navigation remains usable without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app');
    const navigation = page.getByRole('navigation', { name: 'App navigation', exact: true });
    await navigation.getByRole('link', { name: 'What-if', exact: true }).click();
    const heading = page.getByRole('heading', { name: 'What if the market moves?', exact: true });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    const navBox = (await navigation.boundingBox())!;
    const headingBox = (await heading.boundingBox())!;
    expect(navBox.x).toBeGreaterThanOrEqual(0);
    expect(navBox.x + navBox.width).toBeLessThanOrEqual(width);
    if (width >= 1180) expect(headingBox.x).toBeGreaterThan(navBox.x + navBox.width);
    else expect(headingBox.y + headingBox.height).toBeLessThan(navBox.y);
    for (const destination of await navigation.getByRole('link').all()) {
      const bounds = (await destination.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
