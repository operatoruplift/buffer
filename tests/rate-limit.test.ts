import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { clientKey, consumeSharedLimit } from '../src/server/rate-limit';

const URL_BASE = 'https://project.supabase.example';
const PUBLISHABLE = 'sb_publishable_test';
const SECRET = 'server-only-rate-limit-secret';
const IP = '203.0.113.7';

const request = (headers: Record<string, string> = { 'x-forwarded-for': IP }) => new Request('https://buffer.example/api/live', { headers });
const rpcResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function configure(values: Partial<Record<'url' | 'key' | 'secret', string>> = {}) {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', values.url ?? URL_BASE);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', values.key ?? PUBLISHABLE);
  vi.stubEnv('RATE_LIMIT_SECRET', values.secret ?? SECRET);
}

describe('clientKey', () => {
  it('sends a fixed-length digest per scope and never the address itself', () => {
    const key = clientKey(request(), 'live-read');
    expect(key).toMatch(/^live-read:[0-9a-f]{32}$/);
    expect(key).not.toContain(IP);
    expect(clientKey(request({ 'x-forwarded-for': '2001:db8::1' }), 'live-read')).not.toContain('2001:db8');
  });

  it('keeps scopes apart for the same connection', () => {
    expect(clientKey(request(), 'live-read').split(':')[1]).toBe(clientKey(request(), 'monitoring').split(':')[1]);
    expect(clientKey(request(), 'live-read')).not.toBe(clientKey(request(), 'monitoring'));
  });

  it('uses the first forwarded address, then x-real-ip, then one shared bucket', () => {
    expect(clientKey(request({ 'x-forwarded-for': `${IP}, 10.0.0.1` }), 's')).toBe(clientKey(request(), 's'));
    expect(clientKey(request({ 'x-real-ip': IP }), 's')).toBe(clientKey(request(), 's'));
    expect(clientKey(request({}), 's')).toBe(clientKey(request({ 'x-forwarded-for': 'unknown' }), 's'));
    expect(clientKey(request({ 'x-forwarded-for': '198.51.100.1' }), 's')).not.toBe(clientKey(request(), 's'));
  });
});

describe('consumeSharedLimit', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it.each(['url', 'key', 'secret'] as const)('returns null without calling the database when %s is not configured', async missing => {
    configure({ [missing]: '  ' });
    await expect(consumeSharedLimit(request(), 'live-read', 30)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the protected RPC with the publishable key, the secret and a digest, never the IP', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(rpcResponse([{ allowed: true, remaining: 29, retry_after: 60 }]));
    await expect(consumeSharedLimit(request(), 'live-read', 30)).resolves.toEqual({ allowed: true, retryAfterSeconds: 60 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${URL_BASE}/rest/v1/rpc/consume_rate_limit`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ apikey: PUBLISHABLE, authorization: `Bearer ${PUBLISHABLE}` });
    expect(JSON.parse(String(init?.body))).toEqual({ p_secret: SECRET, p_key: clientKey(request(), 'live-read'), p_limit: 30, p_window_seconds: 60 });
    expect(String(init?.body)).not.toContain(IP);
  });

  it('reports a refusal with a retry delay of at least one second', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(rpcResponse([{ allowed: false, remaining: 0, retry_after: 17 }]));
    await expect(consumeSharedLimit(request(), 'monitoring', 30)).resolves.toEqual({ allowed: false, retryAfterSeconds: 17 });
    fetchMock.mockResolvedValueOnce(rpcResponse([{ allowed: false, remaining: 0, retry_after: 0 }]));
    await expect(consumeSharedLimit(request(), 'monitoring', 30)).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  // A database error, such as a missing hash key, must leave the per-process limit in charge.
  it.each([
    ['an error status', () => rpcResponse({ code: '55000', message: 'Rate-limit hash key is missing' }, 400)],
    ['no rows', () => rpcResponse([])],
    ['a malformed row', () => rpcResponse([{ allowed: 'yes' }])],
    ['invalid JSON', () => new Response('not json', { status: 200 })],
  ])('returns null for %s', async (_label, respond) => {
    configure();
    fetchMock.mockResolvedValueOnce(respond());
    await expect(consumeSharedLimit(request(), 'live-read', 30)).resolves.toBeNull();
  });

  it('returns null when the database is unreachable', async () => {
    configure();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(consumeSharedLimit(request(), 'live-read', 30)).resolves.toBeNull();
  });

  it('gives up after its deadline instead of holding the request', async () => {
    vi.useFakeTimers();
    try {
      configure();
      fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }));
      const pending = consumeSharedLimit(request(), 'live-read', 30);
      await vi.advanceTimersByTimeAsync(1500);
      await expect(pending).resolves.toBeNull();
    } finally { vi.useRealTimers(); }
  });
});
