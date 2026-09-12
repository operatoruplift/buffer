import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('server-only', () => ({}));
import { pacificaProvider } from '../src/server/pacifica';
import { normalizePacificaSnapshot, observePacificaPrice, PACIFICA_MAX_AGE_MS, type PacificaReadData } from '../src/server/pacifica-normalize';
import { CONFIGURED_PERP_MARKETS } from '../src/lib/perp-markets';
import { PROTOCOLS } from '../src/lib/protocols';
import { calculateScenario } from '../src/lib/scenario';

const authority = 'Ep1d8JdFw4FnB85XDgXGVabYutro4JzK285HQqW6TZE2';
const now = Date.parse('2026-09-12T10:02:25.000Z');
const fixtures = new URL('./fixtures/pacifica-public/', import.meta.url);
type JsonRow = Record<string, unknown>;
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`${name}.json`, fixtures), 'utf8'));
const registry = CONFIGURED_PERP_MARKETS.pacifica;

function input(): PacificaReadData {
  return { authority, account: fixture('account').payload.data, positions: fixture('positions').payload.data,
    info: fixture('info').payload.data, prices: fixture('prices').payload.data, loan: fixture('loan').payload.data,
    startedAt: '2026-09-12T10:02:23.569Z', retrievedAt: new Date(now).toISOString() };
}

