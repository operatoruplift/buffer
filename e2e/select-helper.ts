import { expect, type Page } from '@playwright/test';

export async function chooseOption(page: Page, label: string, option: string) {
  const selector = page.getByRole('combobox', { name: label, exact: true });
  if (label === 'Account' || label === 'Subaccount') {
    const change = page.getByRole('button', { name: `Change ${label.toLowerCase()}`, exact: true });
    // Discovery can still be pending; wait for either supported account control.
    await expect.poll(async () => await selector.isVisible() || await change.isVisible()).toBe(true);
    if (!await selector.isVisible()) await change.click();
  }
  await selector.click();
  await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click();
}
