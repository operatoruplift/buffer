import { describe, expect, it } from 'vitest';
import {
  addSamplePerp, CUSTOM_SAMPLE_NAME, DEFAULT_SAMPLE_ID, getPortfolioSampleSnapshot, getSampleQuote,
  removeSamplePerp, SAMPLE_MARKET_CATALOG, setSampleQuote, updateSamplePerp,
} from '../src/lib/sample-builder';
import { REFERENCE_PERP_CATALOG } from '../src/lib/perp-markets';
import { getSampleSnapshot, SAMPLE_ACCOUNTS } from '../src/lib/samples';
import { calculateScenario } from '../src/lib/scenario';
import { createReport } from '../src/lib/report';
import { decodeDeviceReports, encodeDeviceReports } from '../src/lib/device-reports';
import { PROTOCOLS } from '../src/lib/protocols';

describe('editable sample portfolio', () => {
  it('starts with four exact positions, a +1000 USDC down scenario, and derived exposure summaries', () => {
    const snapshot = getSampleSnapshot(DEFAULT_SAMPLE_ID);
    expect(snapshot.positions.map(position => [position.asset, position.size, position.price])).toEqual([
      ['SOL', '100', '150'], ['BTC', '-0.5', '100000'], ['ETH', '8', '2500'], ['XRP', '2500', '2'],
    ]);
    expect(calculateScenario(snapshot, -10).totals).toEqual([{ quote: 'USDC', delta: '1000' }]);
    expect(snapshot.metrics.map(metric => [metric.label, metric.value, metric.unit])).toEqual([
      ['Gross notional', '90000', 'USDC'], ['Long notional', '40000', 'USDC'], ['Short notional', '50000', 'USDC'],
    ]);
    expect(snapshot).toMatchObject({ source: 'sample', network: 'fixture', authority: null, accountSlot: null, observedSlot: null, expiresAt: null });
    expect(snapshot.provenance.join(' ')).toContain('does not assert venue settlement support');
    expect(getPortfolioSampleSnapshot()).toEqual(snapshot);
  });

  it('keeps the twelve original fixture definitions and values available', () => {
    expect(SAMPLE_ACCOUNTS).toHaveLength(13);
    expect(calculateScenario(getSampleSnapshot('long-short'), -10).totals).toEqual([{ quote: 'USDC', delta: '3500' }]);
    expect(calculateScenario(getSampleSnapshot('market-basket'), -10).totals).toEqual([{ quote: 'USDT', delta: '-7500' }]);
    expect(getSampleSnapshot('partial-coverage').positions).toHaveLength(3);
  });

  it('adds every configured catalog market with a finite historical sample price and exact identity', () => {
    let snapshot = getPortfolioSampleSnapshot();
    for (const position of snapshot.positions) snapshot = removeSamplePerp(snapshot, position.id);
    expect(SAMPLE_MARKET_CATALOG).toHaveLength(76);
    for (const market of SAMPLE_MARKET_CATALOG) snapshot = addSamplePerp(snapshot, market.asset);
    const result = calculateScenario(snapshot, -10);
    expect(result).toMatchObject({ eligible: 76, totalPositions: 76, disabledReason: null });
    expect(result.excluded).toEqual([]);
    expect(new Set(snapshot.positions.map(position => position.id)).size).toBe(76);
    expect(snapshot.positions.every(position => position.oracle.observedAt === undefined && position.oracle.slot === null)).toBe(true);
  });

  it('uses exact decimal arithmetic for edits, directions, and notional summaries without mutating the source', () => {
    const original = getPortfolioSampleSnapshot();
    const before = structuredClone(original);
    const updated = updateSamplePerp(original, original.positions[0].id, { side: 'short', quantity: '0.1', price: '0.2' });
    expect(original).toEqual(before);
    expect(updated.positions[0]).toMatchObject({ size: '-0.1', price: '0.2', notional: '0.02' });
    expect(calculateScenario(updated, -10).included[0].delta).toBe('0.002');
    expect(updated.metrics.map(metric => metric.value)).toEqual(['75000.02', '25000', '50000.02']);
    expect(updated.sampleName).toBe('Custom portfolio');
  });

  it.each(['USDC', 'USDT', 'USD'])('changes sample denomination to %s without converting inputs or inventory', quote => {
    const original = getSampleSnapshot('partial-coverage');
    const changed = setSampleQuote(original, quote);
    expect(changed.positions.map(position => [position.size, position.price])).toEqual(original.positions.map(position => [position.size, position.price]));
    expect(changed.positions.every(position => position.quote === quote)).toBe(true);
    expect(changed.spots).toEqual(original.spots);
    expect(calculateScenario(changed, -10).totals).toEqual([{ quote, delta: '3500' }]);
    expect(changed.positions[2].modeled).toBe(false);
    expect(changed.catalog).toEqual(REFERENCE_PERP_CATALOG);
    expect(changed.protocol).toBeUndefined();
    expect([changed.sampleName, changed.subaccount.name]).toEqual([original.sampleName, original.subaccount.name]);
  });

  it('keeps the preset identity when only the denomination changes, and replaces it on a composition change', () => {
    const preset = getSampleSnapshot(DEFAULT_SAMPLE_ID);
    const inUsdt = setSampleQuote(preset, 'USDT');
    expect(inUsdt.sampleName).toBe('Four-market portfolio');
    expect(inUsdt.subaccount).toEqual(preset.subaccount);
    expect(SAMPLE_ACCOUNTS.some(account => account.name === inUsdt.sampleName)).toBe(true);
    expect(inUsdt.positions.map(position => [position.size, position.price, position.quote]))
      .toEqual(preset.positions.map(position => [position.size, position.price, 'USDT']));
    expect(inUsdt.metrics.map(metric => [metric.value, metric.unit]))
      .toEqual([['90000', 'USDT'], ['40000', 'USDT'], ['50000', 'USDT']]);
    // Only a position, quantity, price, or direction change makes the portfolio the reader's own,
    // and a later denomination change never restores the preset name.
    for (const custom of [
      setSampleQuote(addSamplePerp(inUsdt, 'HYPE'), 'USD'),
      updateSamplePerp(inUsdt, inUsdt.positions[0].id, { side: 'short', quantity: '1', price: '1' }),
      removeSamplePerp(inUsdt, inUsdt.positions[0].id),
    ]) {
      expect([custom.sampleName, custom.subaccount.name]).toEqual([CUSTOM_SAMPLE_NAME, CUSTOM_SAMPLE_NAME]);
    }
    expect(SAMPLE_ACCOUNTS.some(account => account.name === CUSTOM_SAMPLE_NAME)).toBe(false);
  });

  it('names the reference catalog it was built from instead of borrowing a protocol identity', () => {
    const snapshot = addSamplePerp(setSampleQuote(getSampleSnapshot(DEFAULT_SAMPLE_ID), 'USDT'), 'XAU');
    expect(snapshot.catalog).toEqual({
      id: 'reference-perps', label: 'Buffer reference perpetual catalog', markets: SAMPLE_MARKET_CATALOG.length,
      capturedAt: REFERENCE_PERP_CATALOG.capturedAt, source: REFERENCE_PERP_CATALOG.source,
      explanation: REFERENCE_PERP_CATALOG.explanation,
    });
    expect(snapshot.protocol).toBeUndefined();
    const report = createReport(snapshot, calculateScenario(snapshot, -10));
    expect(Object.keys(report)).not.toContain('protocol');
    expect(report.referenceCatalog).toEqual(REFERENCE_PERP_CATALOG);
    expect(report.referenceCatalog?.explanation).toContain('not an account, a venue read, or a live market');
    // An edited preset that carried a protocol identity stops claiming one.
    const wasPacifica = getSampleSnapshot('sol-long');
    wasPacifica.protocol = { ...PROTOCOLS.pacifica };
    expect(setSampleQuote(wasPacifica, 'USD').protocol).toBeUndefined();
    expect(calculateScenario(setSampleQuote(wasPacifica, 'USD'), -10).eligible).toBe(1);
  });

  it('verifies edited positions against the reference catalog and rejects a tampered or misplaced catalog', () => {
    const snapshot = addSamplePerp(getPortfolioSampleSnapshot(), 'XAU');
    expect(calculateScenario(snapshot, -10).eligible).toBe(5);
    for (const catalog of [
      { ...REFERENCE_PERP_CATALOG, source: 'https://untrusted.example' },
      { ...REFERENCE_PERP_CATALOG, markets: 4 },
      { ...REFERENCE_PERP_CATALOG, capturedAt: '2026-01-01T00:00:00.000Z' },
    ]) {
      const result = calculateScenario({ ...snapshot, catalog }, -10);
      expect(result.eligible).toBe(0);
      expect(result.excluded[0].reason).toContain('market identity');
    }
    // A catalog never stands in for a protocol registry or describes a live read.
    const withProtocol = calculateScenario({ ...snapshot, protocol: { ...PROTOCOLS.pacifica } }, -10);
    expect(withProtocol.eligible).toBe(0);
    expect(withProtocol.excluded[0].reason).toContain('market identity');
    const live = { ...snapshot, source: 'live' as const, network: 'mainnet-beta' as const, authority: '11111111111111111111111111111111' };
    // Freshness is satisfied here, so the exclusion is the identity check itself.
    const fresh = calculateScenario(live, -10, Date.parse(live.retrievedAt) + 1_000);
    expect(fresh.eligible).toBe(0);
    expect(fresh.excluded.every(item => item.reason.includes('market identity'))).toBe(true);
  });

  it('retains denomination after removing every position, then supports adding a fresh market', () => {
    let snapshot = setSampleQuote(getPortfolioSampleSnapshot(), 'USD');
    for (const position of snapshot.positions) snapshot = removeSamplePerp(snapshot, position.id);
    expect(getSampleQuote(snapshot)).toBe('USD');
    expect(snapshot.metrics.map(metric => metric.value)).toEqual(['0', '0', '0']);
    expect(calculateScenario(snapshot, -10).disabledReason).toContain('no open');
    snapshot = addSamplePerp(snapshot, 'kBONK');
    expect(snapshot.positions[0].quote).toBe('USD');
    expect(calculateScenario(snapshot, -10).eligible).toBe(1);
  });

  it('omits excluded fixture exposure from edited sample summaries and explains their scope', () => {
    const original = getSampleSnapshot('partial-coverage');
    const snapshot = updateSamplePerp(original, original.positions[0].id, { side: 'long', quantity: '100', price: '150' });
    expect(snapshot.positions.find(position => position.asset === 'OTHER')).toMatchObject({ modeled: false, notional: '1000' });
    expect(snapshot.metrics.map(metric => metric.value)).toEqual(['65000', '15000', '50000']);
    expect(snapshot.metrics.every(metric => metric.explanation.includes('Modeled positions only; excluded positions omitted'))).toBe(true);
    expect(calculateScenario(snapshot, -10).totals).toEqual([{ quote: 'USDC', delta: '3500' }]);
  });

  it('allows all 76 catalog perps alongside an excluded fixture position', () => {
    let snapshot = getSampleSnapshot('partial-coverage');
    for (const market of SAMPLE_MARKET_CATALOG) {
      if (!snapshot.positions.some(position => position.asset === market.asset)) snapshot = addSamplePerp(snapshot, market.asset);
    }
    expect(snapshot.positions).toHaveLength(77);
    expect(calculateScenario(snapshot, -10)).toMatchObject({ eligible: 76, totalPositions: 77, disabledReason: null });
    expect(calculateScenario(snapshot, -10).excluded).toEqual([{ id: 'fixture-unsupported', market: 'OTHER-PERP', reason: expect.stringContaining('unsupported') }]);
    expect(() => addSamplePerp(snapshot, 'SOL')).toThrow('already');
    expect(() => addSamplePerp(snapshot, 'UNLISTED')).toThrow('catalog');
  });

  it('rejects duplicate markets, unknown or differently-cased symbols, unknown positions, and unlisted quotes', () => {
    const snapshot = getPortfolioSampleSnapshot();
    expect(() => addSamplePerp(snapshot, 'SOL')).toThrow('already');
    expect(() => addSamplePerp(snapshot, 'KBONK')).toThrow('catalog');
    expect(() => addSamplePerp(snapshot, 'FAKE')).toThrow('catalog');
    expect(() => removeSamplePerp(snapshot, 'missing')).toThrow('no longer');
    expect(() => setSampleQuote(snapshot, 'EUR')).toThrow('Choose');
    expect(() => updateSamplePerp(snapshot, 'missing', { side: 'long', quantity: '1', price: '1' })).toThrow('no longer');
  });

  it.each(['', '0', '-1', 'NaN', 'Infinity', '1e8', '.5', '1.2.3', '1234567890123456789', '0.1234567890123456789'])('rejects invalid or unbounded input %s', value => {
    const snapshot = getPortfolioSampleSnapshot();
    const id = snapshot.positions[0].id;
    expect(() => updateSamplePerp(snapshot, id, { side: 'long', quantity: value, price: '1' })).toThrow('Quantity');
    expect(() => updateSamplePerp(snapshot, id, { side: 'long', quantity: '1', price: value })).toThrow('Baseline price');
  });

  it('rejects all edits to live snapshots, even when their positions resemble fixtures', () => {
    const snapshot = { ...getPortfolioSampleSnapshot(), source: 'live' as const, network: 'mainnet-beta' as const, authority: '11111111111111111111111111111111' };
    expect(() => addSamplePerp(snapshot, 'HYPE')).toThrow('cannot be changed');
    expect(() => setSampleQuote(snapshot, 'USD')).toThrow('cannot be changed');
    expect(() => removeSamplePerp(snapshot, snapshot.positions[0].id)).toThrow('cannot be changed');
    expect(() => updateSamplePerp(snapshot, snapshot.positions[0].id, { side: 'short', quantity: '1', price: '1' })).toThrow('cannot be changed');
  });

  it('exports and saves edited inputs, exact totals, and explicit sample provenance', () => {
    const original = getPortfolioSampleSnapshot();
    const updated = setSampleQuote(updateSamplePerp(original, original.positions[0].id, { side: 'short', quantity: '2', price: '100' }), 'USDT');
    const report = createReport(updated, calculateScenario(updated, -10));
    const raw = encodeDeviceReports([{ id: '00000000-0000-4000-8000-000000000001', title: 'Edited sample', created_at: '2026-09-12T12:00:00.000Z', report }]);
    const saved = decodeDeviceReports(raw)[0].report;
    expect(saved).toEqual(report);
    expect(saved.positions[0]).toMatchObject({ size: '-2', price: '100', quote: 'USDT' });
    expect(saved.scenario.totalsByQuoteCurrency).toEqual([{ quote: 'USDT', delta: '2520' }]);
    expect(saved.sourceMode).toBe('sample');
    expect(saved.observedSlots.account).toBeNull();
  });
});
