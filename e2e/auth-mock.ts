import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { Session, User } from '@supabase/supabase-js';

function configuredPublicUrl() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return process.env.NEXT_PUBLIC_SUPABASE_URL;
  try { return readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1]; }
  catch { return undefined; }
}

const configuredUrl = configuredPublicUrl();
export const AUTH_MOCK_CONFIGURED = Boolean(configuredUrl);
export const SUPABASE_ORIGIN = new URL(configuredUrl || 'https://buffer-auth-test.supabase.co').origin;
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_ORIGIN).hostname.split('.')[0]}-auth-token`;

export function authMockUser(id = '00000000-0000-4000-8000-000000000001', email = 'person-a@example.test'): User {
  return { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-09-12T00:00:00Z', email_confirmed_at: '2026-09-12T00:00:00Z' };
}

export function authMockSession(user = authMockUser(), expiresIn = 3600, sessionId = user.id): Session {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, exp: expiresAt, session_id: sessionId })}.bG9jYWwtbW9jay1zaWduYXR1cmU`;
  return { access_token: token, refresh_token: `local-mock-refresh-${sessionId}`, token_type: 'bearer', expires_in: expiresIn, expires_at: expiresAt, user };
}

/** All Auth requests are intercepted; fixtures never submit credentials or send email to a real project. */
export async function installAuthMock(page: Page, { session = null, user = session?.user || authMockUser() }: { session?: Session | null; user?: User } = {}) {
  const testOrigin = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(testOrigin.hostname)) throw new Error('Mock auth verification only runs against a local Buffer server.');
  await page.addInitScript(({ storageKey, initialSession }) => {
    if (!sessionStorage.getItem('buffer.mock-auth.initialized')) {
      sessionStorage.setItem('buffer.mock-auth.initialized', 'true');
      if (initialSession) localStorage.setItem(storageKey, JSON.stringify(initialSession));
      else localStorage.removeItem(storageKey);
    }
  }, { storageKey: AUTH_STORAGE_KEY, initialSession: session });
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: user });
    if (url.pathname.endsWith('/token')) return route.fulfill({ json: authMockSession(user) });
    if (url.pathname.endsWith('/signup')) return route.fulfill({ json: { user, session: null } });
    if (url.pathname.endsWith('/recover')) return route.fulfill({ json: {} });
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (url.pathname.endsWith('/settings')) return route.fulfill({ json: { external: { email: true }, disable_signup: false, mailer_autoconfirm: false } });
    return route.fulfill({ status: 400, json: { code: 'mock_endpoint_unavailable', msg: 'Unexpected mock auth endpoint.' } });
  });
}
