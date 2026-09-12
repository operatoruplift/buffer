import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
vi.mock('server-only', () => ({}));
import { PublicKey, Connection } from '@solana/web3.js';
import {
  BN, BASE_PRECISION, PRICE_PRECISION, QUOTE_PRECISION, SPOT_MARKET_BALANCE_PRECISION,
  SPOT_MARKET_CUMULATIVE_INTEREST_PRECISION, MainnetPerpMarkets, MainnetSpotMarkets,
  type PerpPosition, type SpotPosition, type UserAccount, type PerpMarketAccount,
  type SpotMarketAccount, type StateAccount, type Order, DriftClient, DRIFT_PROGRAM_ID, PollingDriftClientAccountSubscriber, getPerpMarketPublicKeySync, getSpotMarketPublicKeySync,
} from '@drift-labs/sdk';
import { ProviderFailure, serveRead, validateAuthority, validateProtocol, validateSubaccount, type LiveProvider } from '../src/server/boundary';
import { baselineCoverageIssues, normalizeRaw, normalizeSnapshot, observeOracle, requiredMarkets, type ReadData } from '../src/server/normalize';
import { liveProvider, requireSelectedAccount, SnapshotAccountLoader, bindCanonicalDriftProgram } from '../src/server/drift';

const authority = '11111111111111111111111111111111';
it('binds actual SDK reads and subscriptions to the canonical Drift deployment with matching coder names', async () => {
  const connection = new Connection('http://127.0.0.1:1');
  const wallet = { publicKey: new PublicKey(authority), async signTransaction<T>(): Promise<T> { throw new Error('Read only'); }, async signAllTransactions<T>(): Promise<T[]> { throw new Error('Read only'); } };
  const loader = new SnapshotAccountLoader(connection, new Set());
  const client = new DriftClient({ connection, wallet, env: 'mainnet-beta', skipLoadUsers: true, userStats: false, perpMarketIndexes: [], spotMarketIndexes: [], accountSubscription: { type: 'polling', accountLoader: loader } });
  bindCanonicalDriftProgram(client);
  expect(client.program.programId.toBase58()).toBe(DRIFT_PROGRAM_ID);
  expect(client.accountSubscriber).toBeInstanceOf(PollingDriftClientAccountSubscriber);
  expect((client.accountSubscriber as PollingDriftClientAccountSubscriber).program).toBe(client.program);
  for (const name of ['User', 'PerpMarket', 'SpotMarket', 'State']) expect(client.program.idl.accounts?.some(account => account.name === name)).toBe(true);
  expect((await client.getStatePublicKey()).toBase58()).toBe(PublicKey.findProgramAddressSync([Buffer.from('drift_state')], new PublicKey(DRIFT_PROGRAM_ID))[0].toBase58());
  const fixtures = new URL('./fixtures/drift-mainnet/', import.meta.url);
  for (const file of readdirSync(fixtures).filter(name => name.endsWith('.bin'))) {
    const [kind, address] = file.slice(0, -4).split('-');
    const data = readFileSync(new URL(file, fixtures));
    if (kind === 'State') {
      const state = client.program.coder.accounts.decode<StateAccount>('State', data);
      expect(state.numberOfMarkets, file).toBeGreaterThan(0);
    } else {
      const market = client.program.coder.accounts.decode<PerpMarketAccount | SpotMarketAccount>(kind, data);
      expect(market.pubkey.toBase58(), file).toBe(address);
      const derived = kind === 'PerpMarket' ? getPerpMarketPublicKeySync(client.program.programId, market.marketIndex) : getSpotMarketPublicKeySync(client.program.programId, market.marketIndex);
      expect(derived.toBase58(), file).toBe(address);
    }
  }
  loader.dispose();
});
const zero = () => new BN(0);
const encoded = (value: string) => [...Buffer.from(value.padEnd(32, '\0'))];
function perpPosition(marketIndex = 0, quantity = '100'): PerpPosition {
  return { marketIndex, baseAssetAmount: BASE_PRECISION.mul(new BN(quantity)), quoteAssetAmount: zero(), lpShares: zero(), isolatedPositionScaledBalance: zero(), openBids: zero(), openAsks: zero(), openOrders: 0, positionFlag: 0 } as unknown as PerpPosition;
}
function spotPosition(marketIndex: number, borrow: boolean, amount: number): SpotPosition {
  return { marketIndex, scaledBalance: SPOT_MARKET_BALANCE_PRECISION.mul(new BN(amount)), balanceType: borrow ? { borrow: {} } : { deposit: {} }, openOrders: 0, openBids: zero(), openAsks: zero() } as unknown as SpotPosition;
}
function fixture(): ReadData {
  const sol = MainnetPerpMarkets.find((p) => p.baseAssetSymbol === 'SOL')!;
  const usd = MainnetSpotMarkets.find((p) => p.marketIndex === 0)!;
  const solSpot = MainnetSpotMarkets.find((p) => p.marketIndex === 1)!;
  const oracle = { data: { price: PRICE_PRECISION.mul(new BN(150)), slot: new BN(1000), confidence: new BN(100), hasSufficientNumberOfDataPoints: true }, slot: 1001 };
  const market = { marketIndex: sol.marketIndex, name: encoded(sol.symbol), contractType: { perpetual: {} }, status: { active: {} }, contractTier: { a: {} }, quoteSpotMarketIndex: 0,
    amm: { oracle: sol.oracle, oracleSource: sol.oracleSource, historicalOracleData: { lastOraclePriceTwap: oracle.data.price } } } as unknown as PerpMarketAccount;
  const quote = { marketIndex: 0, name: encoded(usd.symbol), mint: usd.mint, decimals: 6, status: { active: {} }, oracleSource: { quoteAsset: {} }, historicalOracleData: { lastOraclePriceTwap: PRICE_PRECISION }, cumulativeDepositInterest: SPOT_MARKET_CUMULATIVE_INTEREST_PRECISION, cumulativeBorrowInterest: SPOT_MARKET_CUMULATIVE_INTEREST_PRECISION } as unknown as SpotMarketAccount;
  const collateral = { ...quote, marketIndex: 1, name: encoded(solSpot.symbol), mint: solSpot.mint, decimals: 9, oracleSource: solSpot.oracleSource, historicalOracleData: { lastOraclePriceTwap: oracle.data.price } } as unknown as SpotMarketAccount;
  const state = { oracleGuardRails: { validity: { tooVolatileRatio: new BN(5), confidenceIntervalMaxSize: new BN(20_000), slotsBeforeStaleForAmm: new BN(100), slotsBeforeStaleForMargin: new BN(100) } } } as unknown as StateAccount;
  const account = { authority: new PublicKey(authority), name: encoded('Primary'), subAccountId: 0, poolId: 0, perpPositions: [perpPosition()], spotPositions: [spotPosition(0, false, 1000), spotPosition(1, true, 2)], orders: [{ status: { open: {} }, marketType: { perp: {} }, marketIndex: 0 }, { status: { open: {} }, marketType: { spot: {} }, marketIndex: 1 }] } as unknown as UserAccount;
  return { account, authority, address: authority, accountSlot: 1001, observedSlot: 1002, state,
    perps: new Map([[0, market]]), spots: new Map([[0, quote], [1, collateral]]),
    perpOracles: new Map([[0, oracle]]), spotOracles: new Map([[0, { data: { ...oracle.data, price: PRICE_PRECISION, slot: zero() }, slot: 0 }], [1, oracle]]),
    valuationOracles: new Map([[0, oracle.data]]),
    user: { getNetUsdValue: vi.fn(() => QUOTE_PRECISION.mul(new BN(10_000))), getUnrealizedPNL: vi.fn(() => QUOTE_PRECISION.mul(new BN(-50))), getHealth: vi.fn(() => 90) }, retrievedAt: '2026-09-11T00:00:00.000Z' };
}

