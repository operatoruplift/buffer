import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { BN, BASE_PRECISION, DevnetPerpMarkets, DevnetSpotMarkets, MainnetPerpMarkets, PRICE_PRECISION, QUOTE_PRECISION, type PerpMarketAccount, type PerpPosition, type SpotMarketAccount, type StateAccount, type UserAccount } from '@velocity-exchange/sdk';
import { PublicKey } from '@solana/web3.js';
import { buildLiveLink, DEVNET_ACCOUNT_EXAMPLE, DEVNET_EXAMPLE_SUBACCOUNT, parseLiveLink } from '../src/lib/live-link';
import { isDiscoveryResponse, isSnapshotResponse } from '../src/lib/live-response';
import { GENESIS_HASHES, isLiveNetwork } from '../src/lib/networks';
import { PROTOCOLS } from '../src/lib/protocols';
import { getSampleSnapshot } from '../src/lib/samples';
import { alertInputProblem } from '../src/lib/alerts';
import { createReport } from '../src/lib/report';
import { isReport } from '../src/lib/device-reports';
import { calculateScenario } from '../src/lib/scenario';
import { serveRead, validateNetwork, type LiveProvider } from '../src/server/boundary';
import { endpointFor, PUBLIC_DEVNET_RPC } from '../src/server/velocity';
import { normalizeSnapshot, type ReadData } from '../src/server/velocity-normalize';

const authority = '11111111111111111111111111111111';
const zero = () => new BN(0);
const encoded = (value: string) => [...Buffer.from(value.padEnd(32, '\0'))];

/** A devnet read of one SOL-PERP position, with identities from the SDK's pinned devnet configuration. */
function devnetRead(configs = DevnetPerpMarkets): ReadData {
  const config = configs.find(market => market.marketIndex === 0)!;
  const quoteConfig = DevnetSpotMarkets.find(market => market.marketIndex === 0)!;
  const oracle = { data: { price: PRICE_PRECISION.mul(new BN(119)), slot: new BN(1000), confidence: new BN(100), hasSufficientNumberOfDataPoints: true }, slot: 1001 };
  const market = { marketIndex: 0, name: encoded(config.symbol), contractType: { perpetual: {} }, expiryTs: zero(), status: { active: {} }, contractTier: { a: {} }, quoteSpotMarketIndex: 0,
    oracle: config.oracle, oracleSource: config.oracleSource, marketStats: { historicalOracleData: { lastOraclePriceTwap: oracle.data.price } }, marginRatioInitial: 1000, marginRatioMaintenance: 500, imfFactor: 0 } as unknown as PerpMarketAccount;
  const quote = { marketIndex: 0, name: encoded(quoteConfig.symbol), mint: quoteConfig.mint, decimals: 6, status: { active: {} }, oracleSource: { quoteAsset: {} } } as unknown as SpotMarketAccount;
  const position = { marketIndex: 0, baseAssetAmount: BASE_PRECISION.mul(new BN(-2)), quoteAssetAmount: zero(), isolatedPositionScaledBalance: zero(), openBids: zero(), openAsks: zero(), openOrders: 0, positionFlag: 0 } as unknown as PerpPosition;
  const state = { oracleGuardRails: { validity: { tooVolatileRatio: new BN(5), confidenceIntervalMaxSize: new BN(20_000), slotsBeforeStaleForAmm: new BN(100), slotsBeforeStaleForMargin: new BN(100) } } } as unknown as StateAccount;
  return { network: 'devnet', account: { authority: new PublicKey(authority), name: encoded('Devnet account'), subAccountId: 1, poolId: 0, perpPositions: [position], spotPositions: [], orders: [] } as unknown as UserAccount,
    authority, address: authority, accountSlot: 1001, observedSlot: 1002, state,
    perps: new Map([[0, market]]), spots: new Map([[0, quote]]), perpOracles: new Map([[0, oracle]]),
    spotOracles: new Map([[0, { data: { ...oracle.data, price: PRICE_PRECISION, slot: zero() }, slot: 0 }]]), valuationOracles: new Map([[0, oracle.data]]),
    user: {
      getNetUsdValue: vi.fn(() => QUOTE_PRECISION.mul(new BN(50_000))), getUnrealizedPNL: vi.fn(() => zero()), getHealth: vi.fn(() => 100),
      getTotalCollateral: vi.fn(() => QUOTE_PRECISION.mul(new BN(50_000))), getMaintenanceMarginRequirement: vi.fn(() => QUOTE_PRECISION.mul(new BN(12))),
      getLiquidationStatuses: vi.fn(() => new Map<'cross' | number, { canBeLiquidated: boolean }>([['cross', { canBeLiquidated: false }]])), isCrossMarginBeingLiquidated: vi.fn(() => false),
    }, retrievedAt: new Date().toISOString() };
}

