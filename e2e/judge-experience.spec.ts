import { chooseOption } from './select-helper';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('sample quick start gives a real result, contribution explanation, Method, and portable report', async ({ page }) => {
  const reads: string[] = [];
  page.on('request', request => {
    if (/\/api\/(accounts|snapshot)\?/.test(request.url())) reads.push(request.url());
  });
  await page.goto('/app');
  const guide = page.getByRole('region', { name: 'Sample quick start' });
  const start = guide.getByRole('button', { name: 'Try a −10% move' });
  await expect(start).toBeInViewport();
  await expect(page.getByTestId('scenario-total')).toContainText('0.00');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const baseline = await page.getByRole('region', { name: 'Baseline account metrics' }).innerText();

  await start.click();
  await expect(page.getByRole('heading', { name: 'What if the market moves?' })).toBeFocused();
  await expect(page.getByTestId('scenario-total')).toContainText('+3,500.00');
  await expect(page.getByTestId('scenario-total')).toBeInViewport();
  await expect(page.getByRole('slider', { name: 'Shared price move' })).toHaveValue('-10');
  await expect(page.getByRole('region', { name: 'Baseline account metrics' })).toHaveText(baseline, { useInnerText: true });
  await guide.getByRole('button', { name: 'Inspect contributions' }).click();
  await expect(page.getByRole('heading', { name: 'Position contributions' })).toBeFocused();
  await expect(page.locator('.contributions')).toContainText('−1,500.00 USDC');
  await expect(page.locator('.contributions')).toContainText('+5,000.00 USDC');

  const method = guide.getByRole('button', { name: 'Read the method' });
  await method.click();
  const drawer = page.getByRole('dialog', { name: 'Method & coverage' });
  await expect(drawer).toContainText('Sample fixture — not a live read');
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(method).toBeFocused();

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report JSON' }).click();
  const download = await downloading;
  const report = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(report.sourceMode).toBe('sample');
  expect(report.scenario.shockPercent).toBe(-10);
  expect(report.scenario.totalsByQuoteCurrency).toEqual([{ quote: 'USDC', delta: '3500' }]);
  expect(reads).toEqual([]);

  await guide.getByRole('button', { name: 'Hide sample guide' }).click();
  await expect(start).not.toBeVisible();
  await guide.getByRole('button', { name: 'Show sample guide' }).click();
  await chooseOption(page, 'Try a sample', 'SOL long');
  await start.click();
  await expect(page.getByTestId('scenario-total')).toContainText('−1,500.00');
});

test('scenario comes before account details on mobile and quick start never appears in live mode', async ({ page }, testInfo) => {
  await page.goto('/app');
  const scenario = await page.getByRole('region', { name: 'What if the market moves?' }).boundingBox();
  const baseline = await page.getByRole('region', { name: 'Baseline account metrics' }).boundingBox();
  const positions = await page.getByRole('region', { name: 'Your perpetual positions' }).boundingBox();
  expect(scenario && baseline && positions).toBeTruthy();
  if (testInfo.project.name === 'mobile') {
    expect(scenario!.y).toBeLessThan(baseline!.y);
    expect(scenario!.y).toBeLessThan(positions!.y);
    for (const control of [
      page.getByLabel('Try a sample', { exact: true }),
      page.getByLabel('Subaccount', { exact: true }),
      page.getByRole('button', { name: '-10%', exact: true }),
    ]) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.getByRole('textbox', { name: 'Solana wallet address', exact: true }).evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
  } else {
    expect(baseline!.y).toBeLessThan(scenario!.y);
    expect(positions!.x).toBeLessThan(scenario!.x);
    expect(Math.abs(positions!.y - scenario!.y)).toBeLessThan(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // This synthetic failure verifies mode boundaries, not a successful chain read.
  await page.route('**/api/accounts?*', route => route.fulfill({
    status: 503,
    json: { error: { code: 'RPC_UNAVAILABLE', message: 'Test provider is unavailable.', retryable: true } },
  }));
  await page.getByRole('textbox', { name: 'Solana wallet address', exact: true }).fill('11111111111111111111111111111111');
  await page.getByRole('button', { name: 'Read account', exact: true }).click();
  await expect(page.getByText('Live mode', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sample quick start' })).toHaveCount(0);
  await expect(page.getByTestId('scenario-total')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'Account read unsuccessful' })).toContainText('Test provider is unavailable.');
});
