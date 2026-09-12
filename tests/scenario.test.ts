import { describe, expect, it } from 'vitest';
import { calculateScenario, FRESHNESS_SECONDS } from '../src/lib/scenario';
import { getSampleSnapshot, SAMPLE_ACCOUNTS } from '../src/lib/samples';
import { formatDecimal } from '../src/lib/format';
import { createReport } from '../src/lib/report';
import type { Position, Snapshot } from '../src/lib/types';
import { PROTOCOLS } from '../src/lib/protocols';

function snapshotWith(...changes: Partial<Position>[]): Snapshot {
  const snapshot = getSampleSnapshot('sol-long');
  const template = snapshot.positions[0];
  snapshot.positions = changes.map((change, index) => ({ ...template, id: `position-${index}`, ...change }));
  return snapshot;
}

const total = (snapshot: Snapshot, shock: number) => calculateScenario(snapshot, shock).totals[0]?.delta;

describe('linear price-shock arithmetic', () => {
  it('reproduces 100 SOL at 150: a −10% move loses 1,500 quote units', () => {
    const result = calculateScenario(getSampleSnapshot('sol-long'), -10);
    expect(result.included[0]).toMatchObject({ size: '100', baselinePrice: '150', hypotheticalPrice: '135', delta: '-1500' });
    expect(result.totals).toEqual([{ quote: 'USDC', delta: '-1500' }]);
  });

  it('reproduces the short BTC contribution and the combined +3,500 fixture', () => {
    const result = calculateScenario(getSampleSnapshot('long-short'), -10);
    expect(result.included.map(({ delta }) => delta)).toEqual(['-1500', '5000']);
    expect(result.included[1].hypotheticalPrice).toBe('90000');
    expect(result.totals).toEqual([{ quote: 'USDC', delta: '3500' }]);
    expect(result).toMatchObject({ eligible: 2, totalPositions: 2, disabledReason: null });
  });

  it('reverses long and short contributions for a rising market', () => {
    const result = calculateScenario(getSampleSnapshot('long-short'), 10);
    expect(result.included.map(({ delta }) => delta)).toEqual(['1500', '-5000']);
    expect(result.totals[0].delta).toBe('-3500');
  });

  it('returns exact unsigned zero for zero shock, including shorts', () => {
    const result = calculateScenario(getSampleSnapshot('long-short'), 0);
    expect(result.included.map(({ delta }) => delta)).toEqual(['0', '0']);
    expect(result.totals[0].delta).toBe('0');
  });

  it.each([
    ['hype-long', '-2000', 1],
    ['hype-short', '2000', 1],
    ['market-basket', '-7500', 4],
    ['hedged-basket', '500', 4],
  ])('models expanded %s fixtures using their exact contract quantities', (id, delta, eligible) => {
    const result = calculateScenario(getSampleSnapshot(String(id)), -10);
    expect(result).toMatchObject({ eligible, totalPositions: eligible, disabledReason: null });
    expect(result.totals).toEqual([{ quote: 'USDT', delta }]);
  });

  it('handles fractional quantities without binary floating-point error', () => {
    expect(total(snapshotWith({ size: '0.1', price: '0.2' }), 1)).toBe('0.0002');
    expect(total(snapshotWith({ size: '-0.1', price: '0.2' }), -1)).toBe('0.0002');
  });

  it('preserves integers larger than Number.MAX_SAFE_INTEGER', () => {
    expect(total(snapshotWith({ size: '9007199254740993', price: '1000000000000' }), 20))
      .toBe('1801439850948198600000000000');
  });

  it('retains digits beyond the decimal library default precision', () => {
    expect(total(snapshotWith({ size: '123456789012345678901234567890.123456789', price: '1' }), 1))
      .toBe('1234567890123456789012345678.90123456789');
  });

  it('retains tiny residuals when large long and short values cancel', () => {
    expect(total(snapshotWith(
      { size: '9007199254740993', price: '1' },
      { size: '-9007199254740992.999999999', price: '1' },
    ), 10)).toBe('0.0000000001');
  });

  it('sums only contributions in the same verified quote currency', () => {
    const snapshot = getSampleSnapshot('long-short');
    snapshot.positions[1].quote = 'USDT';
    expect(calculateScenario(snapshot, -10).totals).toEqual([
      { quote: 'USDC', delta: '-1500' },
      { quote: 'USDT', delta: '5000' },
    ]);
  });

  it.each([-21, 21, 0.1, NaN, Infinity])('rejects invalid bounded UI shock %s', (shock) => {
    const result = calculateScenario(getSampleSnapshot('sol-long'), shock);
    expect(result.disabledReason).toMatch(/whole-number/);
    expect(result.totals).toEqual([]);
  });
});