describe('devnet network identity', () => {
  it('pins the published genesis hashes and knows only the two live networks', () => {
    expect(GENESIS_HASHES).toEqual({ 'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' });
    expect([isLiveNetwork('devnet'), isLiveNetwork('mainnet-beta'), isLiveNetwork('testnet'), isLiveNetwork('fixture')]).toEqual([true, true, false, false]);
  });
  afterEach(() => { vi.unstubAllEnvs(); });
  it('reads devnet through a configured endpoint or Solana’s public one; mainnet still needs its own', () => {
    vi.stubEnv('SOLANA_RPC_URL', '');
    vi.stubEnv('SOLANA_DEVNET_RPC_URL', '');
    expect(endpointFor('devnet')).toBe(PUBLIC_DEVNET_RPC);
    expect(endpointFor('mainnet-beta')).toBeUndefined();
    vi.stubEnv('SOLANA_DEVNET_RPC_URL', 'https://devnet.example-rpc.test/key');
    vi.stubEnv('SOLANA_RPC_URL', 'https://mainnet.example-rpc.test/key');
    expect(endpointFor('devnet')).toBe('https://devnet.example-rpc.test/key');
    expect(endpointFor('mainnet-beta')).toBe('https://mainnet.example-rpc.test/key');
  });
});

describe('devnet requests and links', () => {
  it('admits devnet for Velocity only', () => {
    expect(validateNetwork(null, 'velocity')).toBe('mainnet-beta');
    expect(validateNetwork('mainnet-beta', 'pacifica')).toBe('mainnet-beta');
    expect(validateNetwork('devnet', 'velocity')).toBe('devnet');
    for (const [value, protocol] of [['devnet', 'pacifica'], ['devnet', 'jupiter'], ['devnet', 'drift'], ['testnet', 'velocity'], ['', 'velocity']] as const) {
      expect(() => validateNetwork(value, protocol)).toThrow(expect.objectContaining({ code: 'INVALID_NETWORK', status: 400 }));
    }
  });
  it('passes the network to the provider resolver and refuses it where unsupported', async () => {
    const provider: LiveProvider = { discover: vi.fn(async () => ({ authority, subaccounts: [], retrievedAt: new Date().toISOString(), protocol: PROTOCOLS.velocity, network: 'devnet' as const })), snapshot: vi.fn() };
    const resolver = vi.fn(async () => provider);
    expect((await serveRead(new Request(`http://localhost/api/accounts?authority=${authority}&network=devnet`), 'discovery', resolver)).status).toBe(200);
    expect(resolver).toHaveBeenCalledWith('velocity', 'devnet');
    const refused = await serveRead(new Request(`http://localhost/api/accounts?authority=${authority}&protocol=pacifica&network=devnet`), 'discovery', resolver);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: { code: 'INVALID_NETWORK', message: 'Devnet reads are available for Velocity only.', retryable: false } });
    expect((await serveRead(new Request(`http://localhost/api/accounts?authority=${authority}&network=devnet&network=devnet`), 'discovery', resolver)).status).toBe(400);
    expect(resolver).toHaveBeenCalledTimes(1);
  });
  it('round-trips devnet links and rejects devnet for other protocols', () => {
    const selection = { protocol: 'velocity' as const, authority: DEVNET_ACCOUNT_EXAMPLE, subaccount: DEVNET_EXAMPLE_SUBACCOUNT, network: 'devnet' as const };
    const link = buildLiveLink(selection);
    expect(link).toContain('network=devnet');
    expect(parseLiveLink(new URLSearchParams(link.split('?')[1]))).toEqual({ state: 'ready', selection });
    expect(parseLiveLink(new URLSearchParams(`protocol=velocity&authority=${authority}&network=mainnet-beta`))).toEqual({ state: 'ready', selection: { protocol: 'velocity', authority } });
    for (const query of [`protocol=pacifica&authority=${authority}&network=devnet`, `protocol=velocity&authority=${authority}&network=testnet`, `protocol=velocity&authority=${authority}&network=devnet&network=devnet`]) {
      expect(parseLiveLink(new URLSearchParams(query)).state).toBe('invalid');
    }
  });
});

