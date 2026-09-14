import Decimal from 'decimal.js';
import { CONFIGURED_PERP_MARKETS } from '../lib/perp-markets';
import { PROTOCOLS } from '../lib/protocols';
import type { OracleObservation, Position, Snapshot, SpotExposure } from '../lib/types';
import { ProviderFailure } from './boundary';

export const PACIFICA_MAX_AGE_MS = 120_000;
export const PACIFICA_FUTURE_TOLERANCE_MS = 10_000;
const Money = Decimal.clone({ precision: 256 });
type RecordValue = Record<string, unknown>;
const registry = CONFIGURED_PERP_MARKETS.pacifica;

function invalid(message = 'Pacifica returned incomplete or invalid account data. Please refresh.'): never {
  throw new ProviderFailure('INVALID_DATA', message, 502, true);
}

function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as RecordValue;
}

function list(value: unknown, limit = 512): unknown[] {
  if (!Array.isArray(value) || value.length > limit) invalid();
  return value;
}

function symbol(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(value)) invalid();
  return value;
}

function decimal(value: unknown, sign: 'any' | 'positive' | 'nonnegative' = 'any'): string {
  if (typeof value !== 'string' || value.length > 100 || !/^-?\d+(?:\.\d+)?$/.test(value)) invalid();
  const parsed = new Money(value);
  if (!parsed.isFinite() || (sign === 'positive' && parsed.lte(0)) || (sign === 'nonnegative' && parsed.lt(0))) invalid();
  return parsed.toFixed();
}

function count(value: unknown, limit = 1_000_000): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > limit) invalid();
  return value;
}

function timestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value < 4_102_444_800_000 ? value : null;
}

function currentTimestamp(value: unknown, now: number): number {
  const observedAt = timestamp(value);
  if (observedAt === null || observedAt > now + PACIFICA_FUTURE_TOLERANCE_MS || now - observedAt >= PACIFICA_MAX_AGE_MS) {
    throw new ProviderFailure('STALE_DATA', 'Pacifica account data is outside Buffer’s freshness limit. Please refresh.', 502, true);
  }
  return observedAt;
}

function keyed(values: unknown): Map<string, RecordValue> {
  const result = new Map<string, RecordValue>();
  for (const value of list(values)) {
    const row = object(value);
    const key = symbol(row.symbol);
    if (result.has(key)) invalid('Pacifica returned duplicate market identities. Please refresh.');
    result.set(key, row);
  }
  return result;
}

export function observePacificaPrice(value: RecordValue | undefined, now: number): OracleObservation {
  const time = timestamp(value?.timestamp);
  const observation: OracleObservation = { slot: null, readSlot: null, observedAt: time === null ? null : new Date(time).toISOString(), valid: false, reason: null };
  if (!value) return { ...observation, reason: 'Pacifica oracle price is unavailable.' };
  try { decimal(value.oracle, 'positive'); }
  catch { return { ...observation, reason: 'Pacifica oracle price is missing, invalid, or nonpositive.' }; }
  if (time === null || time > now + PACIFICA_FUTURE_TOLERANCE_MS || now - time >= PACIFICA_MAX_AGE_MS) {
    return { ...observation, reason: 'Pacifica price timestamp is outside Buffer’s 120-second freshness limit or clock-skew tolerance.' };
  }
  return { ...observation, valid: true };
}

export interface PacificaReadData {
  authority: string;
  account: unknown;
  positions: unknown;
  info: unknown;
  prices: unknown;
  loan: unknown;
  startedAt: string;
  retrievedAt: string;
}

/** Account updated_at is a response freshness signal. Position updated_at is the
 * last position change and must never be used to refresh or expire an oracle. */
export function validatePacificaAccount(value: unknown, now: number): RecordValue {
  const account = object(value);
  currentTimestamp(account.updated_at, now);
  count(account.positions_count, 512);
  count(account.orders_count);
  count(account.stop_orders_count);
  decimal(account.balance);
  decimal(account.account_equity);
  decimal(account.total_margin_used, 'nonnegative');
  list(account.spot_balances, 256);
  return account;
}