describe('coverage and frozen snapshot inputs', () => {
  it('exposes unsupported positions without folding them into the result', () => {
    const result = calculateScenario(getSampleSnapshot('partial-coverage'), -10);
    expect(result).toMatchObject({ eligible: 2, totalPositions: 3 });
    expect(result.totals[0].delta).toBe('3500');
    expect(result.excluded[0]).toMatchObject({ market: 'OTHER-PERP', reason: expect.stringContaining('unsupported') });
  });

  it('does not infer eligibility from an asset ticker alone', () => {
    const result = calculateScenario(snapshotWith({ modeled: false, exclusionReason: 'LP exposure is unsupported.' }), -10);
    expect(result.excluded[0].reason).toBe('LP exposure is unsupported.');
    expect(result.totals).toEqual([]);
  });

  it('rejects a supposedly modeled position with an unconfigured asset', () => {
    const result = calculateScenario(snapshotWith({ asset: 'OTHER' }), -10);
    expect(result.eligible).toBe(0);
    expect(result.excluded[0].reason).toContain('market identity');
  });

  it.each([
    { asset: 'HYPE' },
    { asset: 'HYPE', market: 'HYPE-PERP', marketIndex: 0 },
    { asset: 'SOL', market: 'SOL-PERP', marketIndex: 999 },
    { asset: 'OTHER', market: 'OTHER-PERP', marketIndex: 3 },
    { asset: 'TRUMP-WIN-2024', market: 'TRUMP-WIN-2024-BET', marketIndex: 36 },
  ])('rejects tampered or prediction identities from imported position data: %j', (change) => {
    expect(calculateScenario(snapshotWith(change), -10).eligible).toBe(0);
  });

  it('does not bypass a provider exclusion merely because HYPE is registered', () => {
    const result = calculateScenario(snapshotWith({ asset: 'HYPE', market: 'HYPE-PERP', marketIndex: 3, modeled: false, exclusionReason: 'Market is not active.' }), -10);
    expect(result.excluded[0].reason).toBe('Market is not active.');
    expect(result.totals).toEqual([]);
  });

  it('preserves zero-base protocol state while excluding it from price math', () => {
    const snapshot = snapshotWith({ size: '-0' });
    snapshot.orders = [{ market: 'SOL-PERP', count: 2 }];
    const result = calculateScenario(snapshot, -10);
    expect(result).toMatchObject({ eligible: 0, totalPositions: 1 });
    expect(result.excluded[0].reason).toContain('residual protocol state');
    expect(snapshot.orders[0].count).toBe(2);
    expect(snapshot.metrics).toHaveLength(3);
  });

  it.each([null, '0', '-1', 'NaN', 'Infinity', ''])('rejects unavailable or invalid price %s', (price) => {
    const result = calculateScenario(snapshotWith({ price }), -10);
    expect(result.eligible).toBe(0);
    expect(result.totals).toEqual([]);
    expect(result.excluded).toHaveLength(1);
  });

  it('excludes a stale oracle while retaining another valid position', () => {
    const snapshot = getSampleSnapshot('long-short');
    snapshot.positions[0].oracle = { slot: 100, readSlot: 900, valid: false, reason: 'Oracle is stale.' };
    const result = calculateScenario(snapshot, -10);
    expect(result).toMatchObject({ eligible: 1, totalPositions: 2, disabledReason: null });
    expect(result.excluded[0].reason).toBe('Oracle is stale.');
    expect(result.totals[0].delta).toBe('5000');
  });

  it('rejects undecodable quantities and missing quote currencies', () => {
    const result = calculateScenario(snapshotWith({ size: 'NaN' }, { quote: '' }), -10);
    expect(result.excluded.map(({ reason }) => reason)).toEqual([
      'Signed position quantity could not be decoded reliably.',
      'The quote currency could not be verified.',
    ]);
  });

  it('has an explicit no-open-position state', () => {
    const result = calculateScenario(snapshotWith(), -10);
    expect(result).toMatchObject({ totalPositions: 0, eligible: 0, totals: [] });
    expect(result.disabledReason).toContain('no open');
  });

  it('keeps collateral, debt, and orders visible but outside the delta', () => {
    const snapshot = getSampleSnapshot('partial-coverage');
    expect(snapshot.spots.map(({ kind }) => kind)).toEqual(['Collateral', 'Debt']);
    expect(snapshot.orders.reduce((count, market) => count + market.count, 0)).toBe(4);
    const originalResult = calculateScenario(snapshot, -10);
    const changedInventory = structuredClone(snapshot);
    changedInventory.spots[0].amount = '99999999999999999999';
    changedInventory.spots[1].amount = '80000000000';
    changedInventory.orders[0].count = 10;
    expect(calculateScenario(changedInventory, -10)).toEqual(originalResult);
  });

  it('never mutates the frozen baseline as the slider moves', () => {
    const snapshot = getSampleSnapshot('long-short');
    const baseline = JSON.stringify(snapshot);
    for (const shock of [-20, -10, 0, 5, 20]) calculateScenario(snapshot, shock);
    expect(JSON.stringify(snapshot)).toBe(baseline);
  });
});