describe('devnet observations', () => {
  it('verifies positions against the SDK’s devnet configuration and says the data is devnet', () => {
    const snapshot = { ...normalizeSnapshot(devnetRead()), protocol: PROTOCOLS.velocity };
    expect(snapshot.network).toBe('devnet');
    expect(snapshot.positions[0]).toMatchObject({ market: 'SOL-PERP', modeled: true, size: '-2', price: '119', exclusionReason: null });
    expect(snapshot.provenance[0]).toMatch(/^Solana devnet · confirmed commitment/);
    expect(snapshot.provenance.join(' ')).toContain('Devnet balances and prices are test values');
    expect(calculateScenario(snapshot, 10, Date.parse(snapshot.retrievedAt)).disabledReason).toBeNull();
  });
  it('refuses a devnet position that only matches the mainnet configuration', () => {
    const mainnetOracle = MainnetPerpMarkets.find(market => market.marketIndex === 0)!.oracle;
    const devnetOracle = DevnetPerpMarkets.find(market => market.marketIndex === 0)!.oracle;
    if (mainnetOracle.equals(devnetOracle)) return; // Identical pinned oracles would make this case indistinguishable.
    const snapshot = normalizeSnapshot(devnetRead(MainnetPerpMarkets));
    expect(snapshot.positions[0]).toMatchObject({ modeled: false, exclusionReason: 'Market identity does not match the pinned devnet configuration.' });
  });
  it('accepts devnet responses only when devnet was requested', () => {
    const snapshot = { ...normalizeSnapshot(devnetRead()), protocol: PROTOCOLS.velocity };
    const address = snapshot.subaccount.address;
    expect(isSnapshotResponse(snapshot, authority, 'velocity', 1, address, 'devnet')).toBe(true);
    expect(isSnapshotResponse(snapshot, authority, 'velocity', 1, address)).toBe(false);
    expect(isSnapshotResponse({ ...snapshot, network: 'mainnet-beta' }, authority, 'velocity', 1, address, 'devnet')).toBe(false);
    const discovery = { authority, protocol: PROTOCOLS.velocity, retrievedAt: new Date().toISOString(), subaccounts: [{ id: 1, name: 'Devnet account', address }] };
    expect(isDiscoveryResponse({ ...discovery, network: 'devnet' }, authority, 'velocity', 'devnet')).toBe(true);
    expect(isDiscoveryResponse(discovery, authority, 'velocity', 'devnet')).toBe(false);
    expect(isDiscoveryResponse({ ...discovery, network: 'devnet' }, authority, 'velocity')).toBe(false);
  });
  it('keeps monitoring on mainnet and lets reports record a devnet read', () => {
    const snapshot = { ...normalizeSnapshot(devnetRead()), protocol: PROTOCOLS.velocity };
    expect(alertInputProblem(snapshot)).toBe('Monitoring covers Velocity accounts on Solana mainnet. Devnet reads are for exploration only.');
    const report = createReport(snapshot, calculateScenario(snapshot, -5, Date.parse(snapshot.retrievedAt)));
    expect(report.network).toBe('devnet');
    expect(isReport(JSON.parse(JSON.stringify(report)))).toBe(true);
    const sample = getSampleSnapshot('long-short');
    expect(isReport(JSON.parse(JSON.stringify({ ...createReport(sample, calculateScenario(sample, 0, Date.parse(sample.retrievedAt))), network: 'devnet' })))).toBe(false);
  });
});
