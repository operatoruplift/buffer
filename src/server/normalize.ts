import Decimal from 'decimal.js';
import {
  BASE_PRECISION, PRICE_PRECISION, QUOTE_PRECISION, QUOTE_SPOT_MARKET_INDEX, BN,
  MainnetPerpMarkets, MainnetSpotMarkets, PositionFlag, SpotBalanceType, decodeName, isVariant,
  positionIsAvailable, isSpotPositionAvailable, getTokenAmount, isOracleValid,
  type UserAccount, type PerpMarketAccount, type SpotMarketAccount,
  type OraclePriceData, type StateAccount, type User, type DataAndSlot,
} from '@drift-labs/sdk';
import type { Metric, OracleObservation, Snapshot, Subaccount } from '../lib/types';

const Money = Decimal.clone({ precision: 80 });
export const APP_ORACLE_MAX_SLOT_LAG = 150;
export const LIVE_SNAPSHOT_TTL_MS = 120_000;
export const normalizeRaw = (raw: BN, precision: BN): string => new Money(raw.toString()).div(precision.toString()).toFixed();
const name = (bytes: number[], fallback: string): string => decodeName(bytes).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64) || fallback;
export const subaccountInfo = (account: UserAccount, address: string | null): Subaccount => ({ id: account.subAccountId, name: name(account.name, `Subaccount ${account.subAccountId}`), address });

export function requiredMarkets(account: UserAccount): { perp: number[]; spot: number[] } {
  const perp = new Set(account.perpPositions.filter((p) => !positionIsAvailable(p) || !p.openBids.isZero() || !p.openAsks.isZero()).map((p) => p.marketIndex));
  const spot = new Set(account.spotPositions.filter((p) => !isSpotPositionAvailable(p) || !p.openBids.isZero() || !p.openAsks.isZero()).map((p) => p.marketIndex));
  spot.add(QUOTE_SPOT_MARKET_INDEX);
  for (const order of account.orders.filter((o) => isVariant(o.status, 'open'))) {
    if (isVariant(order.marketType, 'perp')) perp.add(order.marketIndex);
    else if (isVariant(order.marketType, 'spot')) spot.add(order.marketIndex);
  }
  return { perp: [...perp].sort((a, b) => a - b), spot: [...spot].sort((a, b) => a - b) };
}

export interface ReadData {
  account: UserAccount;
  authority: string;
  address: string;
  accountSlot: number;
  observedSlot: number;
  state?: StateAccount;
  perps: Map<number, PerpMarketAccount>;
  spots: Map<number, SpotMarketAccount>;
  perpOracles: Map<number, DataAndSlot<OraclePriceData>>;
  spotOracles: Map<number, DataAndSlot<OraclePriceData>>;
  // The SDK may use an MM oracle for baseline valuation. Validate those separately.
  valuationOracles: Map<number, OraclePriceData>;
  user: Pick<User, 'getNetUsdValue' | 'getUnrealizedPNL' | 'getHealth'>;
  retrievedAt: string;
}

function safeSlot(value?: BN): number | null {
  if (!value || value.isNeg() || value.gt(new BN(Number.MAX_SAFE_INTEGER.toString()))) return null;
  return Number(value.toString());
}