export function normalizePacificaSnapshot(input: PacificaReadData): Snapshot {
  const now = Date.parse(input.retrievedAt);
  const started = Date.parse(input.startedAt);
  if (!Number.isFinite(now) || !Number.isFinite(started) || started > now || now - started >= PACIFICA_MAX_AGE_MS) invalid();
  const account = validatePacificaAccount(input.account, now);
  const loan = object(input.loan);
  const accountAt = currentTimestamp(account.updated_at, now);
  const loanAt = currentTimestamp(loan.updated_at, now);
  const borrowed = decimal(loan.borrowed, 'nonnegative');
  const interest = decimal(loan.pending_interest, 'nonnegative');
  const info = keyed(input.info);
  const prices = keyed(input.prices);
  const rawPositions = list(input.positions);
  if (rawPositions.length !== account.positions_count) {
    throw new ProviderFailure('INCOMPLETE_DATA', 'Pacifica’s account and position counts changed between reads. Please refresh.', 502, true);
  }
  const seenPositions = new Set<string>();
  const positions: Position[] = rawPositions.map((raw) => {
    const row = object(raw);
    const asset = symbol(row.symbol);
    if (seenPositions.has(asset)) invalid('Pacifica returned duplicate positions for one market. Please refresh.');
    seenPositions.add(asset);
    const amount = decimal(row.amount, 'positive');
    if ((row.side !== 'bid' && row.side !== 'ask') || typeof row.isolated !== 'boolean') invalid('Pacifica position direction or margin mode could not be verified.');
    const size = new Money(amount).mul(row.side === 'ask' ? -1 : 1).toFixed();
    const config = registry.find((market) => market.asset === asset);
    const market = info.get(asset);
    const priceData = prices.get(asset);
    const oracle = observePacificaPrice(priceData, now);
    let exclusionReason: string | null = null;
    if (!config) exclusionReason = 'This market is outside Buffer’s pinned Pacifica perpetual registry.';
    else if (!market || market.symbol !== config.asset || market.base_asset !== config.asset) exclusionReason = 'Pacifica market identity does not match the pinned configuration.';
    else if (market.instrument_type !== 'perpetual') exclusionReason = 'Only Pacifica linear perpetual contracts are modeled.';
    else if (!oracle.valid) exclusionReason = oracle.reason;
    const price = oracle.valid ? decimal(priceData!.oracle, 'positive') : null;
    return { id: `pacifica-${asset}`, marketIndex: config?.marketIndex ?? 65_535, market: config?.market ?? `${asset}-PERP`, asset,
      size, price, quote: 'USD', notional: price === null ? null : new Money(size).mul(price).abs().toFixed(),
      modeled: exclusionReason === null, exclusionReason, isolated: row.isolated, oracle };
  });

  const balance = decimal(account.balance);
  const spots: SpotExposure[] = new Money(balance).isZero() ? [] : [{ market: 'USD account balance', kind: new Money(balance).lt(0) ? 'Debt' : 'Collateral', amount: new Money(balance).abs().toFixed(), explanation: 'Pacifica’s reported cash balance before settlement, in API USD units. USDC is the margin asset; this is outside the price scenario.' }];
  const seenSpots = new Set<string>();
  for (const raw of list(account.spot_balances, 256)) {
    const row = object(raw);
    const asset = symbol(row.symbol);
    if (seenSpots.has(asset)) invalid();
    seenSpots.add(asset);
    const amount = new Money(decimal(row.amount));
    if (!amount.isZero()) spots.push({ market: asset, kind: amount.lt(0) ? 'Debt' : 'Collateral', amount: amount.abs().toFixed(), explanation: 'Spot token amount reported by Pacifica. Collateral prices and haircuts are outside the scenario.' });
  }
  for (const raw of rawPositions) {
    const row = object(raw);
    if (row.isolated) {
      const margin = decimal(row.margin, 'nonnegative');
      if (!new Money(margin).isZero()) spots.push({ market: `USD isolated margin · ${symbol(row.symbol)}-PERP`, kind: 'Collateral', amount: margin, explanation: 'Margin allocated to this isolated position, in Pacifica’s API USD units. Not an additional scenario contribution.' });
    }
  }
  if (!new Money(borrowed).isZero()) spots.push({ market: 'USD loan principal', kind: 'Debt', amount: borrowed, explanation: 'Loan principal reported by Pacifica. May overlap the cash balance; inventory rows must not be summed.' });
  if (!new Money(interest).isZero()) spots.push({ market: 'USD accrued loan interest', kind: 'Debt', amount: interest, explanation: 'Interest already accrued, reported by Pacifica. Future interest is excluded from the price scenario.' });
  const orders = [];
  if (account.orders_count) orders.push({ market: 'All markets · open orders', count: count(account.orders_count) });
  if (account.stop_orders_count) orders.push({ market: 'All markets · stop orders', count: count(account.stop_orders_count) });
  const expiryTimes = [started, accountAt, loanAt, ...positions.filter((position) => position.modeled).map((position) => Date.parse(position.oracle.observedAt!))];
  const warnings = ['Pacifica API observations are provider-reported; Buffer does not independently verify their on-chain slots or oracle confidence.',
    'Open-order counts are account-wide and exclude possible future fills; inventory amounts are context and must not be added to the scenario.'];
  if (positions.some((position) => !position.modeled)) warnings.push('Some positions are excluded because their market identity or price data could not be verified.');
  if (positions.some((position) => position.isolated)) warnings.push('Isolated positions are modeled individually. No account-health or liquidation forecast is calculated.');
  return { protocol: PROTOCOLS.pacifica, source: 'live', network: 'mainnet-beta', authority: input.authority, sampleName: null,
    subaccount: { id: 0, name: 'Wallet account', address: input.authority }, retrievedAt: input.retrievedAt,
    expiresAt: new Date(Math.min(...expiryTimes) + PACIFICA_MAX_AGE_MS).toISOString(), accountSlot: null, observedSlot: null,
    metrics: [
      { label: 'Account equity', value: decimal(account.account_equity), unit: 'USD', explanation: 'Current equity reported by Pacifica: balance, unrealized P&L, isolated margin, and raw spot market value. API USD valuation, not independently reconstructed.' },
      { label: 'Account balance', value: balance, unit: 'USD', explanation: 'Current balance before settlement, reported by Pacifica in USD units. USDC is the margin asset.' },
      { label: 'Margin in use', value: decimal(account.total_margin_used, 'nonnegative'), unit: 'USD', explanation: 'Current margin used for positions and orders, reported by Pacifica. Not health, available funds, or a safety guarantee.' },
    ], positions, spots, orders, inventoryAvailable: true, warnings,
    provenance: ['Pacifica public HTTPS API · https://api.pacifica.fi/api/v1 · public GET requests. No signing, private keys, or user-supplied endpoints.',
      'Only the supplied wallet account is read. Pacifica’s signed subaccount enumeration is not requested.',
      'Every modeled market matches Buffer’s pinned symbol/base-asset registry and live perpetual metadata. Registry indices are Buffer identifiers, not Pacifica market IDs.',
      'The scenario uses Pacifica’s reported oracle field in USD. Amounts are already market base units, including kBONK, kPEPE, and kSHIB; no thousand-fold conversion is applied.',
      'USDC margin and API USD prices are distinct conventions. Buffer does not model USDC peg changes, funding, fees, collateral prices, or interest.',
      'API price timestamps describe the price response, not independently verified oracle publication times. Some markets reference assets whose underlying cash markets may be closed.',
      'Account, position, market, price, and loan responses are separate, non-atomic reads. API observations have no claimed Solana slot or confidence interval.',
      'Oracle timestamps must be under 120 seconds old and no more than 10 seconds ahead of retrieval. Expiry is bounded by the oldest modeled price, account/loan timestamps, and request start.'],
  };
}
