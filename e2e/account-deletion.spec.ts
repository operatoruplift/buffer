import { expect, test, type Page, type Request } from '@playwright/test';
import { AUTH_MOCK_CONFIGURED, AUTH_STORAGE_KEY, SUPABASE_ORIGIN, authMockSession, authMockUser, installAuthMock } from './auth-mock';

const person = authMockUser('00000000-0000-4000-8000-00000000000a', 'leaving@example.test');
const reports = `${SUPABASE_ORIGIN}/rest/v1/saved_reports**`;
const deletion = `${SUPABASE_ORIGIN}/rest/v1/rpc/delete_own_account`;
const rehearsalKey = `buffer.alerts.rehearsal.v2:${person.id}`;

test.skip(!AUTH_MOCK_CONFIGURED, 'Requires configured public Supabase URL; every auth and database request stays intercepted locally.');

async function openAccount(page: Page) {
  await page.addInitScript(key => {
    if (sessionStorage.getItem('buffer.deletion-fixture')) return;
    sessionStorage.setItem('buffer.deletion-fixture', 'seeded');
    localStorage.setItem(key, JSON.stringify({ version: 2, rules: [], events: [], deliveries: [], monitors: [] }));
    localStorage.setItem('buffer.device-reports.v1', JSON.stringify({ version: 1, reports: [] }));
  }, rehearsalKey);
  await page.route(reports, route => route.fulfill({ json: [] }));
  await page.goto('/app');
  await page.locator('button[data-report-storage="cloud"]').click();
  const dialog = page.getByRole('dialog', { name: 'Saved perspectives.' });
  await expect(dialog.getByText('No reports saved yet.')).toBeVisible();
  return dialog;
}

test('a signed-in person deletes their account after an in-page confirmation', async ({ page }) => {
  const session = authMockSession(person);
  await installAuthMock(page, { session });
  const calls: Request[] = [];
  await page.route(deletion, route => { calls.push(route.request()); return route.fulfill({ json: person.id }); });
  let signedOut = 0;
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/logout**`, route => { signedOut++; return route.fulfill({ status: 403, json: { code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' } }); });
  const dialog = await openAccount(page);

  const section = dialog.getByRole('region', { name: 'Delete account' });
  await section.getByRole('button', { name: 'Delete account…' }).click();
  await expect(section.getByRole('heading', { name: `Delete ${person.email} permanently?` })).toBeFocused();
  for (const item of ['Saved reports', 'Monitored wallet addresses and alert rules', 'Alert destinations, events and delivery records']) await expect(section).toContainText(item);
  await expect(section.getByRole('link', { name: 'How deletion works' })).toHaveAttribute('href', '/privacy#delete-account');
  await section.getByRole('button', { name: 'Keep my account' }).click();
  await expect(section.getByRole('button', { name: 'Delete account…' })).toBeFocused();
  expect(calls).toHaveLength(0);

  await section.getByRole('button', { name: 'Delete account…' }).click();
  await section.getByRole('button', { name: 'Delete account permanently' }).click();

  const notice = page.getByRole('status').filter({ hasText: 'Account deleted.' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('You are signed out on this device.');
  await expect(page.locator('a.cloud-sign-in')).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(calls).toHaveLength(1);
  expect(calls[0].method()).toBe('POST');
  expect(calls[0].postData()).toBe('{}');
  // The caller's own session authorizes the call; the body names no account.
  expect(calls[0].headers().authorization).toBe(`Bearer ${session.access_token}`);
  expect(signedOut).toBe(1);
  expect(await page.evaluate(([session, alerts]) => [localStorage.getItem(session), localStorage.getItem(alerts), localStorage.getItem('buffer.device-reports.v1') !== null], [AUTH_STORAGE_KEY, rehearsalKey])).toEqual([null, null, true]);
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toHaveCount(0);
});

test('an unconfirmed deletion keeps the session, says so, and can be retried', async ({ page }) => {
  await installAuthMock(page, { session: authMockSession(person) });
  let reply: 'unavailable' | 'expired' | 'deleted' = 'unavailable';
  let calls = 0;
  await page.route(deletion, route => {
    calls++;
    if (reply === 'unavailable') return route.fulfill({ status: 503, json: { message: 'Mock unavailable' } });
    if (reply === 'expired') return route.fulfill({ status: 401, json: { code: 'PGRST301', message: 'JWT expired' } });
    return route.fulfill({ json: person.id });
  });
  const dialog = await openAccount(page);
  const section = dialog.getByRole('region', { name: 'Delete account' });
  await section.getByRole('button', { name: 'Delete account…' }).click();
  await section.getByRole('button', { name: 'Delete account permanently' }).click();
  await expect(section.getByRole('status')).toHaveText('Account deletion could not be confirmed. Try again; repeating it is safe.');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.user?.id, AUTH_STORAGE_KEY)).toBe(person.id);
  expect(await page.evaluate(key => localStorage.getItem(key) !== null, rehearsalKey)).toBe(true);

  reply = 'expired';
  await section.getByRole('button', { name: 'Delete account permanently' }).click();
  await expect(section.getByRole('status')).toHaveText('Your session has expired. Nothing was deleted. Sign in again, then retry.');
  await expect(dialog.getByText(person.email!, { exact: true })).toBeVisible();

  reply = 'deleted';
  await section.getByRole('button', { name: 'Delete account permanently' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Account deleted.' })).toBeVisible();
  expect(calls).toBe(3);
});

test('closing the dialog while a deletion is in flight neither cancels it nor hides its result', async ({ page }) => {
  await installAuthMock(page, { session: authMockSession(person) });
  let release: (() => Promise<void>) | undefined;
  await page.route(deletion, route => { release = () => route.fulfill({ json: person.id }).catch(() => {}); });
  const dialog = await openAccount(page);
  const section = dialog.getByRole('region', { name: 'Delete account' });
  await section.getByRole('button', { name: 'Delete account…' }).click();
  await section.getByRole('button', { name: 'Delete account permanently' }).click();
  await expect(section.getByRole('button', { name: 'Deleting your account…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Close saved reports' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect.poll(() => Boolean(release)).toBe(true);
  await release!();
  await expect(page.getByRole('status').filter({ hasText: 'Account deleted.' })).toBeVisible();
  await expect(page.locator('a.cloud-sign-in')).toBeVisible();
});
