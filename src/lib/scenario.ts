import Decimal from 'decimal.js';
import type { Position, Scenario, Snapshot } from './types';
import { hasConfiguredPerpIdentity } from './perp-markets';

/** Additional app freshness limit, not a protocol oracle or liquidation rule. */
export const FRESHNESS_SECONDS = 120;

export const ASSUMPTIONS = [
  'Position sizes are fixed; the selected percentage move applies together to all eligible, verified linear perpetual oracle prices.',
  'Price P&L change = signed base quantity × frozen baseline oracle price × shock fraction.',
  'Excludes collateral-price changes, future fills, funding, fees, borrowing interest, and liquidation effects.',
  'This is a perpetual price effect, not hypothetical account equity, health, liquidation risk, or a trading recommendation.',
  'Only contributions with the same verified quote currency are added. Different quote currencies have separate totals.',
  'Unsupported contracts, LP exposure, undecodable positions, and missing, nonpositive, or invalid oracle prices are excluded with a reason.',
  `Live calculations expire ${FRESHNESS_SECONDS} seconds after retrieval, or earlier when the provider marks them expired. This is a conservative app rule, not a protocol liquidation rule.`,
  'Account, market, and oracle reads are not atomic. RPC providers report observed slots; public API providers report available price timestamps without claiming on-chain slot verification.',
  'Sample accounts, metrics, and prices are deterministic fixtures; they are not live on-chain observations.',
];

// Providers normalize values to plain decimal strings before crossing the boundary.
const DECIMAL_STRING = /^[+-]?\d+(?:\.\d+)?$/;

function isDecimal(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_STRING.test(value);
}

function unavailableReason(snapshot: Snapshot, now: number): string | null {
  if (snapshot.source === 'sample') return null;
  if (snapshot.protocol?.id === 'drift') return 'Legacy Drift is paused. Price scenarios are unavailable for this deployment.';
  const retrievedAt = Date.parse(snapshot.retrievedAt);
  const providerExpiry = snapshot.expiresAt === null ? Infinity : Date.parse(snapshot.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(retrievedAt) || Number.isNaN(providerExpiry)) {
    return 'Snapshot freshness is unavailable. Refresh the live account before calculating.';
  }
  const expiresAt = Math.min(retrievedAt + FRESHNESS_SECONDS * 1_000, providerExpiry);
  if (now >= expiresAt) return 'This live snapshot has expired. Refresh the account to calculate a new scenario.';
  return null;
}

function positionExclusion(position: Position, snapshot: Snapshot, D: typeof Decimal): string | null {
  if (position.exclusionReason) return position.exclusionReason;
  if (!position.modeled) return position.exclusionReason || 'This perpetual position is unsupported by the price-shock model.';
  if (!hasConfiguredPerpIdentity(position, snapshot)) return 'The perpetual market identity does not match the configured market registry.';
  if (!isDecimal(position.size)) return 'Signed position quantity could not be decoded reliably.';
  if (new D(position.size).isZero()) return 'Zero base quantity. Any residual protocol state remains outside the price-shock model.';
  if (!position.quote.trim()) return 'The quote currency could not be verified.';
  if (!position.oracle.valid) return position.oracle.reason || 'Oracle validity could not be verified.';
  if (!isDecimal(position.price)) return 'A valid baseline oracle price is unavailable.';
  if (new D(position.price).lessThanOrEqualTo(0)) return 'The baseline oracle price must be greater than zero.';
  return null;
}

export function calculateScenario(snapshot: Snapshot, shockPercent: number, now = Date.now()): Scenario {
  const scenario: Scenario = {
    shockPercent,
    included: [],
    excluded: [],
    totals: [],
    eligible: 0,
    totalPositions: snapshot.positions.length,
    disabledReason: null,
  };
  if (!Number.isInteger(shockPercent) || shockPercent < -20 || shockPercent > 20) {
    scenario.disabledReason = 'Choose a whole-number price move between −20% and +20%.';
  } else {
    scenario.disabledReason = unavailableReason(snapshot, now);
  }

  // Sum of input lengths also covers very different integer/fractional scales.
  // Decimal precision is local to this calculation; no global rounding state is changed.
  const precision = Math.max(80, snapshot.positions.reduce((digits, position) =>
    digits + position.size.length + (position.price?.length ?? 0), 32));
  const D = Decimal.clone({ precision, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -1_000_000, toExpPos: 1_000_000 });
  const totals = new Map<string, Decimal>();
  const shock = scenario.disabledReason ? null : new D(shockPercent.toString()).div(100);

  for (const position of snapshot.positions) {
    const reason = positionExclusion(position, snapshot, D);
    if (reason || scenario.disabledReason) {
      scenario.excluded.push({ id: position.id, market: position.market, reason: reason || scenario.disabledReason! });
      continue;
    }
    const baselinePrice = new D(position.price!);
    const size = new D(position.size);
    const delta = size.times(baselinePrice).times(shock!);
    scenario.included.push({
      id: position.id,
      market: position.market,
      quote: position.quote,
      size: size.toFixed(),
      baselinePrice: baselinePrice.toFixed(),
      hypotheticalPrice: baselinePrice.times(new D(1).plus(shock!)).toFixed(),
      delta: delta.isZero() ? '0' : delta.toFixed(),
    });
    totals.set(position.quote, (totals.get(position.quote) || new D(0)).plus(delta));
  }
  scenario.eligible = scenario.included.length;
  scenario.totals = Array.from(totals, ([quote, delta]) => ({ quote, delta: delta.isZero() ? '0' : delta.toFixed() }));
  if (!scenario.disabledReason && scenario.eligible === 0) {
    scenario.disabledReason = snapshot.positions.length === 0
      ? 'There are no open perpetual positions to model.'
      : 'No perpetual positions have eligible price data. Review the exclusions below.';
  }
  return scenario;
}
