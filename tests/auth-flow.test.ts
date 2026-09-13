import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_REQUEST_TIMEOUT_MS, AUTH_RESPONSE_BYTES, authErrorMessage, AuthOperationError, clearRecovery, createSupabaseFetch, inspectAuthCallback, recoveryDeadline, rememberRecovery, runAuthOperation } from '../src/lib/auth-flow';
import { authStorageKey, createIdentityBoundAuthStorage, withIdentityBoundAuthUpdate, withIdentityBoundSignOut, type AuthSessionIdentity } from '../src/lib/auth-storage';

const origin = 'https://local-test.supabase.co';
const passwordUrl = `${origin}/auth/v1/token?grant_type=password`;
const alice: AuthSessionIdentity = { userId: 'alice', sessionId: 'recovery-a' };
const bob: AuthSessionIdentity = { userId: 'bob', sessionId: 'session-b' };
const freshAlice: AuthSessionIdentity = { userId: 'alice', sessionId: 'fresh-session-a' };
const sessionStorageAdapter = createIdentityBoundAuthStorage(origin);
function token(identity: AuthSessionIdentity, expires = 1000) {
  return `mock.${Buffer.from(JSON.stringify({ sub: identity.userId, session_id: identity.sessionId, exp: expires })).toString('base64url')}.signature`;
}
function persist(identity: AuthSessionIdentity, expires = 1000) {
  sessionStorageAdapter.setItem(authStorageKey(origin), JSON.stringify({ user: { id: identity.userId }, access_token: token(identity, expires) }));
}
afterEach(() => { vi.useRealTimers(); });

describe('scoped authentication transport', () => {
  it('passes report signals through unchanged and applies no-store to authentication', async () => {
    const calls: RequestInit[] = [];
    const fetcher = createSupabaseFetch(origin, async (_input, init) => { calls.push(init || {}); return Response.json({ ok: true }); });
    const controller = new AbortController();
    await fetcher(`${origin}/rest/v1/saved_reports`, { signal: controller.signal });
    expect(calls[0].signal).toBe(controller.signal);
    expect(calls[0].cache).toBeUndefined();
    expect(await (await fetcher(passwordUrl, { method: 'POST' })).json()).toEqual({ ok: true });
    expect(calls[1].cache).toBe('no-store');
  });

  it('rejects a late cancelled response before an SDK-like session commit', async () => {
    let release!: (response: Response) => void;
    let committed = false;
    const fetcher = createSupabaseFetch(origin, () => new Promise(resolve => { release = resolve; }));
    const controller = new AbortController();
    const request = runAuthOperation('signin', async () => {
      await fetcher(passwordUrl, { method: 'POST' });
      committed = true;
    }, controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ code: 'cancelled' });
    await expect(runAuthOperation('signin', () => Promise.resolve())).rejects.toMatchObject({ code: 'pending' });
    release(Response.json({ access_token: 'late-mock' }));
    await vi.waitFor(() => expect(committed).toBe(false));
    await new Promise(resolve => setTimeout(resolve, 0));
    await expect(runAuthOperation('signin', () => Promise.resolve('new action'))).resolves.toBe('new action');
  });

  it('does not attach a cancelled form signal to a background refresh', async () => {
    const signals: AbortSignal[] = [];
    const releases: ((response: Response) => void)[] = [];
    const fetcher = createSupabaseFetch(origin, (_input, init) => {
      signals.push(init!.signal!);
      return new Promise(resolve => { releases.push(resolve); });
    });
    const controller = new AbortController();
    const request = runAuthOperation('signin', () => Promise.all([
      fetcher(passwordUrl, { method: 'POST' }),
      fetcher(`${origin}/auth/v1/token?grant_type=refresh_token`, { method: 'POST' }),
    ]), controller.signal);
    controller.abort();
    await expect(request).rejects.toBeInstanceOf(AuthOperationError);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    releases.forEach(resolve => resolve(Response.json({ ok: true })));
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('bounds stalled network requests and cancels the actual transport', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null = null;
    const fetcher = createSupabaseFetch(origin, (_input, init) => new Promise((_resolve, reject) => {
      signal = init!.signal!;
      signal.addEventListener('abort', () => reject(signal!.reason), { once: true });
    }));
    const request = fetcher(passwordUrl, { method: 'POST' });
    const assertion = expect(request).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS + 1);
    await assertion;
    expect(signal!.aborted).toBe(true);
  });

  it('keeps the deadline active while a response body stalls', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const fetcher = createSupabaseFetch(origin, async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })));
    const request = fetcher(`${origin}/auth/v1/user`);
    const assertion = expect(request).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS + 1);
    await assertion;
    expect(cancelled).toBe(true);
  });

  it('rejects oversized authentication bodies', async () => {
    const fetcher = createSupabaseFetch(origin, async () => new Response(new Uint8Array(AUTH_RESPONSE_BYTES + 1)));
    await expect(fetcher(`${origin}/auth/v1/user`)).rejects.toThrow('size limit');
  });

  it('settles the UI deadline while retaining cancellation until the underlying call finishes', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const request = runAuthOperation('signup', () => new Promise<void>(resolve => { release = resolve; }), undefined, 100);
    const assertion = expect(request).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
    await expect(runAuthOperation('signup', () => Promise.resolve())).rejects.toMatchObject({ code: 'pending' });
    release();
    await Promise.resolve();
    await expect(runAuthOperation('signup', () => Promise.resolve())).resolves.toBeUndefined();
  });
});

