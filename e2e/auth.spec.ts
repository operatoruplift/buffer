import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

type Credential = { email: string; password: string };
const path = process.env.BUFFER_AUTH_FIXTURES;
const credentials: Credential[] = path ? JSON.parse(readFileSync(path, 'utf8')) : [];
test.skip(!path, 'Requires two disposable confirmed Supabase accounts; no signup emails are sent.');

async function signIn(page: Page, credential: Credential) {
  await page.goto('/auth');
  await page.getByLabel('Email address').fill(credential.email);
  await page.getByLabel('Password', { exact: true }).fill(credential.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('button', { name: 'My reports', exact: true })).toBeVisible();
}

test('real Supabase login, save, download, auth-switch race, isolation, delete and logout', async ({ page, context }) => {
  test.setTimeout(240_000);
  await signIn(page, credentials[0]);
  await page.getByRole('button', { name: 'My reports', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('No reports saved yet.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save current scenario' }).click();
  await expect(dialog.getByText('Scenario saved to your private library.')).toBeVisible();
  await expect(dialog.locator('li')).toHaveCount(1);
  const [download] = await Promise.all([
    page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download JSON' }).click(),
  ]);
  const downloaded = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(downloaded).toMatchObject({ version: 1, sourceMode: 'sample' });
  expect(downloaded.scenario.totalsByQuoteCurrency[0].delta).toBe('0');
  await dialog.getByRole('button', { name: 'Close saved reports' }).click();

  let release!: () => void;
  let arrived!: () => void;
  let settled!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { arrived = resolve; });
  const completed = new Promise<void>(resolve => { settled = resolve; });
  await page.route('**/rest/v1/saved_reports?*', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    arrived(); await blocked; await route.fulfill({ response }); settled();
  });
  await page.getByRole('button', { name: 'My reports', exact: true }).click();
  await requested;
  const otherTab = await context.newPage();
  await signIn(otherTab, credentials[1]);
  await expect(dialog.getByText(credentials[1].email, { exact: true })).toBeVisible();
  release(); await completed;
  await expect(dialog.locator('li')).toHaveCount(0);
  await expect(dialog.getByText(credentials[0].email, { exact: true })).toHaveCount(0);
  await page.unroute('**/rest/v1/saved_reports?*');
  await dialog.getByRole('button', { name: 'Close saved reports' }).click();
  await page.getByRole('button', { name: 'My reports', exact: true }).click();
  await expect(dialog.getByText('No reports saved yet.')).toBeVisible();
  await otherTab.close();

  await signIn(page, credentials[0]);
  await page.getByRole('button', { name: 'My reports', exact: true }).click();
  await expect(dialog.locator('li')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByText('Report deleted.')).toBeVisible();
  await expect(dialog.locator('li')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'My reports', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'My reports', exact: true }).click();
  await expect(page.getByText('ON THIS DEVICE', { exact: true })).toBeVisible();
});
