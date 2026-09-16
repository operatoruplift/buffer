import { expect, test, type Page } from '@playwright/test';
import { AUTH_MOCK_CONFIGURED, AUTH_STORAGE_KEY, SUPABASE_ORIGIN, authMockSession, authMockUser, installAuthMock } from './auth-mock';

test.skip(!AUTH_MOCK_CONFIGURED, 'The local build needs public Supabase configuration; every Auth request is mocked.');

async function enterCredentials(page: Page, email = 'person-a@example.test') {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('mock-password-only');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
}

async function openRecovery(page: Page, user = authMockUser()) {
  const session = authMockSession(user);
  await installAuthMock(page, { user });
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, route => route.fulfill({ json: [] }));
  const fragment = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: '3600', expires_at: String(session.expires_at), token_type: 'bearer', type: 'recovery' });
  await page.goto(`/auth#${fragment}`);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/);
  return session;
}

test('confirmed sign-in persists through app reload using the real SDK and mocked transport', async ({ page }) => {
  await installAuthMock(page);
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, route => route.fulfill({ json: [] }));
  await page.goto('/auth');
  await enterCredentials(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('button', { name: 'My reports', exact: true })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.user.id, AUTH_STORAGE_KEY)).toBe(authMockUser().id);
  await page.reload();
  await expect(page.getByRole('button', { name: 'My reports', exact: true })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
});

test('failed sign-in stays on the form and only shows controlled error text', async ({ page }) => {
  await installAuthMock(page);
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/token?grant_type=password`, route => route.fulfill({ status: 400, json: { code: 'invalid_credentials', msg: 'secret backend detail must not render' } }));
  await page.goto('/auth');
  await enterCredentials(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Sign-in failed. Check your email, password, and email confirmation, then retry.')).toBeVisible();
  await expect(page.getByText('secret backend detail must not render')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/auth$/);
});

test('leaving a pending sign-in cancels transport and cannot create a late session', async ({ page }) => {
  await installAuthMock(page);
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, route => route.fulfill({ json: [] }));
  let release!: () => void;
  let arrived!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { arrived = resolve; });
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/token?grant_type=password`, async route => {
    arrived(); await pending;
    await route.fulfill({ json: authMockSession() }).catch(() => undefined);
  });
  await page.goto('/auth');
  await enterCredentials(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await started;
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Email address')).toBeDisabled();
  await page.getByRole('link', { name: 'Continue without an account' }).click();
  await expect(page).toHaveURL(/\/app$/);
  release();
  await page.waitForTimeout(250);
  expect(await page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'My reports', exact: true }).click();
  await expect(page.getByText('ON THIS DEVICE', { exact: true })).toBeVisible();
});

test('invalid callback text is sanitized and removed from the address bar', async ({ page }) => {
  await installAuthMock(page);
  await page.goto('/auth#error=access_denied&error_code=otp_expired&error_description=private-untrusted-callback-text');
  await expect(page.getByText('This account link is invalid or has expired. Request a new link or sign in with your password.')).toBeVisible();
  await expect(page.getByText('private-untrusted-callback-text')).toHaveCount(0);
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});

test('a recovery callback survives reload and updates the password without an email request', async ({ page }) => {
  const user = authMockUser();
  const session = authMockSession(user);
  await installAuthMock(page, { user });
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, route => route.fulfill({ json: [] }));
  let passwordUpdated = false;
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/user`, route => {
    if (route.request().method() === 'PUT') passwordUpdated = route.request().postDataJSON().password === 'replacement-mock-password';
    return route.fulfill({ json: user });
  });
  const fragment = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: '3600', expires_at: String(session.expires_at), token_type: 'bearer', type: 'recovery' });
  await page.goto(`/auth#${fragment}`);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('replacement-mock-password');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(passwordUpdated).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('buffer.auth-recovery.v1'))).toBeNull();
});

