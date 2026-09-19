import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
vi.mock('server-only', () => ({}));
import { Connection, PublicKey } from 'velocity-web3';
import {
  BulkAccountLoader,
  BN, BASE_PRECISION, PRICE_PRECISION, QUOTE_PRECISION,
  MainnetPerpMarkets,
  MainnetSpotMarkets,
  VELOCITY_PROGRAM_ID,
  VelocityClient,
  User,
  PositionFlag,
  type IWallet,
  type PerpMarketAccount,
  type SpotMarketAccount,
  type StateAccount,
  type PerpPosition, type UserAccount,
} from '@velocity-exchange/sdk';
import { bindCanonicalVelocityProgram, SnapshotAccountLoader } from '../src/server/velocity';
import { normalizeSnapshot, type ReadData } from '../src/server/velocity-normalize';
import { calculateScenario } from '../src/lib/scenario';
import { CONFIGURED_PERP_MARKETS } from '../src/lib/perp-markets';
import { PROTOCOLS } from '../src/lib/protocols';
import { MarginCalculation, MarginContext } from '@velocity-exchange/sdk/lib/node/marginCalculation';

const program = new PublicKey(VELOCITY_PROGRAM_ID);
const authority = new PublicKey('11111111111111111111111111111111');
const fixtures = new URL('./fixtures/velocity-mainnet/', import.meta.url);
const zero = () => new BN(0);
const encoded = (value: string) => [...Buffer.from(value.padEnd(32, '\0'))];

function marketFixture(index = 3): ReadData {
  const config = MainnetPerpMarkets.find((market) => market.marketIndex === index)!;
  const quoteConfig = MainnetSpotMarkets.find((market) => market.marketIndex === 0)!;
  const oracle = { data: { price: PRICE_PRECISION.mul(new BN(40)), slot: new BN(1000), confidence: new BN(100), hasSufficientNumberOfDataPoints: true }, slot: 1001 };
  const market = { marketIndex: index, name: encoded(config.symbol), contractType: { perpetual: {} }, expiryTs: zero(), status: { active: {} }, contractTier: { a: {} }, quoteSpotMarketIndex: 0,
    oracle: config.oracle, oracleSource: config.oracleSource, marketStats: { historicalOracleData: { lastOraclePriceTwap: oracle.data.price } } } as unknown as PerpMarketAccount;
  const quote = { marketIndex: 0, name: encoded(quoteConfig.symbol), mint: quoteConfig.mint, decimals: 6, status: { active: {} }, oracleSource: { quoteAsset: {} } } as unknown as SpotMarketAccount;
  const position = { marketIndex: index, baseAssetAmount: BASE_PRECISION.mul(new BN(500)), quoteAssetAmount: zero(), isolatedPositionScaledBalance: zero(), openBids: zero(), openAsks: zero(), openOrders: 0, positionFlag: 0 } as unknown as PerpPosition;
  const state = { oracleGuardRails: { validity: { tooVolatileRatio: new BN(5), confidenceIntervalMaxSize: new BN(20_000), slotsBeforeStaleForAmm: new BN(100), slotsBeforeStaleForMargin: new BN(100) } } } as unknown as StateAccount;
  return { account: { authority, name: encoded('Test account'), subAccountId: 0, poolId: 0, perpPositions: [position], spotPositions: [], orders: [] } as unknown as UserAccount,
    authority: authority.toBase58(), address: authority.toBase58(), accountSlot: 1001, observedSlot: 1002, state,
    perps: new Map([[index, market]]), spots: new Map([[0, quote]]), perpOracles: new Map([[index, oracle]]),
    spotOracles: new Map([[0, { data: { ...oracle.data, price: PRICE_PRECISION, slot: zero() }, slot: 0 }]]), valuationOracles: new Map([[index, oracle.data]]),
    user: {
      getNetUsdValue: vi.fn(() => QUOTE_PRECISION.mul(new BN(10_000))), getUnrealizedPNL: vi.fn(() => zero()), getHealth: vi.fn(() => 90),
      getTotalCollateral: vi.fn(() => QUOTE_PRECISION.mul(new BN(11_000))), getMaintenanceMarginRequirement: vi.fn(() => QUOTE_PRECISION.mul(new BN(1_000))),
      getLiquidationStatuses: vi.fn(() => new Map<'cross' | number, { canBeLiquidated: boolean }>([['cross', { canBeLiquidated: false }]])), isCrossMarginBeingLiquidated: vi.fn(() => false),
    }, retrievedAt: '2026-09-11T00:00:00.000Z' };
}

