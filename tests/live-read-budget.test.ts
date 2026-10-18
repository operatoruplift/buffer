import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { serveRead, type LiveProvider } from '../src/server/boundary';
import { createLiveReadBudget, LIVE_READ_LIMITS, liveReadBudget, liveReadCacheKey, type LiveReadIdentity } from '../src/server/live-read-budget';
import type { SharedLimit } from '../src/server/rate-limit';

const authority = '11111111111111111111111111111111';
const identity = (patch: Partial<LiveReadIdentity> = {}): LiveReadIdentity => ({ kind: 'discovery', protocol: 'velocity', network: 'mainnet-beta', authority, subaccount: null, ...patch });
const from = (ip: string) => new Request('https://buffer.test/api/accounts', { headers: { 'x-forwarded-for': ip } });
/** A distinct authority per index, so each read is a new request in the cache's eyes. */
const distinct = (index: number) => identity({ authority: String(index).padStart(32, '0') });

function fixture(options: { shared?: SharedLimit | null } = {}) {
  let clock = Date.parse('2026-10-19T09:00:00.000Z');
  const sharedLimit = vi.fn(async () => options.shared ?? null);
  const budget = createLiveReadBudget({ now: () => clock, sharedLimit });
  const read = vi.fn(async () => ({ authority, subaccounts: [] }));
  return { budget, read, sharedLimit, advance: (ms: number) => { clock += ms; } };
}

