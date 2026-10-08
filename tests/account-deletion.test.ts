import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNT_DELETION_RPC_PATH, AccountDeletionError, accountDeletionMessage, accountDeviceKeys,
  clearAccountDeviceData, deleteOwnAccount, runAccountDeletion,
} from '../src/lib/account-deletion';
import { alertRehearsalKey, alertStorageKey } from '../src/lib/alerts';
import type { AuthSessionIdentity } from '../src/lib/auth-storage';

const origin = 'https://local-test.supabase.co';
const alice: AuthSessionIdentity = { userId: '00000000-0000-4000-8000-00000000000a', sessionId: 'session-a' };
const bob: AuthSessionIdentity = { userId: '00000000-0000-4000-8000-00000000000b', sessionId: 'session-b' };

function token(identity: AuthSessionIdentity) {
  return `mock.${Buffer.from(JSON.stringify({ sub: identity.userId, session_id: identity.sessionId, exp: 4_000_000_000 })).toString('base64url')}.signature`;
}
function client(identity: AuthSessionIdentity | null) {
  const getSession = vi.fn().mockResolvedValue({ data: { session: identity ? { access_token: token(identity), user: { id: identity.userId } } : null }, error: null });
  return { client: { auth: { getSession } } as unknown as SupabaseClient, getSession };
}
function deps(overrides: Partial<Parameters<typeof deleteOwnAccount>[2]> = {}) {
  const { client: db, getSession } = client(alice);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(alice.userId));
  return { getSession, fetcher, options: { projectUrl: origin, publishableKey: 'sb_publishable_test', client: db, fetcher, persisted: () => alice, ...overrides } };
}
afterEach(() => { vi.useRealTimers(); });

describe('deleting the signed-in account', () => {
  it('calls the owner-scoped RPC with the confirmed session and sends no account identifier', async () => {
    const { fetcher, options } = deps();
    await expect(deleteOwnAccount(alice, new AbortController().signal, options)).resolves.toBe('deleted');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe(`${origin}${ACCOUNT_DELETION_RPC_PATH}`);
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error', body: '{}' });
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token(alice)}`);
    expect(new Headers(init?.headers).get('apikey')).toBe('sb_publishable_test');
    expect(String(init?.body)).not.toContain(alice.userId);
  });

  it('treats a null result as an account that was already deleted', async () => {
    const { options } = deps({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(null)) });
    await expect(deleteOwnAccount(alice, new AbortController().signal, options)).resolves.toBe('already-deleted');
  });

  it('refuses before reading credentials when another session replaced the confirmed one', async () => {
    const { fetcher, getSession, options } = deps({ persisted: () => bob });
    await expect(deleteOwnAccount(alice, new AbortController().signal, options)).rejects.toMatchObject({ code: 'session' });
    expect(getSession).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['a different account', bob],
    ['a fresh session of the same account', { ...alice, sessionId: 'replacement' }],
    ['no session', null],
  ])('never sends the request with %s', async (_name, identity) => {
    const { client: db } = client(identity);
    const { fetcher, options } = deps({ client: db });
    await expect(deleteOwnAccount(alice, new AbortController().signal, options)).rejects.toMatchObject({ code: 'session' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does nothing once the person cancelled', async () => {
    const { fetcher, options } = deps();
    const controller = new AbortController(); controller.abort();
    await expect(deleteOwnAccount(alice, controller.signal, options)).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([401, 403])('maps HTTP %i to a rejected session, which deletes nothing', async status => {
    const { options } = deps({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: '42501' }, { status })) });
    await expect(deleteOwnAccount(alice, new AbortController().signal, options)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it.each([
    ['a server error', () => Response.json({ message: 'unavailable' }, { status: 503 })],
    ['another account id', () => Response.json(bob.userId)],
    ['a malformed body', () => new Response('not json', { status: 200 })],
    ['an oversized body', () => new Response(JSON.stringify('x'.repeat(5000)), { status: 200 })],
    ['a transport failure', () => { throw new TypeError('Failed to fetch'); }],
  ])('reports %s as unconfirmed so a retry can finish safely', async (_name, reply) => {
    const { options } = deps({ fetcher: vi.fn<typeof fetch>().mockImplementation(async () => reply()) });
    await expect(deleteOwnAccount(alice, new AbortController().signal, options)).rejects.toMatchObject({ code: 'unconfirmed' });
  });

  it('ends a hung request at its deadline as unconfirmed', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const { options } = deps({ fetcher, timeoutMs: 1000 });
    const pending = expect(deleteOwnAccount(alice, new AbortController().signal, options)).rejects.toMatchObject({ code: 'unconfirmed' });
    await vi.advanceTimersByTimeAsync(1001);
    await pending;
  });

  it('gives every failure a plain message that says whether anything was deleted', () => {
    expect(accountDeletionMessage(new AccountDeletionError('session'))).toMatch(/Nothing was deleted/);
    expect(accountDeletionMessage(new AccountDeletionError('cancelled'))).toMatch(/Nothing was deleted/);
    expect(accountDeletionMessage(new AccountDeletionError('unauthorized'))).toMatch(/Nothing was deleted/);
    expect(accountDeletionMessage(new AccountDeletionError('unconfirmed'))).toMatch(/could not be confirmed/);
    expect(accountDeletionMessage(new Error('anything else'))).toMatch(/could not be confirmed/);
  });
});

describe('finishing a deletion on this device', () => {
  it('signs out and clears device data only after the account is gone', async () => {
    const order: string[] = [];
    const result = await runAccountDeletion({
      remove: async () => { order.push('remove'); return 'deleted'; },
      afterDelete: () => { order.push('clear'); },
      signOut: async () => { order.push('signout'); return { error: null }; },
    });
    expect(order).toEqual(['remove', 'clear', 'signout']);
    expect(result).toEqual({ outcome: 'deleted', signedOut: true });
  });

  it('keeps the session and device data when the deletion fails', async () => {
    const afterDelete = vi.fn(); const signOut = vi.fn();
    await expect(runAccountDeletion({ remove: async () => { throw new AccountDeletionError('unconfirmed'); }, afterDelete, signOut }))
      .rejects.toMatchObject({ code: 'unconfirmed' });
    expect(afterDelete).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('still reports a completed deletion when signing out of this device fails', async () => {
    for (const signOut of [async () => ({ error: new Error('offline') }), async () => { throw new Error('offline'); }]) {
      await expect(runAccountDeletion({ remove: async () => 'already-deleted', afterDelete: () => {}, signOut }))
        .resolves.toEqual({ outcome: 'already-deleted', signedOut: false });
    }
  });

  it('clears only the deleted account’s keys and tolerates unavailable storage', () => {
    const values = new Map<string, string>([
      [alertRehearsalKey(alice.userId), '{}'], [alertStorageKey(alice.userId), '{}'],
      [alertRehearsalKey(bob.userId), '{}'], ['buffer.device-reports.v1', '{}'],
    ]);
    const storage = { removeItem: (key: string) => { values.delete(key); } };
    expect(accountDeviceKeys(alice.userId)).toEqual([alertRehearsalKey(alice.userId), alertStorageKey(alice.userId)]);
    clearAccountDeviceData(alice.userId, storage);
    expect([...values.keys()]).toEqual([alertRehearsalKey(bob.userId), 'buffer.device-reports.v1']);
    expect(() => clearAccountDeviceData(alice.userId, { removeItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
});