describe('password and sign-out writes belong to the initiating authentication session', () => {
  it.each([
    { name: 'versioned session_not_found', status: 400, version: '2024-01-01', body: JSON.stringify({ code: 'session_not_found' }), allowed: true },
    { name: 'legacy session_not_found', status: 400, version: '', body: JSON.stringify({ error_code: 'session_not_found' }), allowed: true },
    { name: 'unrelated structured error', status: 400, version: '2024-01-01', body: JSON.stringify({ code: 'bad_jwt' }), allowed: false },
    { name: 'untrusted message text', status: 400, version: '2024-01-01', body: JSON.stringify({ message: 'session_not_found' }), allowed: false },
    { name: 'unversioned modern field', status: 400, version: '', body: JSON.stringify({ code: 'session_not_found' }), allowed: false },
    { name: 'modern code taking precedence over legacy field', status: 400, version: '2024-01-01', body: JSON.stringify({ code: 'bad_jwt', error_code: 'session_not_found' }), allowed: false },
    { name: 'server error', status: 500, version: '2024-01-01', body: JSON.stringify({ code: 'session_not_found' }), allowed: false },
    { name: 'invalid JSON', status: 400, version: '2024-01-01', body: 'session_not_found', allowed: false },
  ])('only permits already-revoked logout removal for $name', async ({ status, version, body, allowed }) => {
    persist(alice);
    const fetcher = createSupabaseFetch(origin, async () => new Response(body, { status, headers: { 'X-Supabase-Api-Version': version } }));
    const request = runAuthOperation('signout', signal => withIdentityBoundSignOut(origin, alice, async () => {
      const response = await fetcher(`${origin}/auth/v1/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token(alice)}` } });
      expect(await response.text()).toBe(body);
      await sessionStorageAdapter.removeItem(authStorageKey(origin));
    }, signal), undefined, undefined, alice);
    if (allowed) { await expect(request).resolves.toBeUndefined(); expect(await sessionStorageAdapter.getItem(authStorageKey(origin))).toBeNull(); }
    else { await expect(request).rejects.toThrow('could not be signed out'); expect(await sessionStorageAdapter.getItem(authStorageKey(origin))).not.toBeNull(); }
  });

  it.each(['reset', 'signout'] as const)('blocks %s when another account is persisted without an auth event', async action => {
    persist(bob);
    const rawFetch = vi.fn(async () => Response.json({ id: alice.userId }));
    const fetcher = createSupabaseFetch(origin, rawFetch);
    await expect(runAuthOperation(action, () => fetcher(`${origin}/auth/v1/${action === 'reset' ? 'user' : 'logout'}`, {
      method: action === 'reset' ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${token(bob)}` },
    }), undefined, undefined, alice)).rejects.toMatchObject({ code: 'session' });
    expect(rawFetch).not.toHaveBeenCalled();
  });

  it('blocks a mismatched outgoing Bearer even if persisted storage still contains the initiating account', async () => {
    persist(alice);
    const rawFetch = vi.fn(async () => Response.json({ id: alice.userId }));
    const fetcher = createSupabaseFetch(origin, rawFetch);
    await expect(runAuthOperation('reset', () => fetcher(`${origin}/auth/v1/user`, { method: 'PUT', headers: { Authorization: `Bearer ${token(bob)}` } }), undefined, undefined, alice)).rejects.toMatchObject({ code: 'session' });
    expect(rawFetch).not.toHaveBeenCalled();
  });

  it('rejects a new login session for the same user', async () => {
    persist(freshAlice);
    const rawFetch = vi.fn(async () => Response.json({ id: alice.userId }));
    const fetcher = createSupabaseFetch(origin, rawFetch);
    await expect(runAuthOperation('reset', () => fetcher(`${origin}/auth/v1/user`, { method: 'PUT', headers: { Authorization: `Bearer ${token(freshAlice)}` } }), undefined, undefined, alice)).rejects.toMatchObject({ code: 'session' });
    expect(rawFetch).not.toHaveBeenCalled();
  });

  it('allows token rotation within the original session', async () => {
    persist(alice, 2000);
    const rawFetch = vi.fn(async () => Response.json({ id: alice.userId }));
    const fetcher = createSupabaseFetch(origin, rawFetch);
    const response = await runAuthOperation('reset', () => fetcher(new Request(`${origin}/auth/v1/user`, { method: 'PUT', headers: { Authorization: `Bearer ${token(alice, 2000)}` } })), undefined, undefined, alice);
    expect(await response.json()).toEqual({ id: alice.userId });
    expect(rawFetch).toHaveBeenCalledOnce();
  });

  it('rejects a response when a replacement session appears during the request', async () => {
    persist(alice);
    let release!: (value: Response) => void;
    let committed = false;
    const fetcher = createSupabaseFetch(origin, () => new Promise(resolve => { release = resolve; }));
    const request = runAuthOperation('reset', async () => {
      await fetcher(`${origin}/auth/v1/user`, { method: 'PUT', headers: { Authorization: `Bearer ${token(alice)}` } });
      committed = true;
    }, undefined, undefined, alice);
    persist(bob);
    release(Response.json({ id: alice.userId }));
    await expect(request).rejects.toMatchObject({ code: 'session' });
    expect(committed).toBe(false);
  });

  it('rejects a successful password response with a different user identity', async () => {
    persist(alice);
    const fetcher = createSupabaseFetch(origin, async () => Response.json({ id: bob.userId }));
    await expect(runAuthOperation('reset', () => fetcher(`${origin}/auth/v1/user`, { method: 'PUT', headers: { Authorization: `Bearer ${token(alice)}` } }), undefined, undefined, alice)).rejects.toMatchObject({ code: 'session' });
  });

  it('rejects password writes lacking an explicit originating session', async () => {
    persist(alice);
    const rawFetch = vi.fn(async () => Response.json({ id: alice.userId }));
    await expect(createSupabaseFetch(origin, rawFetch)(`${origin}/auth/v1/user`, { method: 'PUT', headers: { Authorization: `Bearer ${token(alice)}` } })).rejects.toMatchObject({ code: 'session' });
    expect(rawFetch).not.toHaveBeenCalled();
  });

  it('keeps the effective operation timeout active through the raw SDK storage commit', async () => {
    vi.useFakeTimers();
    persist(alice);
    let release!: () => void;
    let committed = false;
    const externalController = new AbortController();
    const request = runAuthOperation('reset', signal => withIdentityBoundAuthUpdate(origin, alice, async () => {
      await new Promise<void>(resolve => { release = resolve; });
      persist(alice, 2000);
      committed = true;
    }, signal), externalController.signal, 100, alice);
    const assertion = expect(request).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
    expect(externalController.signal.aborted).toBe(false);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(committed).toBe(false);
    expect(JSON.parse(await sessionStorageAdapter.getItem(authStorageKey(origin)) || 'null').access_token).toBe(token(alice));
  });
});

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe('safe callbacks and recovery continuity', () => {
  it('removes credentials and untrusted error copy while retaining a local destination', () => {
    expect(inspectAuthCallback('https://buffer.example/auth?mode=signup&error_description=%3Cscript%3E#access_token=secret&refresh_token=private&type=recovery')).toEqual({ present: true, error: true, recovery: true, cleanUrl: '/auth?mode=signup' });
    expect(inspectAuthCallback('https://buffer.example/auth#features')).toEqual({ present: false, error: false, recovery: false, cleanUrl: '/auth#features' });
  });

  it('restores only the same authentication session’s bounded recovery window without storing tokens', () => {
    const storage = new MemoryStorage();
    const now = 10_000;
    rememberRecovery(alice, (now + 3_600_000) / 1000, storage, now);
    expect(recoveryDeadline(alice, storage, now)).toBe(now + 900_000);
    expect(recoveryDeadline(alice, storage, now + 200_000)).toBe(now + 900_000);
    expect(storage.getItem(storage.key(0)!)).not.toContain('token');
    expect(recoveryDeadline(bob, storage, now)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('does not reuse a recovery marker for the same user’s new login session or a legacy user-only marker', () => {
    const storage = new MemoryStorage();
    rememberRecovery(alice, 3600, storage, 1000);
    expect(recoveryDeadline(freshAlice, storage, 1000)).toBeNull();
    expect(storage.length).toBe(0);
    storage.setItem('buffer.auth-recovery.v1', JSON.stringify({ userId: alice.userId, expiresAt: 10_000 }));
    expect(recoveryDeadline(alice, storage, 1000)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('rejects expired, malformed and unavailable recovery storage', () => {
    const storage = new MemoryStorage();
    rememberRecovery(alice, 100, storage, 1_000);
    expect(recoveryDeadline(alice, storage, 100_001)).toBeNull();
    rememberRecovery(alice, 0, storage, 1_000);
    expect(storage.length).toBe(0);
    storage.setItem('buffer.auth-recovery.v1', 'broken');
    expect(recoveryDeadline(alice, storage)).toBeNull();
    clearRecovery(storage);
    expect(storage.length).toBe(0);
    const denied = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } } as unknown as Storage;
    expect(() => rememberRecovery(alice, 100, denied, 1_000)).not.toThrow();
    expect(recoveryDeadline(alice, denied, 1_000)).toBeNull();
    expect(() => clearRecovery(denied)).not.toThrow();
  });

  it('shows controlled failures instead of server or URL payload text', () => {
    expect(authErrorMessage({ status: 429, message: '<script>server text</script>' }, 'signin')).toContain('Too many attempts');
    expect(authErrorMessage({ status: 401, message: 'private detail' }, 'reset')).toContain('expired');
    expect(authErrorMessage(new AuthOperationError('timeout'), 'signin')).toContain('timed out');
    expect(authErrorMessage(new Error('secret credentials'), 'signin')).not.toContain('secret');
  });
});