describe('live read cache', () => {
  it('keys reads by every field of the normalised request and never by the raw address', () => {
    const key = liveReadCacheKey(identity());
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain(authority);
    expect(liveReadCacheKey(identity())).toBe(key);
    for (const changed of [{ kind: 'snapshot' as const, subaccount: 0 }, { protocol: 'pacifica' }, { network: 'devnet' }, { authority: '2'.repeat(32) }, { kind: 'snapshot' as const, subaccount: 1 }]) {
      expect(liveReadCacheKey(identity(changed))).not.toBe(key);
    }
  });
  it('serves an identical read from the cache for five seconds, then reads again', async () => {
    const { budget, read, advance } = fixture();
    await budget.read(from('203.0.113.7'), identity(), read);
    advance(4_999);
    await expect(budget.read(from('198.51.100.9'), identity(), read)).resolves.toEqual({ authority, subaccounts: [] });
    expect(read).toHaveBeenCalledTimes(1);
    advance(1);
    await budget.read(from('203.0.113.7'), identity(), read);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('shares one in-flight provider call between concurrent identical reads', async () => {
    const { budget } = fixture();
    let release!: (value: { authority: string; subaccounts: never[] }) => void;
    const read = vi.fn(() => new Promise<{ authority: string; subaccounts: never[] }>(resolve => { release = resolve; }));
    const first = budget.read(from('203.0.113.7'), identity(), read);
    const second = budget.read(from('203.0.113.7'), identity(), read);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    release({ authority, subaccounts: [] });
    expect(await Promise.all([first, second])).toEqual([{ authority, subaccounts: [] }, { authority, subaccounts: [] }]);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('does not cache a failed read', async () => {
    const { budget } = fixture();
    const read = vi.fn<() => Promise<unknown>>().mockRejectedValueOnce(new Error('rpc down')).mockResolvedValueOnce({ authority, subaccounts: [] });
    await expect(budget.read(from('203.0.113.7'), identity(), read)).rejects.toThrow('rpc down');
    await expect(budget.read(from('203.0.113.7'), identity(), read)).resolves.toEqual({ authority, subaccounts: [] });
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe('live read limits', () => {
  it('limits each client to thirty new reads a minute, without counting cached reads, and leaves other clients alone', async () => {
    const { budget, read, advance } = fixture();
    for (let index = 0; index < LIVE_READ_LIMITS.clientPerMinute; index++) await budget.read(from('203.0.113.7'), distinct(index), read);
    await expect(budget.read(from('203.0.113.7'), distinct(99), read)).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429, message: 'Too many live reads from this connection. Wait a moment and retry.' });
    await expect(budget.read(from('203.0.113.7'), distinct(0), read)).resolves.toBeDefined();
    await expect(budget.read(from('198.51.100.9'), distinct(99), read)).resolves.toBeDefined();
    expect(read).toHaveBeenCalledTimes(LIVE_READ_LIMITS.clientPerMinute + 1);
    advance(LIVE_READ_LIMITS.windowMs);
    await expect(budget.read(from('203.0.113.7'), distinct(98), read)).resolves.toBeDefined();
  });
  it('lets the shared store decide the per-client limit when it answers', async () => {
    const refused = fixture({ shared: { allowed: false, retryAfterSeconds: 17 } });
    await expect(refused.budget.read(from('203.0.113.7'), identity(), refused.read)).rejects.toMatchObject({ code: 'RATE_LIMITED', message: 'Too many live reads from this connection. Wait a moment and retry.' });
    expect(refused.read).not.toHaveBeenCalled();
    expect(refused.sharedLimit).toHaveBeenCalledWith(expect.any(Request), 'live-read', LIVE_READ_LIMITS.clientPerMinute);
    const allowed = fixture({ shared: { allowed: true, retryAfterSeconds: 60 } });
    for (let index = 0; index < LIVE_READ_LIMITS.clientPerMinute + 5; index++) await allowed.budget.read(from('203.0.113.7'), distinct(index), allowed.read);
    expect(allowed.read).toHaveBeenCalledTimes(LIVE_READ_LIMITS.clientPerMinute + 5);
  });
  it('caps one instance at 240 reads a minute, which no two clients can reach on their own', async () => {
    const { budget, read, advance } = fixture();
    const clients = LIVE_READ_LIMITS.instancePerMinute / LIVE_READ_LIMITS.clientPerMinute;
    expect(clients).toBe(8);
    for (let client = 0; client < clients; client++) {
      for (let index = 0; index < LIVE_READ_LIMITS.clientPerMinute; index++) await budget.read(from(`203.0.113.${client + 1}`), distinct(client * 100 + index), read);
    }
    await expect(budget.read(from('203.0.113.99'), distinct(9_999), read)).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429, message: 'Live reads are busy. Wait a moment and retry.' });
    advance(LIVE_READ_LIMITS.windowMs);
    await expect(budget.read(from('203.0.113.99'), distinct(9_999), read)).resolves.toBeDefined();
  });
  it('allows eight reads in flight per instance and admits the next once one finishes', async () => {
    const { budget } = fixture();
    const pending: Array<(value: unknown) => void> = [];
    const read = vi.fn(() => new Promise<unknown>(resolve => { pending.push(resolve); }));
    const reads = Array.from({ length: LIVE_READ_LIMITS.instanceConcurrent }, (_, index) => budget.read(from(`203.0.113.${index + 1}`), distinct(index), read));
    await expect(budget.read(from('203.0.113.99'), distinct(99), read)).rejects.toMatchObject({ message: 'Live reads are busy. Wait a moment and retry.' });
    expect(read).toHaveBeenCalledTimes(LIVE_READ_LIMITS.instanceConcurrent);
    pending[0]({ authority, subaccounts: [] });
    await reads[0];
    const next = budget.read(from('203.0.113.99'), distinct(98), read);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(LIVE_READ_LIMITS.instanceConcurrent + 1));
    for (const resolve of pending) resolve({ authority, subaccounts: [] });
    await Promise.all([...reads, next]);
  });
});

describe('serveRead with the shared budget', () => {
  beforeEach(() => liveReadBudget.reset());
  it('answers a repeated identical request from the cache and consumes the provider once', async () => {
    const provider: LiveProvider = { discover: vi.fn(async () => ({ authority, subaccounts: [], retrievedAt: '2026-10-19T09:00:00.000Z' })), snapshot: vi.fn() };
    const url = `https://buffer.test/api/accounts?authority=${authority}`;
    const first = await serveRead(new Request(url, { headers: { 'x-forwarded-for': '203.0.113.7' } }), 'discovery', provider);
    const second = await serveRead(new Request(url, { headers: { 'x-forwarded-for': '198.51.100.9' } }), 'discovery', provider);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get('Cache-Control')).toBe('no-store');
    expect(provider.discover).toHaveBeenCalledTimes(1);
  });
});
