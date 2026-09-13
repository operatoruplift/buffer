import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { Session } from '@supabase/supabase-js';
import { AUTH_MOCK_CONFIGURED, AUTH_STORAGE_KEY, SUPABASE_ORIGIN, authMockSession, authMockUser, installAuthMock } from './auth-mock';
import { createReport } from '../src/lib/report';
import { getSampleSnapshot } from '../src/lib/samples';
import { calculateScenario } from '../src/lib/scenario';

const personA = authMockUser();
const personB = authMockUser('00000000-0000-4000-8000-000000000002', 'person-b@example.test');
const endpoint = `${SUPABASE_ORIGIN}/rest/v1/saved_reports**`;
const sample = getSampleSnapshot('partial-coverage');
const historical = createReport(sample, calculateScenario(sample, -10));
const row = { id: '00000000-0000-4000-8000-000000000010', title: 'Historical perspective', created_at: '2026-09-11T12:05:01.123456+00:00', report: historical };

test.skip(!AUTH_MOCK_CONFIGURED, 'Requires configured public Supabase URL; all auth/report requests remain intercepted locally.');

async function openLibrary(page: Page) {
  await page.goto('/app');
  await page.locator('button[data-report-storage="cloud"]').click();
  return page.getByRole('dialog');
}
async function replaceSession(page: Page, session: Session) {
  await page.evaluate(({ key, next }) => {
    localStorage.setItem(key, JSON.stringify(next));
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: 'SIGNED_IN', session: next });
    channel.close();
  }, { key: AUTH_STORAGE_KEY, next: session });
}

test('mocked cloud reports save, preserve exact historical JSON, delete and sign out', async ({ page }) => {
  await installAuthMock(page, { session: authMockSession(personA) });
  const rows: typeof row[] = [];
  let writes = 0;
  await page.route(endpoint, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') {
      expect(url.searchParams.get('user_id')).toBe(`eq.${personA.id}`);
      return route.fulfill({ json: rows });
    }
    if (request.method() === 'POST') {
      writes++;
      const inserted = request.postDataJSON();
      expect(inserted.user_id).toBe(personA.id);
      rows.push({ ...row, title: inserted.title, report: inserted.report });
      return route.fulfill({ status: 201 });
    }
    expect(request.method()).toBe('DELETE');
    expect(url.searchParams.get('user_id')).toBe(`eq.${personA.id}`);
    rows.length = 0;
    return route.fulfill({ status: 204 });
  });
  const dialog = await openLibrary(page);
  await expect(dialog.getByText('No reports saved yet.')).toBeVisible();
  expect(writes).toBe(0);
  await dialog.getByRole('button', { name: 'Save current scenario' }).click();
  await expect(dialog.getByText('Scenario saved to your private library.')).toBeVisible();
  expect(writes).toBe(1);
  const download = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download JSON' }).click()]);
  expect(JSON.parse(readFileSync((await download[0].path())!, 'utf8'))).toEqual(rows[0].report);
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByText('Report deleted.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('a.cloud-sign-in')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
});

test('failed and malformed cloud reads show retry without claiming the library is empty', async ({ page }) => {
  await installAuthMock(page, { session: authMockSession(personA) });
  let response: 'error' | 'invalid' | 'ready' = 'error';
  await page.route(endpoint, route => {
    expect(route.request().method()).toBe('GET');
    if (response === 'error') return route.fulfill({ status: 503, json: { message: 'Mock unavailable' } });
    if (response === 'invalid') return route.fulfill({ json: [{ ...row, report: { version: 1 } }] });
    return route.fulfill({ json: [row] });
  });
  const dialog = await openLibrary(page);
  await expect(dialog.getByText(/Saved reports could not be loaded or read/)).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText('No reports saved yet.')).toHaveCount(0);
  response = 'invalid';
  await dialog.getByRole('button', { name: 'Reload reports' }).click();
  await expect(dialog.getByText(/Saved reports could not be loaded or read/)).toBeVisible();
  await expect(dialog.locator('li')).toHaveCount(0);
  response = 'ready';
  await dialog.getByRole('button', { name: 'Reload reports' }).click();
  await expect(dialog.getByText('Historical perspective', { exact: true })).toBeVisible();
});