function single(asset = 'kBONK', side = 'bid'): PacificaReadData {
  const data = input();
  const account = data.account as JsonRow;
  account.positions_count = 1;
  account.updated_at = now;
  (data.loan as JsonRow).updated_at = now;
  data.positions = [{ symbol: asset, amount: '1234.56789', side, isolated: false, margin: '0', updated_at: 1 }];
  data.prices = [{ symbol: asset, oracle: '0.03125', timestamp: now }];
  return data;
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Pacifica public data normalization', () => {
  it('pins all 76 perpetual identities and excludes the spot instrument', () => {
    const markets = fixture('info').payload.data as JsonRow[];
    const perps = markets.filter((market) => market.instrument_type === 'perpetual');
    expect(perps).toHaveLength(76);
    expect(registry).toHaveLength(perps.length);
    for (const config of registry) expect(perps).toContainEqual(expect.objectContaining({ symbol: config.asset, base_asset: config.asset, instrument_type: 'perpetual' }));
    expect(registry.some((market) => market.asset === 'SOL-USDC')).toBe(false);
  });

  it.each(registry.map((market) => [market.asset, market.marketIndex]))('models verified %s with stable local index %s independent of API ordering', (asset, index) => {
    const data = single(String(asset));
    data.info = [...data.info as unknown[]].reverse();
    const result = normalizePacificaSnapshot(data);
    expect(result.positions[0]).toMatchObject({ marketIndex: index, market: `${asset}-PERP`, asset, size: '1234.56789', price: '0.03125', quote: 'USD', modeled: true, oracle: { slot: null, readSlot: null, valid: true, observedAt: new Date(now).toISOString() } });
    expect(calculateScenario(result, -10, now).totals).toEqual([{ quote: 'USD', delta: '-3.85802465625' }]);
  });

  it('normalizes captured public positions and account-wide order inventory without claiming on-chain slots or health', () => {
    const snapshot = normalizePacificaSnapshot(input());
    expect(snapshot.positions).toHaveLength(22);
    expect(snapshot.positions.every((position) => position.modeled)).toBe(true);
    expect(snapshot.protocol).toEqual(PROTOCOLS.pacifica);
    expect(snapshot.accountSlot).toBeNull();
    expect(snapshot.observedSlot).toBeNull();
    expect(snapshot.metrics.map((metric) => metric.label)).toEqual(['Account equity', 'Account balance', 'Margin in use']);
    expect(snapshot.orders).toEqual([{ market: 'All markets · open orders', count: 692 }]);
    expect(snapshot.positions.find((position) => position.asset === 'PLATINUM')?.size).toBe('-2.3583');
    expect(calculateScenario(snapshot, -10, now).eligible).toBe(22);
  });

  it.each(['kBONK', 'kPEPE', 'kSHIB'])('preserves %s long/short scale without token unit conversions', (asset) => {
    const long = calculateScenario(normalizePacificaSnapshot(single(asset)), -10, now);
    const short = calculateScenario(normalizePacificaSnapshot(single(asset, 'ask')), -10, now);
    expect(long.totals).toEqual([{ quote: 'USD', delta: '-3.85802465625' }]);
    expect(short.totals).toEqual([{ quote: 'USD', delta: '3.85802465625' }]);
  });

  it.each(['unknown', 'base', 'nonperp', 'missing-info', 'missing-price', 'stale', 'future', 'nonpositive', 'numeric-price'])('excludes %s market data without inventing a baseline', (kind) => {
    const data = single('SOL');
    const price = (data.prices as JsonRow[])[0];
    const market = (data.info as JsonRow[]).find((row) => row.symbol === 'SOL')!;
    if (kind === 'unknown') (data.positions as JsonRow[])[0].symbol = 'UNLISTED';
    if (kind === 'base') market.base_asset = 'FAKE';
    if (kind === 'nonperp') market.instrument_type = 'spot';
    if (kind === 'missing-info') data.info = [];
    if (kind === 'missing-price') data.prices = [];
    if (kind === 'stale') price.timestamp = now - PACIFICA_MAX_AGE_MS;
    if (kind === 'future') price.timestamp = now + 10_001;
    if (kind === 'nonpositive') price.oracle = '0';
    if (kind === 'numeric-price') price.oracle = 0.03125;
    const snapshot = normalizePacificaSnapshot(data);
    expect(snapshot.positions[0].modeled).toBe(false);
    expect(snapshot.positions[0].exclusionReason).toBeTruthy();
    expect(calculateScenario(snapshot, -10, now).eligible).toBe(0);
    if (['missing-price', 'stale', 'future', 'nonpositive', 'numeric-price'].includes(kind)) expect(snapshot.positions[0].price).toBeNull();
  });

  it.each(['negative-size', 'zero-size', 'number-size', 'exponent-size', 'long-size', 'bad-side', 'unknown-margin', 'count-mismatch', 'duplicate-position', 'duplicate-market', 'stale-account', 'future-account', 'stale-loan', 'bad-order-count', 'unknown-spot-balance'])('fails closed for %s instead of silently omitting inventory', (kind) => {
    const data = single('SOL');
    const row = (data.positions as JsonRow[])[0];
    const account = data.account as JsonRow;
    if (kind === 'negative-size') row.amount = '-1';
    if (kind === 'zero-size') row.amount = '0';
    if (kind === 'number-size') row.amount = 1;
    if (kind === 'exponent-size') row.amount = '1e3';
    if (kind === 'long-size') row.amount = '1'.repeat(101);
    if (kind === 'bad-side') row.side = 'short';
    if (kind === 'unknown-margin') row.isolated = 'false';
    if (kind === 'count-mismatch') account.positions_count = 2;
    if (kind === 'duplicate-position') { (data.positions as JsonRow[]).push({ ...row }); account.positions_count = 2; }
    if (kind === 'duplicate-market') (data.info as unknown[]).push((data.info as unknown[])[0]);
    if (kind === 'stale-account') account.updated_at = now - PACIFICA_MAX_AGE_MS;
    if (kind === 'future-account') account.updated_at = now + 10_001;
    if (kind === 'stale-loan') (data.loan as JsonRow).updated_at = now - PACIFICA_MAX_AGE_MS;
    if (kind === 'bad-order-count') account.orders_count = -1;
    if (kind === 'unknown-spot-balance') account.spot_balances = [{ symbol: 'SOL', amount: null }];
    expect(() => normalizePacificaSnapshot(data)).toThrow();
  });

  it('does not extend a nearly stale price when a snapshot is retrieved again', () => {
    const data = single();
    (data.prices as JsonRow[])[0].timestamp = now - 119_000;
    const snapshot = normalizePacificaSnapshot(data);
    expect(snapshot.expiresAt).toBe(new Date(now + 1_000).toISOString());
    expect(calculateScenario(snapshot, -10, now + 1_000).disabledReason).toContain('expired');
    expect(observePacificaPrice({ oracle: '10', timestamp: now + 10_000 }, now).valid).toBe(true);
  });

  it('lists known isolated, spot, loan, and stop-order state outside the price scenario', () => {
    const data = single('SOL');
    Object.assign((data.positions as JsonRow[])[0], { isolated: true, margin: '55' });
    Object.assign(data.account as JsonRow, { spot_balances: [{ symbol: 'SOL', amount: '2.5' }], stop_orders_count: 3 });
    Object.assign(data.loan as JsonRow, { borrowed: '100', pending_interest: '0.5' });
    const snapshot = normalizePacificaSnapshot(data);
    expect(snapshot.spots).toEqual(expect.arrayContaining([
      expect.objectContaining({ market: 'SOL', amount: '2.5', kind: 'Collateral' }),
      expect.objectContaining({ market: 'USD isolated margin · SOL-PERP', amount: '55' }),
      expect.objectContaining({ market: 'USD loan principal', amount: '100', kind: 'Debt' }),
      expect.objectContaining({ market: 'USD accrued loan interest', amount: '0.5', kind: 'Debt' }),
    ]));
    expect(snapshot.orders).toContainEqual({ market: 'All markets · stop orders', count: 3 });
    expect(calculateScenario(snapshot, -10, now).totals).toEqual([{ quote: 'USD', delta: '-3.85802465625' }]);
  });
});

