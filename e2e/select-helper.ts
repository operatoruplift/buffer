import { type Page } from '@playwright/test';

export async function chooseOption(page: Page, label: string, option: string) {
  const selector = page.getByRole('combobox', { name: label, exact: true });
  if ((label === 'Account' || label === 'Subaccount') && !await selector.isVisible()) {
    await page.getByRole('button', { name: `Change ${label.toLowerCase()}`, exact: true }).click();
  }
  await selector.click();
  await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click();
}