for (const replacementKind of ['different account', 'same account with a new session'] as const) {
  test(`recovery cannot update a silently persisted ${replacementKind}`, async ({ page }) => {
    await openRecovery(page);
    const replacementUser = replacementKind === 'different account' ? authMockUser('00000000-0000-4000-8000-000000000002', 'person-b@example.test') : authMockUser();
    const replacement = authMockSession(replacementUser, 3600, 'silent-replacement-session');
    let writes = 0;
    await page.route(`${SUPABASE_ORIGIN}/auth/v1/user`, route => {
      if (route.request().method() === 'PUT') writes++;
      return route.fulfill({ json: replacementUser });
    });
    // This tab writes storage directly: no storage event or SDK BroadcastChannel event tells the form.
    await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: AUTH_STORAGE_KEY, session: replacement });
    await page.getByLabel('Password', { exact: true }).fill('replacement-mock-password');
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to Buffer' })).toBeVisible();
    await expect(page.getByText('Your account session changed. Open the recovery link again before changing a password.')).toBeVisible();
    expect(writes).toBe(0);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.access_token, AUTH_STORAGE_KEY)).toBe(replacement.access_token);
    expect(await page.evaluate(() => sessionStorage.getItem('buffer.auth-recovery.v1'))).toBeNull();
  });
}

test('a recovery marker cannot restore reset mode for the same user’s new login session', async ({ page }) => {
  await openRecovery(page);
  const replacement = authMockSession(authMockUser(), 3600, 'fresh-login-session');
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: AUTH_STORAGE_KEY, session: replacement });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in to Buffer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Update password', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('buffer.auth-recovery.v1'))).toBeNull();
});

test('recovery accepts a rotated token that belongs to its original session', async ({ page }) => {
  const original = await openRecovery(page);
  const rotated = authMockSession(authMockUser(), 7200);
  expect(rotated.access_token).not.toBe(original.access_token);
  let outgoingToken = '';
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/user`, route => {
    if (route.request().method() === 'PUT') outgoingToken = route.request().headers().authorization;
    return route.fulfill({ json: authMockUser() });
  });
  await page.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: 'TOKEN_REFRESHED', session });
    channel.close();
  }, { key: AUTH_STORAGE_KEY, session: rotated });
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('replacement-mock-password');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(outgoingToken).toBe(`Bearer ${rotated.access_token}`);
  expect(await page.evaluate(() => sessionStorage.getItem('buffer.auth-recovery.v1'))).toBeNull();
});

test('a replacement session survives a delayed password response for the earlier recovery session', async ({ page }) => {
  await openRecovery(page);
  let release!: () => void;
  let arrived!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { arrived = resolve; });
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/user`, async route => {
    if (route.request().method() === 'PUT') { arrived(); await pending; }
    await route.fulfill({ json: authMockUser() }).catch(() => undefined);
  });
  await page.getByLabel('Password', { exact: true }).fill('replacement-mock-password');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await started;
  const replacement = authMockSession(authMockUser('00000000-0000-4000-8000-000000000002', 'person-b@example.test'));
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: AUTH_STORAGE_KEY, session: replacement });
  release();
  await expect(page.getByText('Your account session changed. Open the recovery link again before changing a password.')).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.access_token, AUTH_STORAGE_KEY)).toBe(replacement.access_token);
});

test('a replacement session survives the SDK password commit window after transport validation', async ({ page }) => {
  await openRecovery(page);
  const replacement = authMockSession(authMockUser('00000000-0000-4000-8000-000000000002', 'person-b@example.test'));
  // Change storage inside the SDK response.json() await, after transport checks but before _saveSession.
  await page.evaluate(({ key, session, originalId }) => {
    const nativeJson = Response.prototype.json;
    Response.prototype.json = async function () {
      const value = await nativeJson.call(this);
      if (value?.id === originalId) {
        Response.prototype.json = nativeJson;
        localStorage.setItem(key, JSON.stringify(session));
        sessionStorage.setItem('buffer.mock-commit-window', 'entered');
      }
      return value;
    };
  }, { key: AUTH_STORAGE_KEY, session: replacement, originalId: authMockUser().id });
  await page.getByLabel('Password', { exact: true }).fill('replacement-mock-password');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByText('Your account session changed. Open the recovery link again before changing a password.')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('buffer.mock-commit-window'))).toBe('entered');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.access_token, AUTH_STORAGE_KEY)).toBe(replacement.access_token);
  await expect(page).toHaveURL(/\/auth$/);
});