test('a hung cloud read ends at the deadline and can be retried', async ({ page }) => {
  await installAuthMock(page, { session: authMockSession(personA) });
  let hold = true;
  await page.route(endpoint, route => hold ? undefined : route.fulfill({ json: [] }));
  await page.goto('/app');
  await expect(page.locator('a.cloud-sign-in')).toHaveCount(0);
  await expect(page.locator('button[data-report-storage="cloud"]')).toBeVisible();
  await page.clock.install();
  const requested = page.waitForRequest(request => request.url().includes('/rest/v1/saved_reports'));
  await page.getByRole('button', { name: 'My reports', exact: true }).click();
  await requested;
  await page.clock.fastForward(15_001);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Reload reports' })).toBeVisible();
  await expect(dialog.getByText('No reports saved yet.')).toHaveCount(0);
  hold = false;
  await dialog.getByRole('button', { name: 'Reload reports' }).click();
  await expect(dialog.getByText('No reports saved yet.')).toBeVisible();
});

test('late report reads and logout completion cannot replace a newer signed-in identity', async ({ page }) => {
  await installAuthMock(page, { session: authMockSession(personA) });
  let holdRead = true;
  let oldRead: (() => Promise<void>) | undefined;
  await page.route(endpoint, route => {
    if (holdRead) { oldRead = () => route.fulfill({ json: [row] }).catch(() => {}); return; }
    return route.fulfill({ json: [] });
  });
  const dialog = await openLibrary(page);
  await expect(dialog.getByText('Working…')).toBeVisible();
  await expect.poll(() => Boolean(oldRead)).toBe(true);
  await replaceSession(page, authMockSession(personB));
  await expect(dialog.getByText(personB.email!, { exact: true })).toBeVisible();
  await oldRead!();
  await expect(dialog.locator('li')).toHaveCount(0);
  holdRead = false;
  await dialog.getByRole('button', { name: 'Close saved reports' }).click();
  await page.getByRole('button', { name: 'My reports', exact: true }).click();
  await expect(dialog.getByText('No reports saved yet.')).toBeVisible();
  let releaseLogout: (() => Promise<void>) | undefined;
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/logout**`, route => { releaseLogout = () => route.fulfill({ status: 204 }).catch(() => {}); });
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect.poll(() => Boolean(releaseLogout)).toBe(true);
  await replaceSession(page, authMockSession(personA));
  await expect(dialog.getByText(personA.email!, { exact: true })).toBeVisible();
  await releaseLogout!();
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.user?.id, AUTH_STORAGE_KEY)).toBe(personA.id);
  await expect(dialog.getByText(personA.email!, { exact: true })).toBeVisible();
});

test('logout failure retains the initiating session and offers a retry', async ({ page }) => {
  await installAuthMock(page, { session: authMockSession(personA) });
  await page.route(endpoint, route => route.fulfill({ json: [] }));
  let fail = true;
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/logout**`, route => fail ? route.fulfill({ status: 500, json: { message: 'Mock unavailable' } }) : route.fulfill({ status: 204 }));
  const dialog = await openLibrary(page);
  await expect(dialog.getByText('No reports saved yet.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(dialog.getByText('Could not sign out. Please retry.')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.user?.id, AUTH_STORAGE_KEY)).toBe(personA.id);
  fail = false;
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('a.cloud-sign-in')).toBeVisible();
});

