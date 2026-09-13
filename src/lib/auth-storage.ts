import type { SupportedStorage } from '@supabase/supabase-js';

export type AuthSessionIdentity = { userId: string; sessionId: string };
type RemovalGuard = { expected: AuthSessionIdentity; signal?: AbortSignal; revoked: boolean };
const guards = new Map<string, RemovalGuard>();
type UpdateGuard = { expected: AuthSessionIdentity; signal?: AbortSignal };
const updates = new Map<string, UpdateGuard>();
type SignInGuard = { starting: AuthSessionIdentity | null; candidate: AuthSessionIdentity | null; signal?: AbortSignal; committed: boolean };
const signIns = new Map<string, Map<'signin' | 'signup', SignInGuard>>();
const memory = new Map<string, string>();
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function authStorageKey(projectUrl: string) { return `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token`; }
function browserStorage(): BrowserStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/** Read claims only to bind an action to its originating session. Supabase verifies tokens. */
export function accessTokenIdentity(token: unknown): AuthSessionIdentity | null {
  if (typeof token !== 'string' || token.length > 65_536) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
    return identifier(claims?.sub) && identifier(claims?.session_id) ? { userId: claims.sub, sessionId: claims.session_id } : null;
  } catch { return null; }
}
export function sessionIdentity(session: unknown): AuthSessionIdentity | null {
  if (!session || typeof session !== 'object' || !('access_token' in session) || !('user' in session)) return null;
  const claims = accessTokenIdentity(session.access_token);
  const user = session.user;
  return claims && user && typeof user === 'object' && 'id' in user && user.id === claims.userId ? claims : null;
}
export function sameAuthSession(left: AuthSessionIdentity | null | undefined, right: AuthSessionIdentity | null | undefined): boolean {
  return Boolean(left && right && left.userId === right.userId && left.sessionId === right.sessionId);
}
function storedIdentity(raw: string | null): AuthSessionIdentity | null {
  try { return sessionIdentity(JSON.parse(raw || 'null')); }
  catch { return null; }
}
function readValue(key: string, provided?: BrowserStorage): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try { return (provided ?? browserStorage())?.getItem(key) ?? null; }
  catch { return null; }
}

/** Retain the SDK's memory fallback when browser storage is unavailable. */
export function createIdentityBoundAuthStorage(projectUrl: string, provided?: BrowserStorage): SupportedStorage {
  const sessionKey = authStorageKey(projectUrl);
  return {
    getItem(key) {
      const raw = readValue(key, provided);
      const guard = key === sessionKey ? guards.get(sessionKey) ?? updates.get(sessionKey) : undefined;
      // Reject replacement credentials before the SDK can supply their Bearer
      // token to the original action's endpoint.
      if (guard && (guard.signal?.aborted || !sameAuthSession(storedIdentity(raw), guard.expected))) {
        throw new Error('The initiating authentication session changed.');
      }
      return raw;
    },
    setItem(key, value) {
      const incoming = storedIdentity(value);
      const update = key === sessionKey ? updates.get(sessionKey) : undefined;
      // A password update can finish parsing after another login was persisted.
      // Guard its final synchronous commit, while allowing a different session
      // to sign in and same-session token refreshes to retain their identity.
      if (update && sameAuthSession(incoming, update.expected) &&
          (update.signal?.aborted || !sameAuthSession(storedIdentity(readValue(key, provided)), update.expected))) {
        throw new Error('The initiating authentication session changed before its update was stored.');
      }
      const commits = key === sessionKey ? [...(signIns.get(sessionKey)?.values() ?? [])].filter(scope => sameAuthSession(incoming, scope.candidate)) : [];
      for (const scope of commits) {
        const existing = storedIdentity(readValue(key, provided));
        const expected = scope.committed ? scope.candidate : scope.starting;
        const unchanged = existing === null && expected === null || sameAuthSession(existing, expected);
        if ((!scope.committed && scope.signal?.aborted) || !unchanged) throw new Error('The sign-in session changed before its response was stored.');
      }
      try {
        const storage = provided ?? browserStorage();
        if (storage) { storage.setItem(key, value); memory.delete(key); commits.forEach(scope => { scope.committed = true; }); return; }
      } catch { /* Preserve a working tab session when persistent storage is unavailable. */ }
      memory.set(key, value);
      commits.forEach(scope => { scope.committed = true; });
    },
    removeItem(key) {
      const guard = key === sessionKey ? guards.get(sessionKey) : undefined;
      const update = key === sessionKey ? updates.get(sessionKey) : undefined;
      const raw = guard || update ? readValue(key, provided) : null;
      // Compare and remove synchronously after confirmed remote revocation.
      // Account identity alone is insufficient: a fresh login has a new session_id.
      if (guard && raw !== null && (!guard.revoked || guard.signal?.aborted || !sameAuthSession(storedIdentity(raw), guard.expected))) {
        throw new Error('The initiating session could not be signed out.');
      }
      if (update && raw !== null && (update.signal?.aborted || !sameAuthSession(storedIdentity(raw), update.expected))) {
        throw new Error('A stale authentication update cannot remove a replacement session.');
      }
      try { (provided ?? browserStorage())?.removeItem(key); }
      catch { throw new Error('The local session could not be removed.'); }
      memory.delete(key);
    },
  };
}