function mockApi(override?: (url: URL) => Response | undefined) {
  const request = vi.fn(async (url: URL) => {
    const custom = override?.(url);
    if (custom) return custom;
    const names: Record<string, string> = { '/api/v1/account': 'account', '/api/v1/account/loan': 'loan', '/api/v1/positions': 'positions', '/api/v1/info': 'info', '/api/v1/info/prices': 'prices' };
    return Response.json(fixture(names[url.pathname]).payload);
  });
  vi.stubGlobal('fetch', request);
  vi.useFakeTimers();
  vi.setSystemTime(now);
  return request;
}

describe('Pacifica public HTTP provider', () => {
  it('discovers and reads only fixed-origin public GETs without requiring an RPC or credentials', async () => {
    const request = mockApi();
    const discovery = await pacificaProvider.discover(authority);
    expect(discovery.subaccounts).toEqual([{ id: 0, name: 'Wallet account', address: authority }]);
    const snapshot = await pacificaProvider.snapshot(authority, 0);
    expect(snapshot.positions).toHaveLength(22);
    expect(request).toHaveBeenCalledTimes(6);
    for (const [url, init] of request.mock.calls as unknown as [URL, RequestInit][]) {
      expect(url.origin).toBe('https://api.pacifica.fi');
      expect(init).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } });
      expect(init.body).toBeUndefined();
      expect([...url.searchParams.keys()]).toEqual(url.pathname.includes('/account') || url.pathname.endsWith('/positions') ? ['account'] : []);
    }
  });

  it('distinguishes a documented missing account from an upstream failure', async () => {
    mockApi(() => Response.json({ success: false, data: null, error: 'Account not found', code: 404 }, { status: 404 }));
    expect((await pacificaProvider.discover(authority)).subaccounts).toEqual([]);
    await expect(pacificaProvider.snapshot(authority, 0)).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND', status: 404 });
    mockApi(() => Response.json({ success: false, data: null, error: 'internal secret reason', code: 404 }, { status: 404 }));
    await expect(pacificaProvider.discover(authority)).rejects.toMatchObject({ code: 'API_ERROR' });
  });

  it.each(['failure', 'bad-json', 'html', 'too-large-header', 'too-large-body', 'redirect'])('sanitizes %s failures and does not substitute sample data', async (kind) => {
    mockApi(() => {
      if (kind === 'bad-json') return new Response('{secret', { headers: { 'Content-Type': 'application/json' } });
      if (kind === 'html') return new Response('<html>private detail</html>', { headers: { 'Content-Type': 'text/html' } });
      if (kind === 'too-large-header') return new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '1048577' } });
      if (kind === 'too-large-body') return new Response(' '.repeat(1_048_577), { headers: { 'Content-Type': 'application/json' } });
      if (kind === 'redirect') return Response.json({}, { status: 302, headers: { Location: 'https://malicious.invalid/' } });
      return Response.json({ success: false, data: null, error: 'private detail', code: 500 }, { status: 500 });
    });
    await expect(pacificaProvider.discover(authority)).rejects.toMatchObject({ code: 'API_ERROR', message: expect.not.stringMatching(/secret|private detail|malicious/) });
  });

  it('rejects unsupported accounts and malformed authorities before issuing requests', async () => {
    const request = mockApi();
    await expect(pacificaProvider.snapshot(authority, 1)).rejects.toMatchObject({ code: 'SUBACCOUNT_NOT_FOUND' });
    await expect(pacificaProvider.discover('https://example.com')).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
    expect(request).not.toHaveBeenCalled();
  });

  it('aborts a stalled upstream read after the bounded request deadline', async () => {
    vi.useFakeTimers();
    const request = vi.fn((_url: URL, options: RequestInit) => new Promise<Response>((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(new Error('private timeout detail')), { once: true })));
    vi.stubGlobal('fetch', request);
    const result = expect(pacificaProvider.discover(authority)).rejects.toMatchObject({ code: 'TIMEOUT', status: 504 });
    await vi.advanceTimersByTimeAsync(18_000);
    await result;
  });
});
