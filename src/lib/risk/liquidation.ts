import Decimal from 'decimal.js';
import type { Position, RiskContext, Snapshot } from '../types';
import { FRESHNESS_SECONDS } from '../freshness.ts';

/**
 * A narrow, separately versioned liquidation estimate for one cross-margin
 * position at a time. It starts from the provider's current maintenance
 * collateral and requirement, holds every other price, funding, fee, fill and
 * open order where it is, and solves for the single oracle price at which that
 * position alone would bring collateral down to the requirement.
 *
 * Collateral(P) = C + s·(P − P0)          (unrealized P&L moves linearly)
 * Requirement(P) = M − |s|·r·P0 + |s|·r·P (only this position's term repriced)
 * Collateral(P) = Requirement(P)  ⇒  P = (M − C + s·P0 − |s|·r·P0) / (s − |s|·r)
 *
 * It is not the protocol's liquidation engine and it is not the SDK's linear
 * extrapolation; both are documented in RISK-CONTEXT.md.
 */
export const LIQUIDATION_MODEL_VERSION = 'cross-margin-hold-others-v1';
export const LIQUIDATION_ASSUMPTIONS = [
  'One position moves; every other oracle price, spot balance and open order stays exactly where the provider observed it.',
  'Starts from the provider’s current maintenance collateral and maintenance requirement, so its weights, buffers and open-order handling are inherited unchanged.',
  'Unrealized P&L moves linearly with the oracle price; the position’s own maintenance term is re-priced with its current maintenance margin ratio.',
  'Funding, fees, fills, collateral-price changes, oracle confidence and the protocol’s liquidation sequencing are outside the model.',
  `Estimates expire with the snapshot (${FRESHNESS_SECONDS} seconds, or earlier when the provider marks it expired).`,
];
export interface LiquidationEstimate {
  id: string;
  market: string;
  side: 'long' | 'short';
  size: string;
  baselinePrice: string;
  maintenanceMarginRatio: string;
  /** The single oracle price at which this position alone reaches the maintenance boundary, or null when no positive price does. */
  liquidationPrice: string | null;
  /** Percent move from the baseline to the liquidation price; negative means the price must fall. */
  distancePercent: string | null;
  reason: string | null;
  modelVersion: typeof LIQUIDATION_MODEL_VERSION;
}
export interface LiquidationReport {
  modelVersion: typeof LIQUIDATION_MODEL_VERSION;
  estimates: LiquidationEstimate[];
  excluded: { id: string; market: string; reason: string }[];
  disabledReason: string | null;
  assumptions: string[];
}
const DECIMAL = /^[+-]?\d+(?:\.\d+)?$/;
const isDecimal = (value: unknown): value is string => typeof value === 'string' && DECIMAL.test(value);
const D = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -1_000_000, toExpPos: 1_000_000 });

function contextProblem(snapshot: Snapshot, now: number): string | null {
  if (snapshot.source !== 'live') return 'Liquidation estimates need a live provider observation with verified maintenance context.';
  const retrievedAt = Date.parse(snapshot.retrievedAt);
  const providerExpiry = snapshot.expiresAt === null ? Infinity : Date.parse(snapshot.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(retrievedAt) || Number.isNaN(providerExpiry)) return 'Snapshot freshness is unavailable. Refresh the live account before estimating.';
  if (retrievedAt > now + 5_000) return 'Snapshot time is ahead of this device. Check the device clock and refresh before estimating.';
  if (now >= Math.min(retrievedAt + FRESHNESS_SECONDS * 1_000, providerExpiry)) return 'This live snapshot has expired. Refresh the account for a current estimate.';
  const risk: RiskContext | undefined = snapshot.risk;
  if (!risk || risk.scope !== 'cross-margin' || !['clear', 'maintenance', 'liquidating'].includes(risk.status)) return 'The provider did not supply a verified cross-margin maintenance context.';
  if (!isDecimal(risk.totalCollateral) || !isDecimal(risk.maintenanceRequirement)) return 'Maintenance collateral and requirement are unavailable for this account.';
  if (snapshot.positions.some((position) => position.isolated)) return 'Isolated positions keep separate collateral; the cross-margin estimate is withheld for this account.';
  return null;
}