for (const mode of ['signin', 'signup'] as const) {
  const matchesSessionWrite = (url: URL) => url.origin === SUPABASE_ORIGIN && (mode === 'signup' ? url.pathname === '/auth/v1/signup' : url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password');
  test(`${mode} cannot overwrite a replacement login during the SDK session commit window`, async ({ page }) => {
    await installAuthMock(page);
    await page.goto(mode === 'signup' ? '/auth?mode=signup' : '/auth');
    test.skip(mode === 'signup' && await page.getByText(/Cloud accounts are being configured/).isVisible(), 'Signup requires the isolated test build with email readiness enabled.');
    await page.route(matchesSessionWrite, route => route.fulfill({ json: authMockSession() }));
    const replacement = authMockSession(authMockUser('00000000-0000-4000-8000-000000000002', 'person-b@example.test'));
    await page.evaluate(({ key, session }) => {
      const nativeJson = Response.prototype.json;
      Response.prototype.json = async function () {
        const value = await nativeJson.call(this);
        if (value?.access_token) {
          Response.prototype.json = nativeJson;
          localStorage.setItem(key, JSON.stringify(session));
          sessionStorage.setItem('buffer.mock-commit-window', 'entered');
        }
        return value;
      };
    }, { key: AUTH_STORAGE_KEY, session: replacement });
    await page.getByLabel('Email address').fill('person-a@example.test');
    await page.getByLabel('Password', { exact: true }).fill('mock-password-only');
    await page.getByRole('button', { name: mode === 'signup' ? 'Create account' : 'Sign in', exact: true }).click();
    await expect(page.getByText(mode === 'signup' ? 'That request could not be completed. Please check your details and retry.' : 'Sign-in failed. Check your email, password, and email confirmation, then retry.')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('buffer.mock-commit-window'))).toBe('entered');
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.access_token, AUTH_STORAGE_KEY)).toBe(replacement.access_token);
    await expect(page).toHaveURL(/\/auth(?:\?mode=signup)?$/);
  });

  test(`leaving ${mode} during SDK JSON parsing cannot commit a late session`, async ({ page }) => {
    await installAuthMock(page);
    await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, route => route.fulfill({ json: [] }));
    await page.goto(mode === 'signup' ? '/auth?mode=signup' : '/auth');
    test.skip(mode === 'signup' && await page.getByText(/Cloud accounts are being configured/).isVisible(), 'Signup requires the isolated test build with email readiness enabled.');
    await page.route(matchesSessionWrite, route => route.fulfill({ json: authMockSession() }));
    await page.evaluate(() => {
      const nativeJson = Response.prototype.json;
      Response.prototype.json = async function () {
        const value = await nativeJson.call(this);
        if (value?.access_token) {
          Response.prototype.json = nativeJson;
          sessionStorage.setItem('buffer.mock-commit-window', 'entered');
          await new Promise<void>(resolve => { (window as Window & { releaseAuthJson?: () => void }).releaseAuthJson = resolve; });
        }
        return value;
      };
    });
    await page.getByLabel('Email address').fill('person-a@example.test');
    await page.getByLabel('Password', { exact: true }).fill('mock-password-only');
    await page.getByRole('button', { name: mode === 'signup' ? 'Create account' : 'Sign in', exact: true }).click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('buffer.mock-commit-window'))).toBe('entered');
    await page.getByRole('link', { name: 'Continue without an account' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await page.evaluate(() => (window as Window & { releaseAuthJson?: () => void }).releaseAuthJson?.());
    await page.waitForTimeout(250);
    expect(await page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  });
}