describe('freshness', () => {
  const retrievedAt = '2026-09-11T12:00:00.000Z';
  const retrievedMillis = Date.parse(retrievedAt);
  function live() {
    return { ...getSampleSnapshot('long-short'), source: 'live' as const, network: 'mainnet-beta' as const, retrievedAt };
  }

  it('allows a live snapshot inside the app freshness window', () => {
    expect(calculateScenario(live(), -10, retrievedMillis + 1_000).totals[0].delta).toBe('3500');
  });

  it('disables live calculations at the expiry boundary', () => {
    const result = calculateScenario(live(), -10, retrievedMillis + FRESHNESS_SECONDS * 1_000);
    expect(result.disabledReason).toContain('expired');
    expect(result.totals).toEqual([]);
    expect(result.included).toEqual([]);
  });

  it('respects earlier provider expiry', () => {
    const snapshot = { ...live(), expiresAt: new Date(retrievedMillis + 500).toISOString() };
    expect(calculateScenario(snapshot, -10, retrievedMillis + 501).disabledReason).toContain('expired');
  });

  it('does not allow a later provider expiry to bypass the app rule', () => {
    const snapshot = { ...live(), expiresAt: new Date(retrievedMillis + 1_000_000).toISOString() };
    expect(calculateScenario(snapshot, -10, retrievedMillis + 121_000).disabledReason).toContain('expired');
  });

  it('rejects unparseable live freshness metadata', () => {
    expect(calculateScenario({ ...live(), retrievedAt: 'unknown' }, -10, retrievedMillis).disabledReason).toContain('unavailable');
    expect(calculateScenario({ ...live(), expiresAt: 'unknown' }, -10, retrievedMillis).disabledReason).toContain('unavailable');
  });

  it('keeps samples deterministic and usable regardless of wall clock', () => {
    const snapshot = getSampleSnapshot('long-short');
    expect(calculateScenario(snapshot, -10, retrievedMillis + 100_000_000).totals[0].delta).toBe('3500');
    expect(getSampleSnapshot('long-short')).toEqual(snapshot);
    expect(SAMPLE_ACCOUNTS).toHaveLength(12);
    for (const sample of SAMPLE_ACCOUNTS) {
      const fixture = getSampleSnapshot(sample.id);
      expect(fixture).toMatchObject({ authority: null, accountSlot: null, observedSlot: null });
      expect(fixture.subaccount.address).toBeNull();
      const result = calculateScenario(fixture, -10);
      expect(result.disabledReason, sample.id).toBeNull();
      expect(result.eligible, sample.id).toBe(fixture.positions.filter((position) => position.modeled).length);
    }
  });

  it('keeps legacy Drift unavailable even if stored modeled flags are changed', () => {
    const snapshot = { ...live(), protocol: PROTOCOLS.drift };
    expect(calculateScenario(snapshot, -10, retrievedMillis).disabledReason).toContain('Legacy Drift is paused');
    expect(calculateScenario(snapshot, -10, retrievedMillis).totals).toEqual([]);
  });

  it('rejects a mismatched deployment identity before calculating', () => {
    const snapshot = { ...live(), protocol: { ...PROTOCOLS.velocity, programId: '11111111111111111111111111111111' } };
    const result = calculateScenario(snapshot, -10, retrievedMillis);
    expect(result.eligible).toBe(0);
    expect(result.excluded[0].reason).toContain('market identity');
  });
});

