import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { LIQUIDATION_MODEL_VERSION, boundaryResidual, estimateLiquidationPrices } from '../src/lib/risk/liquidation';
import { PROTOCOLS } from '../src/lib/protocols';
import type { Position, Snapshot } from '../src/lib/types';

const now = Date.parse('2026-09-28T10:00:00.000Z');
const position = (over: Partial<Position> = {}): Position => ({
  id: 'perp-0', marketIndex: 0, market: 'SOL-PERP', asset: 'SOL', size: '500', price: '40', quote: 'USDT', notional: '20000',
  modeled: true, exclusionReason: null, isolated: false, oracle: { slot: 1000, readSlot: 1001, valid: true, reason: null }, maintenanceMarginRatio: '0.05', ...over,
});
const risk = (totalCollateral: string, maintenanceRequirement: string, status: 'clear' | 'maintenance' = 'clear') => ({ scope: 'cross-margin' as const, totalCollateral, maintenanceRequirement, maintenanceHeadroom: new Decimal(totalCollateral).minus(maintenanceRequirement).toFixed(), canBeLiquidated: status === 'maintenance', status, explanation: 'fixture' });
const snapshot = (over: Partial<Snapshot> = {}, positions: Position[] = [position()]): Snapshot => ({
  protocol: PROTOCOLS.velocity, source: 'live', network: 'mainnet-beta', authority: '11111111111111111111111111111111', sampleName: null,
  subaccount: { id: 0, name: 'Main', address: null }, retrievedAt: new Date(now - 5_000).toISOString(), expiresAt: new Date(now + 115_000).toISOString(),
  accountSlot: 1001, observedSlot: 1002, metrics: [], positions, spots: [], orders: [], risk: risk('11000', '1000'),
  inventoryAvailable: true, warnings: [], provenance: [], ...over,
});
type Estimate = ReturnType<typeof estimateLiquidationPrices>['estimates'][number];
const residual = (estimate: Estimate, collateral = '11000', requirement = '1000') => new Decimal(boundaryResidual(estimate, collateral, requirement)!).abs().toNumber();

describe('cross-margin liquidation estimate, model v1', () => {
  it('solves the single price at which a long alone meets the maintenance boundary', () => {
    const report = estimateLiquidationPrices(snapshot(), now);
    expect(report.modelVersion).toBe(LIQUIDATION_MODEL_VERSION);
    expect(report.disabledReason).toBeNull();
    // (M − C + s·P0 − |s|·r·P0) / (s − |s|·r) = (1000 − 11000 + 20000 − 1000) / (500 − 25) = 9000 / 475.
    expect(report.estimates[0]).toMatchObject({ side: 'long', size: '500', baselinePrice: '40', maintenanceMarginRatio: '0.05', reason: null });
    expect(report.estimates[0].liquidationPrice).toMatch(/^18\.947368421052631578/);
    expect(report.estimates[0].distancePercent).toMatch(/^-52\.63157894736842105/);
    expect(residual(report.estimates[0])).toBeLessThan(1e-40);
  });
  it('solves the rising price at which a short alone meets the boundary', () => {
    const report = estimateLiquidationPrices(snapshot({}, [position({ size: '-500' })]), now);
    // (1000 − 11000 − 20000 − 1000) / (−500 − 25) = 59.047619…
    expect(report.estimates[0]).toMatchObject({ side: 'short' });
    expect(report.estimates[0].liquidationPrice).toMatch(/^59\.047619047619047619/);
    expect(report.estimates[0].distancePercent).toMatch(/^47\.619047619047619/);
    expect(residual(report.estimates[0])).toBeLessThan(1e-40);
  });
  it('holds every other position where it is and still lands exactly on the boundary for each target', () => {
    const positions = [position(), position({ id: 'perp-1', marketIndex: 1, market: 'BTC-PERP', asset: 'BTC', size: '-0.5', price: '60000', maintenanceMarginRatio: '0.03' })];
    // The requirement carries both terms: 500·0.05·40 = 1000 and 0.5·0.03·60000 = 900.
    const report = estimateLiquidationPrices(snapshot({ risk: risk('11000', '1900') }, positions), now);
    expect(report.estimates).toHaveLength(2);
    for (const estimate of report.estimates) expect(residual(estimate, '11000', '1900')).toBeLessThan(1e-40);
    expect(report.estimates[1]).toMatchObject({ side: 'short', market: 'BTC-PERP' });
    expect(new Decimal(report.estimates[1].liquidationPrice!).gt(60000)).toBe(true);
  });
  it('reports a boundary on the recovering side when collateral is already below the requirement', () => {
    const report = estimateLiquidationPrices(snapshot({ risk: risk('900', '1000', 'maintenance') }), now);
    expect(report.estimates[0].liquidationPrice).toMatch(/^40\.2105263157894736/);
    expect(report.estimates[0].reason).toMatch(/already at or below/);
  });
  it('states when no positive price reaches the boundary instead of inventing one', () => {
    const report = estimateLiquidationPrices(snapshot({ risk: risk('1000000000', '1000') }), now);
    expect(report.estimates[0]).toMatchObject({ liquidationPrice: null, distancePercent: null });
    expect(report.estimates[0].reason).toMatch(/No positive price/);
  });
  it.each([
    ['a preset snapshot', snapshot({ source: 'sample', network: 'fixture' }), /live provider observation/],
    ['an expired snapshot', snapshot({ retrievedAt: new Date(now - 130_000).toISOString(), expiresAt: null }), /expired/],
    ['a provider expiry in the past', snapshot({ expiresAt: new Date(now - 1).toISOString() }), /expired/],
    ['missing risk context', snapshot({ risk: undefined }), /verified cross-margin maintenance context/],
    ['an isolated position', snapshot({}, [position({ isolated: true })]), /Isolated positions/],
  ] as const)('withholds every estimate for %s', (_label, input, reason) => {
    const report = estimateLiquidationPrices(input, now);
    expect(report.disabledReason).toMatch(reason);
    expect(report.estimates).toEqual([]);
    expect(report.excluded).toHaveLength(input.positions.length);
    for (const item of report.excluded) expect(item.reason).toMatch(reason);
  });
  it.each([
    ['an unmodeled position', position({ modeled: false, exclusionReason: 'Market is not active.' }), /not active/],
    ['a zero size', position({ size: '0' }), /Zero/],
    ['an invalid oracle', position({ oracle: { slot: null, readSlot: null, valid: false, reason: 'Oracle is stale.' } }), /stale/],
    ['a missing maintenance ratio', position({ maintenanceMarginRatio: null }), /maintenance margin ratio/],
    ['a ratio of one or more', position({ maintenanceMarginRatio: '1' }), /maintenance margin ratio/],
  ] as const)('excludes %s with its reason and keeps the other positions', (_label, excluded, reason) => {
    const report = estimateLiquidationPrices(snapshot({}, [excluded, position({ id: 'perp-9', marketIndex: 9, market: 'ETH-PERP' })]), now);
    expect(report.disabledReason).toBeNull();
    expect(report.excluded).toHaveLength(1);
    expect(report.excluded[0]).toMatchObject({ id: excluded.id, market: excluded.market });
    expect(report.excluded[0].reason).toMatch(reason);
    expect(report.estimates.map((estimate: Estimate) => estimate.id)).toEqual(['perp-9']);
  });
});