test('uncertain writes require a read before retry and never auto-upload device reports', async ({ page }) => {
  await installAuthMock(page, { session: authMockSession(personA) });
  await page.addInitScript(saved => localStorage.setItem('buffer.device-reports.v1', JSON.stringify({ version: 1, reports: [saved] })), { ...row, created_at: '2026-09-11T12:05:01.123Z' });
  const rows: typeof row[] = [];
  let writes = 0;
  let failDelete = true;
  await page.route(endpoint, route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: rows });
    if (request.method() === 'POST') {
      writes++;
      const inserted = request.postDataJSON();
      rows.push({ ...row, report: inserted.report });
      return route.fulfill({ status: 400, json: { message: 'Mock ambiguous response' } });
    }
    if (failDelete) return route.fulfill({ status: 400, json: { message: 'Mock delete failure' } });
    rows.length = 0;
    return route.fulfill({ status: 204 });
  });
  const dialog = await openLibrary(page);
  await expect(dialog.getByText('No reports saved yet.')).toBeVisible();
  expect(writes).toBe(0);
  await dialog.getByRole('button', { name: 'Save current scenario' }).click();
  await expect(dialog.getByText('Saving could not be confirmed. Reload reports before trying again.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save current scenario' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Reload reports' }).click();
  await expect(dialog.locator('li')).toHaveCount(1);
  expect(writes).toBe(1);
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByText('Deletion could not be confirmed. Reload reports before trying again.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Reload reports' }).click();
  failDelete = false;
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByText('Report deleted.')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('buffer.device-reports.v1') || 'null').reports.length)).toBe(1);
});

for (const replacement of [
  { name: 'a different user', session: authMockSession(personB) },
  { name: 'a fresh session of the same user', session: authMockSession(personA, 3600, '00000000-0000-4000-8000-000000000099') },
]) {
  test(`logout never submits replacement credentials for ${replacement.name} before an auth event arrives`, async ({ page }) => {
    await installAuthMock(page, { session: authMockSession(personA) });
    await page.route(endpoint, route => route.fulfill({ json: [] }));
    let logoutRequests = 0;
    await page.route(`${SUPABASE_ORIGIN}/auth/v1/logout**`, route => { logoutRequests++; return route.fulfill({ status: 204 }); });
    const dialog = await openLibrary(page);
    await expect(dialog.getByText('No reports saved yet.')).toBeVisible();
    await page.clock.install();
    // A different tab can persist credentials before its auth broadcast reaches this tab.
    await page.evaluate(({ key, next }) => localStorage.setItem(key, JSON.stringify(next)), { key: AUTH_STORAGE_KEY, next: replacement.session });
    await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(dialog.getByText('Could not sign out. Please retry.')).toBeVisible();
    expect(logoutRequests).toBe(0);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), AUTH_STORAGE_KEY)).toEqual(replacement.session);
    // A late old logout event reconciles the persisted session without leaving
    // the account-initialization deadline alive to create a false error later.
    await page.evaluate(key => {
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: 'SIGNED_OUT', session: null });
      channel.close();
    }, AUTH_STORAGE_KEY);
    await expect(dialog.getByText(replacement.session.user.email!, { exact: true })).toBeVisible();
    await page.clock.fastForward(15_001);
    await expect(page.locator('button[data-report-storage="cloud"]')).toHaveAttribute('data-session-state', 'ready');
    expect(logoutRequests).toBe(0);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null').access_token, AUTH_STORAGE_KEY)).toBe(replacement.session.access_token);
  });
}

test('a stale USER_UPDATED event cannot replace the newer persisted account', async ({ page }) => {
  const original = authMockSession(personA);
  const replacement = authMockSession(personB);
  await installAuthMock(page, { session: original });
  await page.route(endpoint, route => route.fulfill({ json: [] }));
  const dialog = await openLibrary(page);
  await expect(dialog.getByText('No reports saved yet.')).toBeVisible();
  await page.clock.install();
  await page.evaluate(({ key, next, old }) => {
    localStorage.setItem(key, JSON.stringify(next));
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: 'USER_UPDATED', session: old });
    channel.close();
  }, { key: AUTH_STORAGE_KEY, next: replacement, old: original });
  await expect(dialog.getByText(personB.email!, { exact: true })).toBeVisible();
  await expect(dialog.getByText(personA.email!, { exact: true })).toHaveCount(0);
  await page.clock.fastForward(15_001);
  await expect(page.locator('button[data-report-storage="cloud"]')).toHaveAttribute('data-session-state', 'ready');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null').access_token, AUTH_STORAGE_KEY)).toBe(replacement.access_token);
});