describe('presentation and local JSON reports', () => {
  it('formats exact values with grouping and readable signs', () => {
    expect(formatDecimal('9007199254740993.125', 2, true)).toBe('+9,007,199,254,740,993.13');
    expect(formatDecimal('-1500', 2, true)).toBe('−1,500.00');
    expect(formatDecimal('5000', 0, true)).toBe('+5,000');
  });

  it('removes negative zero after presentation rounding', () => {
    expect(formatDecimal('-0.00001', 2, true)).toBe('0.00');
    expect(formatDecimal('-0', 0, true)).toBe('0');
    expect(formatDecimal('0', 2, true)).toBe('0.00');
  });

  it('shows unavailable values explicitly', () => {
    expect(formatDecimal(null)).toBe('—');
    expect(formatDecimal('NaN')).toBe('—');
  });

  it('exports exact contributions, coverage, original time, inventory, and provenance', () => {
    const snapshot = getSampleSnapshot('partial-coverage');
    const report = JSON.parse(JSON.stringify(createReport(snapshot, calculateScenario(snapshot, -10))));
    expect(report.sourceMode).toBe('sample');
    expect(report.sampleName).toBe('Partial coverage');
    expect(report.snapshotTime).toBe(snapshot.retrievedAt);
    expect(report.scenario.totalsByQuoteCurrency).toEqual([{ quote: 'USDC', delta: '3500' }]);
    expect(report.scenario.includedPositions).toHaveLength(2);
    expect(report.scenario.excludedPositions).toHaveLength(1);
    expect(report.inventoryOutsideScenario.spotBalances).toEqual(snapshot.spots);
    expect(report.inventoryOutsideScenario.openOrdersByMarket).toEqual(snapshot.orders);
    expect(report.assumptions.join(' ')).toContain('borrowing interest');
    expect(report.provenance).toEqual(snapshot.provenance);
  });

  it('does not round report values or emit a stale total', () => {
    const snapshot = snapshotWith({ size: '12345678901234567890.123456789', price: '1' });
    const report = createReport(snapshot, calculateScenario(snapshot, 1));
    expect(report.scenario.totalsByQuoteCurrency[0].delta).toBe('123456789012345678.90123456789');
    snapshot.source = 'live';
    const expiredReport = createReport(snapshot, calculateScenario(snapshot, 1, Date.parse(snapshot.retrievedAt) + 121_000));
    expect(expiredReport.scenario.totalsByQuoteCurrency).toEqual([]);
    expect(expiredReport.scenario.disabledReason).toContain('expired');
  });
});