export function observeOracle(data: DataAndSlot<OraclePriceData> | undefined, observedSlot: number, state?: StateAccount, perp?: PerpMarketAccount, spot?: SpotMarketAccount): OracleObservation {
  const slot = safeSlot(data?.data.slot);
  const observation: OracleObservation = { slot, readSlot: data?.slot ?? null, valid: false, reason: null };
  const invalid = (reason: string) => ({ ...observation, reason });
  if (!data) return invalid('Oracle data unavailable.');
  const oracle = data.data;
  if (oracle.price.lte(new BN(0))) return invalid('Oracle price is nonpositive.');
  if (!oracle.hasSufficientNumberOfDataPoints) return invalid('Oracle has insufficient data points.');
  const isFixedQuote = Boolean(spot && isVariant(spot.oracleSource, 'quoteAsset'));
  if (!isFixedQuote && (slot === null || slot > observedSlot || observedSlot - slot > APP_ORACLE_MAX_SLOT_LAG)) return invalid('Oracle is outside Buffer’s 150-slot freshness limit.');
  if (!state) return invalid('Protocol oracle guard rails unavailable.');
  try {
    if (perp && !isOracleValid(perp, oracle, state.oracleGuardRails, observedSlot)) return invalid('Oracle fails the SDK AMM validity check.');
    if (spot && !isFixedQuote) {
      const guards = state.oracleGuardRails.validity;
      const lag = new BN(observedSlot).sub(oracle.slot);
      if (lag.gt(new BN(guards.slotsBeforeStaleForMargin))) return invalid('Spot oracle is stale for protocol margin valuation.');
      const confidenceRatio = new Money(oracle.confidence.toString()).div(oracle.price.toString());
      // Conservative application cap for spot confidence; SDK AMM helper only accepts perp markets.
      if (confidenceRatio.gt('0.01')) return invalid('Spot oracle confidence exceeds Buffer’s 1% limit.');
      const twap = spot.historicalOracleData.lastOraclePriceTwap;
      if (twap.lte(new BN(0))) return invalid('Spot oracle TWAP unavailable.');
      const ratio = Money.max(oracle.price.toString(), twap.toString()).div(Money.min(oracle.price.toString(), twap.toString()));
      if (ratio.gt(guards.tooVolatileRatio.toString())) return invalid('Spot oracle exceeds protocol volatility guard rails.');
    }
  } catch { return invalid('Oracle validity could not be established.'); }
  return { ...observation, valid: true };
}

function quoteIdentity(market: SpotMarketAccount | undefined): string | null {
  if (!market) return null;
  const config = MainnetSpotMarkets.find((c) => c.marketIndex === market.marketIndex && c.mint.equals(market.mint));
  if (!config || name(market.name, '') !== config.symbol) return null;
  const ambiguous = MainnetSpotMarkets.some((c) => c.symbol === config.symbol && !c.mint.equals(config.mint));
  return ambiguous ? `${config.symbol} (${config.mint.toBase58()})` : config.symbol;
}

export function baselineCoverageIssues(input: ReadData): string[] {
  const issues: string[] = [];
  const required = requiredMarkets(input.account);
  if (!input.state) issues.push('Protocol state was not loaded.');
  if (input.account.poolId !== 0) issues.push('Nondefault account pools are not supported for baseline valuation.');
  for (const index of required.perp) {
    const market = input.perps.get(index);
    if (!market) { issues.push(`Perp market ${index} was not loaded.`); continue; }
    if (!isVariant(market.contractType, 'perpetual')) issues.push(`Perp market ${index} has an unsupported contract type.`);
    if (!isVariant(market.status, 'active')) issues.push(`Perp market ${index} is not active.`);
    if (!quoteIdentity(input.spots.get(market.quoteSpotMarketIndex))) issues.push(`Quote identity for perp ${index} could not be verified.`);
    if (!required.spot.includes(market.quoteSpotMarketIndex)) required.spot.push(market.quoteSpotMarketIndex);
    const oracle = observeOracle(input.perpOracles.get(index), input.observedSlot, input.state, market);
    if (!oracle.valid) issues.push(`Perp ${index}: ${oracle.reason}`);
    const valuation = input.valuationOracles.get(index);
    const validity = observeOracle(valuation ? { data: valuation, slot: input.perpOracles.get(index)?.slot ?? input.observedSlot } : undefined, input.observedSlot, input.state, market);
    if (!validity.valid) issues.push(`Perp ${index} SDK valuation oracle: ${validity.reason}`);
  }
  for (const index of required.spot) {
    const market = input.spots.get(index);
    if (!market) { issues.push(`Spot market ${index} was not loaded.`); continue; }
    if (!isVariant(market.status, 'active')) issues.push(`Spot market ${index} is not active.`);
    const observation = observeOracle(input.spotOracles.get(index), input.observedSlot, input.state, undefined, market);
    if (!observation.valid) issues.push(`Spot ${index}: ${observation.reason}`);
  }
  for (const position of input.account.perpPositions) {
    if (!position.lpShares.isZero()) issues.push(`Perp ${position.marketIndex} has LP exposure; baseline valuation is unavailable.`);
    if (position.positionFlag & ~(PositionFlag.IsolatedPosition | PositionFlag.BeingLiquidated | PositionFlag.Bankruptcy)) issues.push(`Perp ${position.marketIndex} has unknown position flags.`);
  }
  if (input.account.orders.some((o) => isVariant(o.status, 'open') && !isVariant(o.marketType, 'perp') && !isVariant(o.marketType, 'spot'))) issues.push('An open order has an unknown market type.');
  return [...new Set(issues)];
}