/** Called only by the auth transport after the bound logout endpoint has replied. */
export function markSignOutResponse(projectUrl: string, allowed: boolean) {
  const guard = guards.get(authStorageKey(projectUrl));
  if (guard) guard.revoked = allowed && !guard.signal?.aborted;
}

/** Keep this scope around the raw SDK promise, which can outlive a UI timeout. */
export async function withIdentityBoundSignOut<T>(projectUrl: string, expected: AuthSessionIdentity, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const key = authStorageKey(projectUrl);
  if (guards.has(key)) throw new Error('An earlier sign-out is still finishing.');
  const guard = { expected: { ...expected }, signal, revoked: false };
  guards.set(key, guard);
  try { return await work(); }
  finally { if (guards.get(key) === guard) guards.delete(key); }
}

/** Keep the final SDK storage commit bound after transport/body validation completes. */
export async function withIdentityBoundAuthUpdate<T>(projectUrl: string, expected: AuthSessionIdentity, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const key = authStorageKey(projectUrl);
  if (updates.has(key)) throw new Error('An earlier authentication update is still finishing.');
  const update = { expected: { ...expected }, signal };
  updates.set(key, update);
  try { return await work(); }
  finally { if (updates.get(key) === update) updates.delete(key); }
}

/** Bind an incoming sign-in session to the browser session present when it began. */
export async function withIdentityBoundAuthSignIn<T>(projectUrl: string, action: 'signin' | 'signup', work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const key = authStorageKey(projectUrl);
  const active = signIns.get(key) ?? new Map<'signin' | 'signup', SignInGuard>();
  if (active.has(action)) throw new Error('An earlier sign-in is still finishing.');
  const scope: SignInGuard = { starting: storedIdentity(readValue(key)), candidate: null, signal, committed: false };
  active.set(action, scope);
  signIns.set(key, active);
  try { return await work(); }
  finally {
    if (active.get(action) === scope) active.delete(action);
    if (active.size === 0 && signIns.get(key) === active) signIns.delete(key);
  }
}

/** Candidate identity comes from the validated auth response; no token is retained here. */
export function markAuthSignInResponse(projectUrl: string, action: 'signin' | 'signup', incoming: AuthSessionIdentity) {
  const scope = signIns.get(authStorageKey(projectUrl))?.get(action);
  if (scope) scope.candidate = { ...incoming };
}

/** Read without the SDK action guard so callers can detect a replacement session. */
export function persistedAuthSession(projectUrl: string): AuthSessionIdentity | null {
  return storedIdentity(readValue(authStorageKey(projectUrl)));
}
export function persistedAuthIdentity(projectUrl: string): string | null {
  return persistedAuthSession(projectUrl)?.userId ?? null;
}