function positionProblem(position: Position): string | null {
  if (!position.modeled) return position.exclusionReason || 'This position is outside the price model.';
  if (!isDecimal(position.size) || new D(position.size).isZero()) return 'Zero or undecodable base quantity.';
  if (!position.oracle.valid || !isDecimal(position.price) || new D(position.price).lte(0)) return position.oracle.reason || 'A valid baseline oracle price is unavailable.';
  if (!isDecimal(position.maintenanceMarginRatio) || new D(position.maintenanceMarginRatio).lte(0) || new D(position.maintenanceMarginRatio).gte(1)) return 'The market’s maintenance margin ratio was not verified for this position size.';
  return null;
}

/** Solves one position at a time; see the module note for the arithmetic. */
export function estimateLiquidationPrices(snapshot: Snapshot, now = Date.now()): LiquidationReport {
  const report: LiquidationReport = { modelVersion: LIQUIDATION_MODEL_VERSION, estimates: [], excluded: [], disabledReason: contextProblem(snapshot, now), assumptions: LIQUIDATION_ASSUMPTIONS };
  if (report.disabledReason) {
    report.excluded = snapshot.positions.map((position) => ({ id: position.id, market: position.market, reason: report.disabledReason! }));
    return report;
  }
  const collateral = new D(snapshot.risk!.totalCollateral!);
  const requirement = new D(snapshot.risk!.maintenanceRequirement!);
  for (const position of snapshot.positions) {
    const problem = positionProblem(position);
    if (problem) { report.excluded.push({ id: position.id, market: position.market, reason: problem }); continue; }
    const size = new D(position.size);
    const price = new D(position.price!);
    const ratio = new D(position.maintenanceMarginRatio!);
    const absolute = size.abs();
    const side = size.gt(0) ? 'long' : 'short';
    // P = (M − C + s·P0 − |s|·r·P0) / (s − |s|·r)
    const numerator = requirement.minus(collateral).plus(size.times(price)).minus(absolute.times(ratio).times(price));
    const denominator = size.minus(absolute.times(ratio));
    const estimate: LiquidationEstimate = { id: position.id, market: position.market, side, size: size.toFixed(), baselinePrice: price.toFixed(), maintenanceMarginRatio: ratio.toFixed(), liquidationPrice: null, distancePercent: null, reason: null, modelVersion: LIQUIDATION_MODEL_VERSION };
    if (denominator.isZero()) { estimate.reason = 'The maintenance ratio leaves no price sensitivity to solve for.'; report.estimates.push(estimate); continue; }
    const liquidation = numerator.div(denominator);
    if (liquidation.lte(0)) {
      estimate.reason = side === 'long' ? 'No positive price brings this long alone to the maintenance boundary; other exposure or collateral dominates.' : 'No positive price brings this short alone to the maintenance boundary.';
      report.estimates.push(estimate); continue;
    }
    estimate.liquidationPrice = liquidation.toFixed();
    estimate.distancePercent = liquidation.minus(price).div(price).times(100).toFixed();
    if ((side === 'long' && liquidation.gte(price)) || (side === 'short' && liquidation.lte(price))) estimate.reason = 'Collateral is already at or below the maintenance requirement at the current price; the boundary lies on the recovering side.';
    report.estimates.push(estimate);
  }
  return report;
}

/** Sanity check used by tests and the method dialog: at the estimated price, collateral equals the requirement. */
export function boundaryResidual(estimate: LiquidationEstimate, collateral: string, requirement: string): string | null {
  if (!estimate.liquidationPrice) return null;
  const size = new D(estimate.size);
  const price = new D(estimate.baselinePrice);
  const ratio = new D(estimate.maintenanceMarginRatio);
  const liquidation = new D(estimate.liquidationPrice);
  const collateralAt = new D(collateral).plus(size.times(liquidation.minus(price)));
  const requirementAt = new D(requirement).minus(size.abs().times(ratio).times(price)).plus(size.abs().times(ratio).times(liquidation));
  return collateralAt.minus(requirementAt).toFixed();
}