function makeClient() {
  const connection = new Connection('http://127.0.0.1:1');
  const wallet: IWallet = {
    publicKey: authority,
    async signTransaction() { throw new Error('Read only'); },
    async signAllTransactions() { throw new Error('Read only'); },
  };
  const loader = new BulkAccountLoader(connection, 'confirmed', 0);
  return { connection, loader, client: new VelocityClient({
    connection,
    wallet,
    env: 'mainnet-beta',
    skipLoadUsers: true,
    userStats: false,
    perpMarketIndexes: [],
    spotMarketIndexes: [],
    accountSubscription: { type: 'polling', accountLoader: loader },
  }) };
}

describe('Velocity mainnet compatibility fixtures', () => {
  it('keeps the browser identity registry synchronized with all pinned Velocity markets', () => {
    expect(CONFIGURED_PERP_MARKETS.velocity).toEqual(MainnetPerpMarkets.filter((market) => market.symbol.endsWith('-PERP'))
      .map(({ marketIndex, symbol, baseAssetSymbol }) => ({ marketIndex, market: symbol, asset: baseAssetSymbol })));
  });

  it.each(MainnetPerpMarkets.map((market) => [market.marketIndex, market.baseAssetSymbol]))('models verified configured market %s (%s)', (index, asset) => {
    const data = marketFixture(Number(index));
    const snapshot = { ...normalizeSnapshot(data), protocol: PROTOCOLS.velocity };
    expect(snapshot.positions[0]).toMatchObject({ asset, marketIndex: index, modeled: true, quote: 'USDT', price: '40', size: '500', exclusionReason: null });
    expect(snapshot.risk).toMatchObject({ totalCollateral: '11000', maintenanceRequirement: '1000', maintenanceHeadroom: '10000', status: 'clear' });
    expect(calculateScenario(snapshot, -10, Date.parse(data.retrievedAt)).totals).toEqual([{ quote: 'USDT', delta: '-2000' }]);
  });

  it('surfaces the SDK liquidation flag and withholds cross context for isolated scope', () => {
    const flagged = marketFixture();
    flagged.user.getLiquidationStatuses = vi.fn(() => new Map<'cross' | number, { canBeLiquidated: boolean }>([['cross', { canBeLiquidated: true }]]));
    flagged.user.isCrossMarginBeingLiquidated = vi.fn(() => true);
    const flaggedSnapshot = normalizeSnapshot(flagged);
    expect(flaggedSnapshot.risk).toMatchObject({ status: 'liquidating', canBeLiquidated: true });
    expect(flaggedSnapshot.warnings).toEqual(expect.arrayContaining([expect.stringContaining('being liquidated or bankrupt')]));

    const isolated = marketFixture();
    isolated.account.perpPositions[0].positionFlag = PositionFlag.IsolatedPosition;
    expect(normalizeSnapshot(isolated).risk).toMatchObject({ status: 'unavailable', totalCollateral: null, maintenanceRequirement: null, maintenanceHeadroom: null });
  });

  it('keeps risk money precise beyond JavaScript safe integers', () => {
    const data = marketFixture();
    data.user.getTotalCollateral = vi.fn(() => new BN('9007199254740993123456789'));
    data.user.getMaintenanceMarginRequirement = vi.fn(() => new BN('9007199254740993123456788'));
    expect(normalizeSnapshot(data).risk).toMatchObject({
      totalCollateral: '9007199254740993123.456789',
      maintenanceRequirement: '9007199254740993123.456788',
      maintenanceHeadroom: '0.000001',
    });
    expect(data.user.getTotalCollateral).toHaveBeenCalledWith('Maintenance');
    expect(data.user.getMaintenanceMarginRequirement).toHaveBeenCalledWith();
  });

  it('retains exact zero for an observed no-liability account and negative collateral for an underfunded account', () => {
    const empty = marketFixture();
    empty.user.getTotalCollateral = vi.fn(zero);
    empty.user.getMaintenanceMarginRequirement = vi.fn(zero);
    expect(normalizeSnapshot(empty).risk).toMatchObject({ totalCollateral: '0', maintenanceRequirement: '0', maintenanceHeadroom: '0', status: 'clear' });
    const underfunded = marketFixture();
    underfunded.user.getTotalCollateral = vi.fn(() => new BN(-1));
    underfunded.user.getLiquidationStatuses = vi.fn(() => new Map<'cross' | number, { canBeLiquidated: boolean }>([['cross', { canBeLiquidated: true }]]));
    expect(normalizeSnapshot(underfunded).risk).toMatchObject({ totalCollateral: '-0.000001', maintenanceHeadroom: '-1000.000001', status: 'maintenance' });
  });

  it('keeps status unavailable when the SDK cannot provide a cross-scope status', () => {
    const data = marketFixture();
    data.user.getLiquidationStatuses = vi.fn(() => new Map());
    expect(normalizeSnapshot(data).risk).toMatchObject({ maintenanceHeadroom: '10000', canBeLiquidated: null, status: 'unavailable' });
  });

  it('withholds the complete risk context after an SDK calculation error', () => {
    const data = marketFixture();
    data.user.getMaintenanceMarginRequirement = vi.fn(() => { throw new Error('Unsupported account'); });
    expect(normalizeSnapshot(data).risk).toMatchObject({ totalCollateral: null, maintenanceRequirement: null, maintenanceHeadroom: null, canBeLiquidated: null, status: 'unavailable' });
  });

  it('retains the liquidation flag independently of a recovered eligibility check', () => {
    const data = marketFixture();
    data.user.isCrossMarginBeingLiquidated = vi.fn(() => true);
    expect(normalizeSnapshot(data).risk).toMatchObject({ status: 'liquidating', canBeLiquidated: false });
    expect(normalizeSnapshot(data).warnings).toContain('Velocity SDK currently marks the cross-margin account as being liquidated or bankrupt. This is a current provider flag, not a forecast or a new eligibility calculation.');
  });

  it('withholds risk values for isolated market index zero and stale oracle input', () => {
    const isolatedZero = marketFixture(0);
    isolatedZero.account.perpPositions[0].positionFlag = PositionFlag.IsolatedPosition;
    expect(normalizeSnapshot(isolatedZero).risk).toMatchObject({ status: 'unavailable', maintenanceHeadroom: null });
    const stale = marketFixture();
    stale.perpOracles.get(3)!.data.slot = new BN(800);
    expect(normalizeSnapshot(stale).risk).toMatchObject({ status: 'unavailable', maintenanceHeadroom: null });
    expect(stale.user.getTotalCollateral).not.toHaveBeenCalled();
  });

  it('pins SDK status semantics separately from the explicit buffered requirement', () => {
    const margin = new MarginCalculation(MarginContext.liquidation(new BN(100), new Map()));
    margin.addCrossMarginTotalCollateral(new BN(105));
    margin.addCrossMarginRequirement(new BN(100), new BN(1000));
    // SDK 0.23.1 compares the plain fields, even though the buffer is present.
    expect(margin.meetsCrossMarginRequirementWithBuffer()).toBe(false);
    expect(User.prototype.getLiquidationStatuses.call({} as User, margin).get('cross')).toMatchObject({ canBeLiquidated: false });
  });

  it.each(['index', 'name', 'oracle', 'source', 'unknown'] as const)('excludes a mismatched %s even when the position ticker looks valid', (mismatch) => {
    const data = marketFixture();
    const market = data.perps.get(3)!;
    if (mismatch === 'index') market.marketIndex = 2;
    if (mismatch === 'name') market.name = encoded('HYPE-PERP-FAKE');
    if (mismatch === 'oracle') market.oracle = PublicKey.default;
    if (mismatch === 'source') market.oracleSource = { quoteAsset: {} };
    if (mismatch === 'unknown') {
      data.account.perpPositions[0].marketIndex = 999;
      market.marketIndex = 999;
      data.perps = new Map([[999, market]]);
    }
    expect(normalizeSnapshot(data).positions[0]).toMatchObject({ modeled: false, exclusionReason: expect.stringContaining('identity') });
  });

  it.each(['prediction', 'future', 'dated', 'settled', 'paused', 'quote', 'stale', 'missing', 'nonpositive', 'insufficient'] as const)('keeps %s HYPE exposure outside the model', (invalid) => {
    const data = marketFixture();
    const market = data.perps.get(3)!;
    if (invalid === 'prediction') market.contractType = { deprecatedPrediction: {} };
    if (invalid === 'future') market.contractType = { deprecatedFuture: {} };
    if (invalid === 'dated') market.expiryTs = new BN(1);
    if (invalid === 'settled') market.status = { settlement: {} };
    if (invalid === 'paused') market.status = { fillPaused: {} };
    if (invalid === 'quote') data.spots.get(0)!.mint = PublicKey.default;
    if (invalid === 'stale') data.perpOracles.get(3)!.data.slot = new BN(800);
    if (invalid === 'missing') data.perpOracles.delete(3);
    if (invalid === 'nonpositive') data.perpOracles.get(3)!.data.price = zero();
    if (invalid === 'insufficient') data.perpOracles.get(3)!.data.hasSufficientNumberOfDataPoints = false;
    const snapshot = { ...normalizeSnapshot(data), protocol: PROTOCOLS.velocity };
    expect(snapshot.positions[0], invalid).toMatchObject({ modeled: false, exclusionReason: expect.any(String) });
    expect(calculateScenario(snapshot, -10, Date.parse(data.retrievedAt)).totals).toEqual([]);
  });

  it('binds the official SDK to the current program and lower-camel IDL accounts', () => {
    const { loader, client } = makeClient();
    bindCanonicalVelocityProgram(client);
    expect(client.program.programId.toBase58()).toBe(VELOCITY_PROGRAM_ID);
    expect(client.program.idl.accounts?.map((account) => account.name)).toEqual(expect.arrayContaining(['state', 'perpMarket', 'spotMarket', 'user', 'pythLazerOracle']));
    expect(PublicKey.findProgramAddressSync([Buffer.from('velocity_state')], program)[0].toBase58()).toBe('2etx5NvPNxeMZ7EfHE6GjJfW2imRYEUANehNS1WB4CVW');
    loader.stopPolling();
  });

  it('decodes captured state, SOL/BTC/ETH markets, quote USDT, and oracle buffers', () => {
    const { loader, client } = makeClient();
    const state = client.program.coder.accounts.decode<StateAccount>('state', readFileSync(new URL('state-2etx5NvPNxeMZ7EfHE6GjJfW2imRYEUANehNS1WB4CVW.bin', fixtures)));
    expect(Number(state.numberOfMarkets)).toBeGreaterThanOrEqual(3);
    expect(Number(state.numberOfSpotMarkets)).toBeGreaterThan(0);

    const expectedPerps = new Map(MainnetPerpMarkets.filter((market) => [0, 1, 2].includes(market.marketIndex)).map((market) => [market.marketIndex, market]));
    for (const file of readdirSync(fixtures).filter((name) => name.startsWith('perpMarket-'))) {
      const address = file.slice('perpMarket-'.length, -'.bin'.length);
      const market = client.program.coder.accounts.decode<PerpMarketAccount>('perpMarket', readFileSync(new URL(file, fixtures)));
      const expected = expectedPerps.get(market.marketIndex);
      expect(expected, file).toBeDefined();
      expect(market.pubkey.toBase58(), file).toBe(address);
      expect(market.pubkey.toBase58(), file).toBe(PublicKey.findProgramAddressSync([Buffer.from('perp_market'), Buffer.from([market.marketIndex & 0xff, (market.marketIndex >> 8) & 0xff])], program)[0].toBase58());
      expect(market.oracle.toBase58(), file).toBe(expected?.oracle.toBase58());
      expect(market.oracleSource, file).toEqual(expected?.oracleSource);
      expect(market.quoteSpotMarketIndex, file).toBe(0);
    }

    const spot = client.program.coder.accounts.decode<SpotMarketAccount>('spotMarket', readFileSync(new URL('spotMarket-2QpHj5vzgCdWaGM2KSoGtYJWeSkx24cMyzUDHDrucvRc.bin', fixtures)));
    expect(spot.marketIndex).toBe(0);
    expect(spot.mint.toBase58()).toBe(MainnetSpotMarkets[0].mint.toBase58());
    expect(spot.mint.toBase58()).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
    expect(Buffer.from(spot.name).toString().trim()).toBe('USDT');

    for (const file of readdirSync(fixtures).filter((name) => name.startsWith('pythLazerOracle-'))) {
      const oracle = client.program.coder.accounts.decode<{ price: { gt: (value: number) => boolean }; postedSlot: { gt: (value: number) => boolean } }>('pythLazerOracle', readFileSync(new URL(file, fixtures)));
      expect(oracle.price.gt(0), file).toBe(true);
      expect(oracle.postedSlot.gt(0), file).toBe(true);
    }
    loader.stopPolling();
  });

  it('keeps the request-owned loader available without starting a polling interval', () => {
    const { loader } = makeClient();
    const snapshotLoader = new SnapshotAccountLoader({} as Connection, new Set());
    expect(loader.intervalId).toBeUndefined();
    expect(snapshotLoader.intervalId).toBeUndefined();
    snapshotLoader.dispose();
    loader.stopPolling();
  });

  it('ignores a lower-slot wrong-owner response after a verified account', async () => {
    const newer = { data: Buffer.from('newer'), owner: program };
    const older = { data: Buffer.from('older'), owner: PublicKey.default };
    const callback = vi.fn();
    const rpc = vi.fn().mockResolvedValueOnce({ context: { slot: 20 }, value: [newer] }).mockResolvedValueOnce({ context: { slot: 19 }, value: [older] });
    const loader = new SnapshotAccountLoader({ getMultipleAccountsInfoAndContext: rpc } as unknown as Connection, new Set([authority.toBase58()]));
    await loader.addAccount(authority, callback);
    await loader.load(); await expect(loader.load()).resolves.toBeUndefined();
    expect(loader.getBufferAndSlot(authority)).toMatchObject({ slot: 20, buffer: newer.data });
    expect(callback).toHaveBeenCalledTimes(1);
    loader.dispose();
  });
});