test('expired stored sessions return to a working sign-in form', async ({ page }) => {
  await installAuthMock(page, { session: authMockSession(authMockUser(), -120) });
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/token?grant_type=refresh_token`, route => route.fulfill({ status: 400, json: { code: 'refresh_token_not_found', msg: 'Refresh token expired' } }));
  await page.goto('/auth');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page.getByText(/Signed in as/)).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
});

test('a replacement account cancels an older pending password sign-in', async ({ page, context }) => {
  await installAuthMock(page);
  let release!: () => void;
  let arrived!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { arrived = resolve; });
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/token?grant_type=password`, async route => {
    arrived(); await pending;
    await route.fulfill({ json: authMockSession() }).catch(() => undefined);
  });
  await page.goto('/auth');
  await enterCredentials(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await started;
  const other = await context.newPage();
  const replacement = authMockUser('00000000-0000-4000-8000-000000000002', 'person-b@example.test');
  await installAuthMock(other, { session: authMockSession(replacement), user: replacement });
  await other.goto('/auth');
  await expect(page.getByText(/Signed in as person-b@example.test/)).toBeVisible();
  release();
  await page.waitForTimeout(250);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), AUTH_STORAGE_KEY);
  expect(stored.user.id).toBe(replacement.id);
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await other.close();
});

test('signup and recovery obey the build’s email readiness gate', async ({ page }) => {
  await installAuthMock(page);
  const writes: { path: string; redirect: string | null }[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === SUPABASE_ORIGIN && ['/auth/v1/signup', '/auth/v1/recover'].includes(url.pathname)) writes.push({ path: url.pathname, redirect: url.searchParams.get('redirect_to') });
  });
  await page.goto('/auth?mode=signup');
  const gated = await page.getByText(/Cloud accounts are being configured/).isVisible();
  if (gated) {
    await expect(page.getByRole('button', { name: 'Create account', exact: true })).toHaveCount(0);
    expect(writes).toHaveLength(0);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  } else {
    await page.getByLabel('Email address').fill('new-person@example.test');
    await page.getByLabel('Password', { exact: true }).fill('signup-mock-password');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByText('Check your email for a confirmation link, then sign in to save your reports.')).toBeVisible();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  if (gated) {
    await expect(page.getByText(/Cloud accounts are being configured/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send recovery link', exact: true })).toHaveCount(0);
    expect(writes).toHaveLength(0);
  } else {
    await page.getByLabel('Email address').fill('person-a@example.test');
    await page.getByRole('button', { name: 'Send recovery link', exact: true }).click();
    await expect(page.getByText('If an account exists for this email, a recovery link will arrive shortly.')).toBeVisible();
    expect(writes.map(request => request.path)).toEqual(['/auth/v1/signup', '/auth/v1/recover']);
    expect(writes.every(request => request.redirect === `${new URL(page.url()).origin}/auth`)).toBe(true);
  }
});

test('a delayed sign-out event cannot replace a newer persisted account on the auth page', async ({ page }) => {
  const user = authMockUser('00000000-0000-4000-8000-000000000002', 'person-b@example.test');
  await installAuthMock(page, { session: authMockSession(user), user });
  await page.goto('/auth');
  await expect(page.getByText(/Signed in as person-b@example.test/)).toBeVisible();
  await page.evaluate(key => {
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: 'SIGNED_OUT', session: null });
    channel.close();
  }, AUTH_STORAGE_KEY);
  await page.waitForTimeout(150);
  await expect(page.getByText(/Signed in as person-b@example.test/)).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.user.id, AUTH_STORAGE_KEY)).toBe(user.id);
});

test('an already-revoked logout clears the local session while an unrelated HTTP 400 preserves it', async ({ page }) => {
  await installAuthMock(page, { session: authMockSession() });
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, route => route.fulfill({ json: [] }));
  let alreadyRevoked = false;
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/logout**`, route => route.fulfill({ status: 400, headers: { 'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version' }, json: { code: alreadyRevoked ? 'session_not_found' : 'bad_jwt', message: 'Mock logout error' } }));
  await page.goto('/app');
  await page.locator('button[data-report-storage="cloud"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('No reports saved yet.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(dialog.getByText('Could not sign out. Please retry.')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.user.id, AUTH_STORAGE_KEY)).toBe(authMockUser().id);
  alreadyRevoked = true;
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('a.cloud-sign-in')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
});

test('a stalled authentication request releases the form after its actual transport deadline', async ({ page }) => {
  await installAuthMock(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/token?grant_type=password`, async route => {
    await pending;
    await route.fulfill({ json: authMockSession() }).catch(() => undefined);
  });
  await page.goto('/auth');
  await enterCredentials(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Authentication is temporarily unavailable. Check your connection and try again.')).toBeVisible({ timeout: 18_000 });
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  release();
  expect(await page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
});
