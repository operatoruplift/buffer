import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { chooseOption } from './select-helper';

test('build a multi-perp portfolio, edit exact inputs, switch denomination, refresh and export it', async ({ page }) => {
  const reads: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (/\/api\/(accounts|snapshot)\?/.test(request.url())) reads.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app');
  await expect(page.getByRole('form', { name: /^Edit .+-PERP$/ })).toHaveCount(4);
  for (const asset of ['SOL', 'BTC', 'ETH', 'XRP']) {
    const image = page.getByRole('form', { name: `Edit ${asset}-PERP`, exact: true }).locator('img');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.getByRole('combobox', { name: 'Denomination', exact: true })).toHaveText('USDC');
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  await expect(page.getByTestId('scenario-total')).toContainText('+1,000.00');
  await expect(page.getByRole('region', { name: 'Baseline account metrics' })).toContainText('90,000.00');

  const add = page.getByRole('button', { name: 'Add perps', exact: true });
  await add.click();
  const catalog = page.getByRole('dialog', { name: 'Add perpetuals', exact: true });
  await expect(catalog).toBeVisible();
  await expect(catalog.getByRole('button', { name: /^(?:Add|Added) .+-PERP$/ })).toHaveCount(76);
  await expect(catalog.getByRole('button', { name: 'Added SOL-PERP', exact: true })).toBeDisabled();
  await catalog.getByRole('searchbox', { name: 'Search perpetuals' }).fill('hype');
  await catalog.getByRole('button', { name: 'Add HYPE-PERP', exact: true }).click();
  await expect(catalog.getByRole('button', { name: 'Added HYPE-PERP', exact: true })).toBeDisabled();
  await expect(catalog.getByRole('status')).toContainText('5 perps');
  await catalog.getByRole('searchbox', { name: 'Search perpetuals' }).fill('not-a-symbol');
  await expect(catalog.getByText(/No perpetuals match/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();

  const hype = page.getByRole('form', { name: 'Edit HYPE-PERP', exact: true });
  await hype.getByRole('button', { name: 'Short', exact: true }).click();
  await hype.getByRole('textbox', { name: 'Quantity · HYPE', exact: true }).fill('2');
  await hype.getByRole('textbox', { name: 'Reference price · USDC', exact: true }).fill('100');
  await hype.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(hype.getByRole('button', { name: 'Short', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('scenario-total')).toContainText('+1,020.00');

  await hype.getByRole('textbox', { name: 'Quantity · HYPE', exact: true }).fill('0');
  await hype.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(hype.getByRole('alert')).toContainText('greater than zero');
  await expect(page.getByTestId('scenario-total')).toContainText('+1,020.00');
  await hype.getByRole('textbox', { name: 'Quantity · HYPE', exact: true }).fill('2');
  await expect(hype.getByRole('alert')).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove XRP-PERP', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Edit XRP-PERP', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('scenario-total')).toContainText('+1,520.00');
  await chooseOption(page, 'Denomination', 'USDT');
  await expect(page.getByTestId('scenario-total')).toContainText('+1,520.00');
  await expect(page.getByTestId('scenario-total')).toContainText('USDT');
  await expect(hype.getByRole('textbox', { name: 'Reference price · USDT', exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Shared price move' })).toHaveValue('0');
  await expect(hype.getByRole('textbox', { name: 'Quantity · HYPE', exact: true })).toHaveValue('2');
  await expect(page.getByRole('combobox', { name: 'Denomination', exact: true })).toHaveText('USDT');
  await page.getByRole('button', { name: '-10%', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report JSON' }).click();
  const report = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  expect(report.sourceMode).toBe('sample');
  expect(report.positions).toHaveLength(4);
  expect(report.positions.find((position: { asset: string }) => position.asset === 'HYPE')).toMatchObject({ size: '-2', price: '100', quote: 'USDT' });
  expect(report.scenario.totalsByQuoteCurrency).toEqual([{ quote: 'USDT', delta: '1520' }]);
  expect(report.provenance.join(' ')).toContain('no currency conversion');
  expect(reads).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('denomination keeps the preset identity, and an edit names the portfolio inside the same list', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app');
  const preset = page.getByRole('combobox', { name: 'Try a preset', exact: true });
  const list = page.getByRole('listbox', { name: 'Try a preset', exact: true });
  await expect(preset).toHaveText('Four-market portfolio');

  // A denomination change is a display choice: the preset keeps its name and stays selected.
  await chooseOption(page, 'Denomination', 'USDT');
  await expect(preset).toHaveText('Four-market portfolio');
  await expect(page.getByRole('region', { name: 'Baseline account metrics' })).toContainText('USDT');
  await preset.click();
  await expect(list.getByRole('option', { name: 'Four-market portfolio', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(list).not.toBeVisible();

  // A composition change makes the portfolio the reader's own, and the picker lists it as a real choice.
  await page.getByRole('button', { name: 'Remove XRP-PERP', exact: true }).click();
  await expect(preset).toHaveText('Custom portfolio');
  await preset.click();
  await expect(list.getByRole('option', { name: 'Custom portfolio', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');

  // Choosing a preset again loads that fixture under its own name.
  await chooseOption(page, 'Try a preset', 'Four-market portfolio');
  await expect(preset).toHaveText('Four-market portfolio');
  await expect(page.getByRole('form', { name: 'Edit XRP-PERP', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