export function normalizeSnapshot(input: ReadData): Snapshot {
  const { account, perps, spots } = input;
  const issues = baselineCoverageIssues(input);
  const positions = account.perpPositions.filter((p) => !positionIsAvailable(p) || !p.openBids.isZero() || !p.openAsks.isZero()).map((position) => {
    const market = perps.get(position.marketIndex);
    const config = MainnetPerpMarkets.find((c) => c.marketIndex === position.marketIndex);
    const oracle = observeOracle(input.perpOracles.get(position.marketIndex), input.observedSlot, input.state, market);
    const quote = market ? quoteIdentity(spots.get(market.quoteSpotMarketIndex)) : null;
    const marketName = market ? name(market.name, `Perp ${position.marketIndex}`) : `Perp ${position.marketIndex}`;
    const identity = Boolean(market && config && config.symbol === marketName && config.oracle.equals(market.amm.oracle) && JSON.stringify(config.oracleSource) === JSON.stringify(market.amm.oracleSource));
    let exclusionReason: string | null = null;
    if (!market) exclusionReason = 'Market data unavailable.';
    else if (!isVariant(market.contractType, 'perpetual')) exclusionReason = 'Unknown or nonlinear contract type.';
    else if (!position.lpShares.isZero()) exclusionReason = 'LP exposure is outside this fixed-size model.';
    else if (position.positionFlag & ~(PositionFlag.IsolatedPosition | PositionFlag.BeingLiquidated | PositionFlag.Bankruptcy)) exclusionReason = 'Position flags could not be decoded reliably.';
    else if (position.baseAssetAmount.isZero()) exclusionReason = 'Zero base size; other position state remains in baseline coverage.';
    else if (!isVariant(market.status, 'active')) exclusionReason = 'Market is not active.';
    else if (!identity) exclusionReason = 'Market identity does not match the pinned mainnet configuration.';
    else if (!config || !['SOL', 'BTC', 'ETH'].includes(config.baseAssetSymbol)) exclusionReason = 'Only verified SOL, BTC, and ETH linear perpetuals are modeled.';
    else if (!quote) exclusionReason = 'Quote currency identity could not be verified.';
    else if (!oracle.valid) exclusionReason = oracle.reason;
    const rawOracle = input.perpOracles.get(position.marketIndex)?.data;
    const price = oracle.valid && rawOracle ? normalizeRaw(rawOracle.price, PRICE_PRECISION) : null;
    const size = normalizeRaw(position.baseAssetAmount, BASE_PRECISION);
    return { id: `perp-${position.marketIndex}`, marketIndex: position.marketIndex, market: marketName,
      asset: identity && config ? config.baseAssetSymbol : marketName, size, price, quote: quote ?? 'Unverified quote',
      notional: price ? new Money(size).mul(price).abs().toFixed() : null, modeled: exclusionReason === null,
      exclusionReason, isolated: Boolean(position.positionFlag & PositionFlag.IsolatedPosition), oracle };
  });
  let inventoryAvailable = true;
  const spotInventory = account.spotPositions.filter((p) => !p.scaledBalance.isZero()).map((position) => {
    const market = spots.get(position.marketIndex);
    let amount: string | null = null;
    if (market && Number.isInteger(market.decimals) && market.decimals >= 0 && market.decimals <= 18) {
      try { amount = normalizeRaw(getTokenAmount(position.scaledBalance, market, position.balanceType), new BN(10).pow(new BN(market.decimals))); }
      catch { inventoryAvailable = false; }
    } else inventoryAvailable = false;
    return { market: market ? name(market.name, `Spot ${position.marketIndex}`) : `Spot ${position.marketIndex}`, kind: isVariant(position.balanceType, 'borrow') ? 'Debt' as const : 'Collateral' as const, amount, ...(amount === null ? { explanation: 'Balance amount unavailable: required market data did not load.' } : {}) };
  });
  for (const position of account.perpPositions.filter((p) => !p.isolatedPositionScaledBalance.isZero())) {
    const perp = perps.get(position.marketIndex);
    const quote = perp ? spots.get(perp.quoteSpotMarketIndex) : undefined;
    let amount: string | null = null;
    if (quote && Number.isInteger(quote.decimals) && quote.decimals >= 0 && quote.decimals <= 18) {
      try { amount = normalizeRaw(getTokenAmount(position.isolatedPositionScaledBalance, quote, SpotBalanceType.DEPOSIT), new BN(10).pow(new BN(quote.decimals))); }
      catch { inventoryAvailable = false; }
    } else inventoryAvailable = false;
    spotInventory.push({ market: `${quote ? name(quote.name, 'Quote') : 'Quote'} · isolated ${perp ? name(perp.name, `perp ${position.marketIndex}`) : `perp ${position.marketIndex}`}`, kind: 'Collateral', amount,
      explanation: amount === null ? 'Isolated quote collateral amount unavailable: required quote market data did not load.' : 'Quote collateral allocated to this isolated position; excluded from the price-shock calculation.' });
  }
  const orderCounts = new Map<string, number>();
  for (const order of account.orders.filter((o) => isVariant(o.status, 'open'))) {
    const market = isVariant(order.marketType, 'perp') ? perps.get(order.marketIndex) : isVariant(order.marketType, 'spot') ? spots.get(order.marketIndex) : undefined;
    const label = market ? `${name(market.name, `Market ${order.marketIndex}`)} (${isVariant(order.marketType, 'perp') ? 'perp' : 'spot'})` : `Unknown market ${order.marketIndex}`;
    if (!market) inventoryAvailable = false;
    orderCounts.set(label, (orderCounts.get(label) ?? 0) + 1);
  }
  const metrics: Metric[] = [
    { label: 'Account net USD value', value: null, unit: 'USD', explanation: 'SDK net spot value + unrealized perp P&L including accrued funding + isolated deposits. Current baseline only.' },
    { label: 'Unrealized perp P&L', value: null, unit: 'USD', explanation: 'SDK unrealized P&L including accrued funding, across the selected subaccount. Current baseline only.' },
    { label: 'Cross-margin health', value: null, unit: '%', explanation: 'SDK maintenance-margin health for the cross-margin account. Not a forecast or a safety guarantee.' },
  ];
  if (issues.length) {
    for (const metric of metrics) metric.explanation = `Unavailable: ${issues.join(' ')}`;
  } else {
    const calculate = (index: number, compute: () => string) => {
      try { metrics[index].value = compute(); }
      catch { metrics[index].explanation = 'Unavailable: the official SDK could not value this account structure.'; }
    };
    calculate(0, () => normalizeRaw(input.user.getNetUsdValue(), QUOTE_PRECISION));
    calculate(1, () => normalizeRaw(input.user.getUnrealizedPNL(true), QUOTE_PRECISION));
    if (positions.some((p) => p.isolated)) metrics[2].explanation = 'Unavailable for accounts with isolated positions. Cross-margin health would not describe those positions.';
    else calculate(2, () => { const value = input.user.getHealth(); if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('Invalid health'); return String(value); });
  }
  const warnings = [...issues];
  if (positions.some((p) => p.isolated)) warnings.push('Isolated positions are shown individually; no general account-health claim is made.');
  if (!inventoryAvailable) warnings.push('Some spot or open-order inventory data is unavailable.');
  return { source: 'live', network: 'mainnet-beta', authority: input.authority, sampleName: null,
    subaccount: subaccountInfo(account, input.address), retrievedAt: input.retrievedAt,
    expiresAt: new Date(Date.parse(input.retrievedAt) + LIVE_SNAPSHOT_TTL_MS).toISOString(),
    accountSlot: input.accountSlot, observedSlot: input.observedSlot, metrics, positions, spots: spotInventory,
    orders: [...orderCounts].map(([market, count]) => ({ market, count })), inventoryAvailable, warnings,
    provenance: ['Solana mainnet-beta · confirmed commitment · Drift SDK 2.163.0-beta.13.',
      'Separate account, market, and oracle reads are not an atomic same-slot snapshot.',
      'Perp oracle prices pass the SDK AMM validity helper and Buffer’s 150-slot lag limit; spot valuation adds a 1% confidence cap. These are conservative read rules, not liquidation rules.',
      'Snapshots expire after 120 seconds. The scenario uses the external oracle; SDK baseline valuation may use its validated MM oracle.',
      'SOL/BTC/ETH identities are checked against pinned mainnet configuration, decoded metadata, oracle address/source, and the fixed Drift program. Quote currencies are checked by quote-market index, name, and mint.'] };
}