const mockProvider = (): LiveProvider => ({ discover: vi.fn(async () => ({ authority, subaccounts: [], retrievedAt: '2026-09-11T00:00:00.000Z' })), snapshot: vi.fn(async () => normalizeSnapshot(fixture())) });

describe('read API boundaries', () => {
  it('defaults to Velocity and accepts only the explicit legacy protocol', () => {
    expect(validateProtocol(null)).toBe('velocity');
    expect(validateProtocol('velocity')).toBe('velocity');
    expect(validateProtocol('drift')).toBe('drift');
    expect(() => validateProtocol('arbitrary')).toThrow(ProviderFailure);
  });
  it('passes the selected protocol to a provider resolver', async () => {
    const velocity = mockProvider();
    const drift = mockProvider();
    const resolver = vi.fn(async (protocol: 'velocity' | 'drift') => protocol === 'velocity' ? velocity : drift);
    const response = await serveRead(new Request(`http://localhost/api/accounts?authority=${authority}&protocol=drift`), 'discovery', resolver);
    expect(response.status).toBe(200);
    expect(resolver).toHaveBeenCalledWith('drift');
    expect(drift.discover).toHaveBeenCalledWith(authority);
    expect(velocity.discover).not.toHaveBeenCalled();
  });
  it('accepts canonical addresses and rejects malformed addresses', () => {
    expect(validateAuthority(` ${authority} `)).toBe(authority);
    for (const input of [null, '', 'bad', '0'.repeat(44), 'a'.repeat(60)]) expect(() => validateAuthority(input)).toThrow(ProviderFailure);
  });
  it('requires bounded, explicit subaccount IDs', () => {
    expect(validateSubaccount('0')).toBe(0);
    expect(validateSubaccount('65535')).toBe(65535);
    for (const input of [null, '', '65536', '-1', '0.1', '01', '1e2']) expect(() => validateSubaccount(input)).toThrow(ProviderFailure);
  });
  it('returns an honest empty discovery without substituting sample data', async () => {
    const response = await serveRead(new Request(`http://localhost/api/accounts?authority=${authority}`), 'discovery', mockProvider());
    expect(response.status).toBe(200);
    expect((await response.json()).subaccounts).toEqual([]);
  });
  it('rejects unselected subaccounts and arbitrary RPC query options before provider calls', async () => {
    const provider = mockProvider();
    for (const url of [`http://localhost/api/snapshot?authority=${authority}`, `http://localhost/api/accounts?authority=${authority}&rpcUrl=https://example.com`, `http://localhost/api/accounts?authority=${authority}&authority=${authority}`]) {
      expect((await serveRead(new Request(url), url.includes('snapshot') ? 'snapshot' : 'discovery', provider)).status).toBe(400);
    }
    expect(provider.discover).not.toHaveBeenCalled();
    expect(provider.snapshot).not.toHaveBeenCalled();
  });
  it('redacts provider errors and preserves a structured retryable error', async () => {
    const provider = mockProvider();
    provider.discover = vi.fn(async () => { throw new Error('https://private.rpc/?api-key=secret'); });
    const response = await serveRead(new Request(`http://localhost/api/accounts?authority=${authority}`), 'discovery', provider);
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error.code).toBe('RPC_ERROR');
    expect(body.error.retryable).toBe(true);
    expect(JSON.stringify(body)).not.toContain('secret');
  });
  it('rejects missing subaccounts and authority mismatches', () => {
    expect(() => requireSelectedAccount(null, new PublicKey(authority), 0)).toThrow('not found');
    expect(() => requireSelectedAccount(fixture().account, new PublicKey(authority), 1)).toThrow('does not belong');
    expect(() => requireSelectedAccount(fixture().account, MainnetSpotMarkets[1].mint, 0)).toThrow('does not belong');
  });
  it('reports live configuration absence explicitly', async () => {
    const original = process.env.SOLANA_RPC_URL;
    delete process.env.SOLANA_RPC_URL;
    try { await expect(liveProvider.discover(authority)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' }); }
    finally { if (original === undefined) delete process.env.SOLANA_RPC_URL; else process.env.SOLANA_RPC_URL = original; }
  });
});

describe('coverage and normalization', () => {
  it('loads market references from debt, collateral, zero-base state, and orders', () => {
    const data = fixture();
    const flat = perpPosition(7, '0'); flat.quoteAssetAmount = new BN(42);
    data.account.perpPositions.push(flat);
    data.account.orders.push({ status: { open: {} }, marketType: { perp: {} }, marketIndex: 9 } as unknown as Order);
    expect(requiredMarkets(data.account)).toEqual({ perp: [0, 7, 9], spot: [0, 1] });
  });
  it('withholds baseline metrics when debt market data is incomplete', () => {
    const data = fixture(); data.spots.delete(1);
    expect(baselineCoverageIssues(data).join(' ')).toContain('Spot market 1 was not loaded');
    const snapshot = normalizeSnapshot(data);
    expect(snapshot.metrics.every((m) => m.value === null)).toBe(true);
    expect(data.user.getNetUsdValue).not.toHaveBeenCalled();
    expect(snapshot.spots.find((s) => s.kind === 'Debt')?.amount).toBeNull();
    expect(snapshot.inventoryAvailable).toBe(false);
    expect(snapshot.positions[0].modeled).toBe(true);
  });
  it('exposes collateral, debt and orders outside the scenario positions', () => {
    const snapshot = normalizeSnapshot(fixture());
    expect(snapshot.spots).toEqual([{ market: 'USDC', kind: 'Collateral', amount: '1000' }, { market: 'SOL', kind: 'Debt', amount: '2' }]);
    expect(snapshot.orders).toEqual([{ market: 'SOL-PERP (perp)', count: 1 }, { market: 'SOL (spot)', count: 1 }]);
    expect(snapshot.positions).toHaveLength(1);
    expect(snapshot.positions[0]).toMatchObject({ size: '100', price: '150', notional: '15000', quote: 'USDC', modeled: true });
    expect(snapshot.metrics.map((m) => m.value)).toEqual(['10000', '-50', '90']);
    expect(snapshot.accountSlot).toBe(1001); expect(snapshot.observedSlot).toBe(1002);
    expect(snapshot.positions[0].oracle).toMatchObject({ slot: 1000, readSlot: 1001 });
  });
  it('does not infer live identity from a ticker alone', () => {
    const data = fixture(); data.perps.get(0)!.amm.oracle = PublicKey.default;
    expect(normalizeSnapshot(data).positions[0]).toMatchObject({ modeled: false, exclusionReason: 'Market identity does not match the pinned mainnet configuration.' });
  });
  it('excludes LP and zero-base exposure while withholding LP baselines', () => {
    const data = fixture(); data.account.perpPositions[0].lpShares = new BN(1);
    const snapshot = normalizeSnapshot(data);
    expect(snapshot.positions[0].exclusionReason).toContain('LP exposure');
    expect(snapshot.metrics.every((m) => m.value === null)).toBe(true);
    data.account.perpPositions[0].lpShares = zero(); data.account.perpPositions[0].baseAssetAmount = zero(); data.account.perpPositions[0].quoteAssetAmount = new BN(1);
    expect(normalizeSnapshot(data).positions[0].exclusionReason).toContain('Zero base size');
  });
  it('withholds general health for isolated positions', () => {
    const data = fixture(); data.account.perpPositions[0].positionFlag = 1;
    const snapshot = normalizeSnapshot(data);
    expect(snapshot.positions[0].isolated).toBe(true);
    expect(snapshot.metrics[2].value).toBeNull();
    expect(data.user.getHealth).not.toHaveBeenCalled();
  });
  it('includes isolated quote collateral separately from scenario exposure', () => {
    const data = fixture(); data.account.perpPositions[0].positionFlag = 1;
    data.account.perpPositions[0].isolatedPositionScaledBalance = SPOT_MARKET_BALANCE_PRECISION.mul(new BN(75));
    const snapshot = normalizeSnapshot(data);
    expect(snapshot.spots.find((s) => s.market.includes('isolated'))).toMatchObject({ market: 'USDC · isolated SOL-PERP', kind: 'Collateral', amount: '75' });
    expect(snapshot.positions[0].size).toBe('100');
    expect(snapshot.positions[0].notional).toBe('15000');
    data.account.perpPositions[0].baseAssetAmount = zero();
    expect(requiredMarkets(data.account).perp).toContain(0);
    expect(normalizeSnapshot(data).positions[0].exclusionReason).toContain('Zero base size');
    expect(normalizeSnapshot(data).spots.find((s) => s.market.includes('isolated'))?.amount).toBe('75');
  });
  it('rejects stale, nonpositive and insufficient oracle prices', () => {
    for (const variant of ['stale', 'zero', 'negative', 'insufficient']) {
      const data = fixture(); const oracle = data.perpOracles.get(0)!;
      if (variant === 'stale') oracle.data.slot = new BN(800);
      if (variant === 'zero') oracle.data.price = zero();
      if (variant === 'negative') oracle.data.price = new BN(-1);
      if (variant === 'insufficient') oracle.data.hasSufficientNumberOfDataPoints = false;
      expect(observeOracle(oracle, data.observedSlot, data.state, data.perps.get(0)).valid).toBe(false);
      expect(normalizeSnapshot(data).positions[0].price).toBeNull();
      expect(normalizeSnapshot(data).positions[0].modeled).toBe(false);
    }
  });
  it('validates separate SDK valuation oracles before claiming baseline values', () => {
    const data = fixture(); data.valuationOracles.set(0, { ...data.valuationOracles.get(0)!, price: zero() });
    const snapshot = normalizeSnapshot(data);
    expect(snapshot.positions[0].modeled).toBe(true);
    expect(snapshot.metrics.every((m) => m.value === null)).toBe(true);
  });
  it('preserves large integers and fractional raw values without float conversion', () => {
    expect(normalizeRaw(new BN('12345678901234567890123456789123456789'), BASE_PRECISION)).toBe('12345678901234567890123456789.123456789');
  });
});

describe('request-owned manual loader', () => {
  it('propagates transport failure instead of claiming subscription success', async () => {
    const connection = { getMultipleAccountsInfoAndContext: vi.fn(async () => { throw new Error('RPC failed'); }) } as unknown as Connection;
    const loader = new SnapshotAccountLoader(connection, new Set());
    await loader.addAccount(new PublicKey(authority), vi.fn());
    await expect(loader.load()).rejects.toThrow('RPC failed');
    expect(loader.intervalId).toBeUndefined();
    loader.dispose();
    expect(loader.accountsToLoad.size).toBe(0);
  });
  it('records later observed slots for unchanged bytes and handles missing data', async () => {
    const account = { data: Buffer.from('x'), owner: PublicKey.default };
    const rpc = vi.fn().mockResolvedValueOnce({ context: { slot: 10 }, value: [account] }).mockResolvedValueOnce({ context: { slot: 11 }, value: [account] }).mockResolvedValueOnce({ context: { slot: 12 }, value: [null] });
    const loader = new SnapshotAccountLoader({ getMultipleAccountsInfoAndContext: rpc } as unknown as Connection, new Set());
    await loader.addAccount(new PublicKey(authority), vi.fn());
    await loader.load(); await loader.load();
    expect(loader.getBufferAndSlot(new PublicKey(authority))?.slot).toBe(11);
    await loader.load();
    expect(loader.getBufferAndSlot(new PublicKey(authority))?.buffer).toBeUndefined();
    loader.dispose();
  });
  it('keeps newer bytes when RPC responses arrive out of order', async () => {
    const newer = { data: Buffer.from('newer'), owner: PublicKey.default };
    const older = { data: Buffer.from('older'), owner: PublicKey.default };
    const callback = vi.fn();
    const rpc = vi.fn().mockResolvedValueOnce({ context: { slot: 20 }, value: [newer] }).mockResolvedValueOnce({ context: { slot: 19 }, value: [older] });
    const loader = new SnapshotAccountLoader({ getMultipleAccountsInfoAndContext: rpc } as unknown as Connection, new Set());
    await loader.addAccount(new PublicKey(authority), callback);
    await loader.load(); await loader.load();
    expect(loader.getBufferAndSlot(new PublicKey(authority))).toMatchObject({ slot: 20, buffer: newer.data });
    expect(callback).toHaveBeenCalledTimes(1);
    loader.dispose();
  });
  it('ignores a lower-slot wrong-owner response after a verified account', async () => {
    const newer = { data: Buffer.from('newer'), owner: new PublicKey(DRIFT_PROGRAM_ID) };
    const older = { data: Buffer.from('older'), owner: PublicKey.default };
    const callback = vi.fn();
    const rpc = vi.fn().mockResolvedValueOnce({ context: { slot: 20 }, value: [newer] }).mockResolvedValueOnce({ context: { slot: 19 }, value: [older] });
    const loader = new SnapshotAccountLoader({ getMultipleAccountsInfoAndContext: rpc } as unknown as Connection, new Set([authority]));
    await loader.addAccount(new PublicKey(authority), callback);
    await loader.load(); await expect(loader.load()).resolves.toBeUndefined();
    expect(loader.getBufferAndSlot(new PublicKey(authority))).toMatchObject({ slot: 20, buffer: newer.data });
    expect(callback).toHaveBeenCalledTimes(1);
    loader.dispose();
  });
});
