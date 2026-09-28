import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
const Exact = Decimal.clone({ precision: 260 });
import { alertInputProblem, alertMetricValue, claimAlertWork, createAlertRule, decodeAlertStore, deleteAlertRule, emptyAlertStore, encodeAlertStore, evaluateAlerts, evaluateFixtureAlerts, finishAlertWork, parseAlertStore, pauseAlertRule, runAlertWorker, updateAlertRule } from '../src/lib/alerts';
import { estimateLiquidationPrices } from '../src/lib/risk/liquidation';
import { getSampleSnapshot } from '../src/lib/samples';
import { PROTOCOLS } from '../src/lib/protocols';

const owner = 'owner-a';
const at = new Date('2026-09-15T00:00:00.000Z');
const time = (seconds: number) => new Date(at.getTime() + seconds * 1000);
function live(headroom = '250', now = at) {
  const snapshot = getSampleSnapshot('long-short');
  return { ...snapshot, source: 'live' as const, network: 'mainnet-beta' as const, protocol: PROTOCOLS.velocity, authority: '11111111111111111111111111111111', subaccount: { id: 0, name: 'Primary', address: '11111111111111111111111111111111' }, retrievedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 120_000).toISOString(), risk: { scope: 'cross-margin' as const, totalCollateral: new Exact(headroom).plus('950').toFixed(), maintenanceRequirement: '950', maintenanceHeadroom: headroom, canBeLiquidated: false, status: 'clear' as const, explanation: 'Fixture observation.' } };
}
function initial(extra = {}) {
  return { ...emptyAlertStore(), rules: [createAlertRule({ ownerId: owner, authority: '11111111111111111111111111111111', subaccountId: 0, direction: 'below', threshold: '300', cadenceMinutes: 1, cooldownMinutes: 5, hysteresis: '10', timezone: 'UTC', ...extra }, at)] };
}
function queued() { return evaluateAlerts(initial(), live(), owner, at); }

describe('local threshold alert pipeline', () => {
  it('creates a versioned episode once and records idempotent mock delivery across cadence boundaries', () => {
    const evaluated = queued();
    expect(evaluated.events).toHaveLength(1);
    expect(evaluated.outbox[0]).toMatchObject({ state: 'pending', eventId: evaluated.events[0].id, attempts: 0 });
    const delivered = runAlertWorker(evaluated, owner, 'worker-a', at);
    expect(delivered.events[0]).toMatchObject({ state: 'delivered', claimedBy: 'worker-a' });
    expect(delivered.outbox[0]).toMatchObject({ state: 'delivered', attempts: 1 });
    expect(delivered.deliveries).toHaveLength(1);
    expect(delivered.worker.running).toBe(false);
    const later = evaluateAlerts(decodeAlertStore(encodeAlertStore(delivered)), live('250', time(900)), owner, time(900));
    expect(later.events).toHaveLength(1);
  });
  it('suppresses stale, unavailable, partial and unsupported input and keeps owners isolated', () => {
    const store = initial();
    const cases = [
      { ...live(), expiresAt: null, retrievedAt: time(-121).toISOString() },
      { ...live(), retrievedAt: 'broken' }, { ...live(), retrievedAt: time(6).toISOString() },
      { ...live(), expiresAt: 'broken' }, { ...live(), expiresAt: at.toISOString() },
      { ...live(), source: 'sample' as const }, { ...live(), protocol: PROTOCOLS.pacifica },
      { ...live(), network: 'fixture' as const },
      { ...live(), protocol: { ...PROTOCOLS.velocity, programId: 'forged' } },
      { ...live(), positions: [{ ...live().positions[0], isolated: true }] },
      { ...live(), positions: [{ ...live().positions[0], price: '0' }] },
      { ...live(), positions: [{ ...live().positions[0], oracle: { ...live().positions[0].oracle, valid: 'false' as unknown as boolean } }] },
      { ...live(), risk: { ...live().risk, maintenanceHeadroom: '-100' } },
      { ...live(), risk: undefined }, { ...live(), inventoryAvailable: false },
      { ...live(), risk: { ...live().risk, status: 'unavailable' as const } },
      { ...live(), risk: { ...live().risk, totalCollateral: null } },
      { ...live(), positions: [{ ...live().positions[0], oracle: { valid: false, slot: null, readSlot: null, reason: 'Stale' } }] },
    ];
    for (const snapshot of cases) {
      expect(alertInputProblem(snapshot, at)).not.toBeNull();
      const result = evaluateAlerts(store, snapshot, owner, at);
      expect(result.events).toHaveLength(0);
      expect(result.lastFreshCheck).toBeNull();
      expect(result.monitors[0].status).toBe('unavailable');
    }
    expect(evaluateAlerts(store, live(), 'another-owner', at).events).toHaveLength(0);
  });
  it('keeps an unresolved alert and original fresh timestamp when input becomes stale', () => {
    const before = queued();
    const stale = evaluateAlerts(before, { ...live(), expiresAt: null }, owner, time(121));
    expect(stale.events).toEqual(before.events);
    expect(stale.lastFreshCheck).toBe(at.toISOString());
    expect(stale.monitors[0]).toMatchObject({ status: 'unavailable', breached: true, episode: 1 });
    expect(runAlertWorker(stale, owner, 'worker-a', time(121)).deliveries).toHaveLength(0);
    const recovered = evaluateAlerts(stale, live('350', time(122)), owner, time(122));
    expect(recovered.events).toHaveLength(1);
    expect(recovered.monitors[0]).toMatchObject({ status: 'ready', breached: false });
    expect(runAlertWorker(recovered, owner, 'worker-a', time(122)).deliveries).toHaveLength(1);
  });
  it('requires hysteresis recovery and cooldown before a second episode notification', () => {
    let store = queued();
    store = evaluateAlerts(store, live('305', time(60)), owner, time(60));
    expect(store.monitors[0].breached).toBe(true);
    store = evaluateAlerts(store, live('311', time(120)), owner, time(120));
    expect(store.monitors[0].breached).toBe(false);
    store = evaluateAlerts(store, live('250', time(180)), owner, time(180));
    expect(store.monitors[0].episode).toBe(2);
    expect(store.events).toHaveLength(1);
    store = evaluateAlerts(store, live('250', time(300)), owner, time(300));
    expect(store.events).toHaveLength(2);
  });
  it('uses the opposite hysteresis direction for above thresholds', () => {
    let store = evaluateAlerts(initial({ direction: 'above' }), live('350'), owner, at);
    store = evaluateAlerts(store, live('295', time(60)), owner, time(60));
    expect(store.monitors[0].breached).toBe(true);
    store = evaluateAlerts(store, live('289', time(120)), owner, time(120));
    expect(store.monitors[0].breached).toBe(false);
  });
  it('enforces retry backoff, catches sink failures, and caps attempts', () => {
    let store = runAlertWorker(queued(), owner, 'worker-a', at, () => { throw new Error('sink'); });
    expect(store.outbox[0]).toMatchObject({ state: 'failed', attempts: 1, nextAttemptAt: time(1).toISOString() });
    store = runAlertWorker(store, owner, 'worker-b', at);
    expect(store.outbox[0].attempts).toBe(1);
    store = runAlertWorker(store, owner, 'worker-a', time(1), () => false);
    expect(store.outbox[0].attempts).toBe(2);
    store = runAlertWorker(store, owner, 'worker-a', time(3), () => false);
    store = runAlertWorker(store, owner, 'worker-a', time(20));
    expect(store.outbox[0]).toMatchObject({ state: 'failed', attempts: 3 });
    expect(store.deliveries).toHaveLength(0);
  });
  it('honors an earlier provider expiry at claim and completion', () => {
    const store = evaluateAlerts(initial(), { ...live(), expiresAt: time(10).toISOString() }, owner, at);
    expect(claimAlertWork(store, owner, 'worker-a', time(10)).claim).toBeNull();
    const claimed = claimAlertWork(store, owner, 'worker-a', at);
    const finished = finishAlertWork(claimed.store, owner, claimed.claim!, true, time(10));
    expect(finished.deliveries).toHaveLength(0);
    expect(finished.outbox[0].state).toBe('pending');
    expect(claimAlertWork(queued(), owner, 'worker-a', time(120)).claim).toBeNull();
  });
  it('fences an expired claimant and recovers its persisted lease without duplicate delivery', () => {
    const a = claimAlertWork(queued(), owner, 'worker-a', at);
    expect(a.claim).not.toBeNull();
    expect(claimAlertWork(a.store, owner, 'worker-b', time(20)).claim).toBeNull();
    const b = claimAlertWork(parseAlertStore(encodeAlertStore(a.store)), owner, 'worker-b', time(31));
    expect(b.claim).not.toBeNull();
    expect(b.claim!.leaseToken).not.toBe(a.claim!.leaseToken);
    const obsolete = finishAlertWork(b.store, owner, a.claim!, true, time(31));
    expect(obsolete.deliveries).toHaveLength(0);
    const current = finishAlertWork(obsolete, owner, b.claim!, true, time(31));
    expect(current.deliveries).toHaveLength(1);
    expect(finishAlertWork(current, owner, b.claim!, true, time(31)).deliveries).toHaveLength(1);
  });
  it('pause, edit and deletion invalidate claimed work before completion without removing the audit trail', () => {
    for (const operation of [pauseAlertRule, deleteAlertRule, (store: ReturnType<typeof initial>, id: string, ownerId: string) => updateAlertRule(store, id, ownerId, { threshold: '200' }, at)]) {
      const claimed = claimAlertWork(queued(), owner, 'worker-a', at);
      const invalidated = operation(claimed.store, claimed.store.rules[0].id, owner);
      const finished = finishAlertWork(invalidated, owner, claimed.claim!, true, at);
      expect(finished.deliveries).toHaveLength(0);
      expect(finished.events[0].state).toBe('suppressed');
      expect(finished.outbox[0].state).toBe('suppressed');
    }
    const store = queued();
    expect(pauseAlertRule(store, store.rules[0].id, 'other')).toEqual(store);
  });
  it('requires explicit fixture input without promoting an unsupported live observation', () => {
    const fixture = { ...live(), source: 'sample' as const, network: 'fixture' as const };
    const result = evaluateFixtureAlerts(initial(), fixture, owner, at);
    expect(result.events[0].reason).toContain('Deterministic fixture');
    expect(() => evaluateFixtureAlerts(initial(), live(), owner, at)).toThrow('explicit deterministic fixture');
  });

  it('preserves recovery boundaries above twenty significant digits', () => {
    const threshold = '10000000000000000000000';
    let store = evaluateAlerts(initial({ threshold, hysteresis: '0.01' }), live(threshold), owner, at);
    store = evaluateAlerts(store, live('10000000000000000000000.005', time(60)), owner, time(60));
    expect(store.monitors[0].breached).toBe(true);
    store = evaluateAlerts(store, live('10000000000000000000000.011', time(120)), owner, time(120));
    expect(store.monitors[0].breached).toBe(false);
  });
  it('strict persistence rejects corruption and invalid rule values while legacy browser data migrates', () => {
    expect(decodeAlertStore('{"version":1,"rules":[{"bad":true}]}')).toEqual(emptyAlertStore());
    expect(() => parseAlertStore('{"version":1}')).toThrow();
    const legacy = { ...emptyAlertStore(), monitors: undefined };
    expect(parseAlertStore(JSON.stringify(legacy)).monitors).toEqual([]);
    expect(() => initial({ cadenceMinutes: 1.5 })).toThrow();
    expect(() => initial({ hysteresis: '-1' })).toThrow();
    expect(() => initial({ timezone: 'Invalid/Zone' })).toThrow();
    const full = queued(); full.events.push(full.events[0]);
    expect(() => encodeAlertStore(full)).toThrow('Duplicate');
  });
});

describe('liquidation-distance rules', () => {
  // Live reads carry a verified maintenance ratio per position; the fixture adds one so the model can solve.
  const modeled = (now = at) => { const snapshot = live('250', now); return { ...snapshot, positions: snapshot.positions.map(position => ({ ...position, maintenanceMarginRatio: '0.05' })) }; };
  const distanceRule = (market = 'SOL-PERP', threshold = '20') => createAlertRule({ ownerId: owner, authority: '11111111111111111111111111111111', subaccountId: 0, metric: 'liquidation_distance', market, direction: 'below', threshold, cadenceMinutes: 1, cooldownMinutes: 5, timezone: 'UTC' }, at);
  it('creates a liquidation rule only with one perpetual market and keeps headroom rules market-free', () => {
    const rule = distanceRule();
    expect(rule).toMatchObject({ metric: 'liquidation_distance', market: 'SOL-PERP', hysteresis: '1' });
    expect(createAlertRule({ ownerId: owner, authority: rule.authority, subaccountId: 0, direction: 'below', threshold: '300', cadenceMinutes: 1, timezone: 'UTC' }, at)).not.toHaveProperty('market');
    expect(() => distanceRule('sol-perp')).toThrow();
    expect(() => createAlertRule({ ownerId: owner, authority: rule.authority, subaccountId: 0, metric: 'maintenance_headroom', market: 'SOL-PERP', direction: 'below', threshold: '300', cadenceMinutes: 1, timezone: 'UTC' }, at)).toThrow();
    expect(() => parseAlertStore(JSON.stringify({ ...emptyAlertStore(), rules: [{ ...rule, market: undefined }] }))).toThrow();
    expect(() => parseAlertStore(JSON.stringify({ ...emptyAlertStore(), rules: [{ ...rule, metric: 'maintenance_headroom' }] }))).toThrow();
  });
  it('observes the unsigned distance to the estimated boundary for the named market and queues one episode', () => {
    const snapshot = modeled();
    const estimate = estimateLiquidationPrices(snapshot, at.getTime()).estimates.find(item => item.market === 'SOL-PERP')!;
    const expected = new Exact(estimate.distancePercent!).abs().toFixed();
    expect(alertMetricValue({ metric: 'liquidation_distance', market: 'SOL-PERP' }, snapshot, at)).toEqual({ value: expected });
    const store = evaluateAlerts({ ...emptyAlertStore(), rules: [distanceRule('SOL-PERP', '20'), distanceRule('BTC-PERP', '0.001')] }, snapshot, owner, at);
    expect(new Exact(expected).lte(20)).toBe(true);
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({ value: expected, threshold: '20', reason: 'Liquidation distance SOL-PERP is below the configured threshold.' });
    expect(store.monitors.find(item => item.ruleId === store.rules[1].id)).toMatchObject({ status: 'ready', breached: false });
    // A second fresh observation inside the cadence and cooldown does not repeat the episode.
    const again = evaluateAlerts(store, modeled(time(30)), owner, time(30));
    expect(again.events).toHaveLength(1);
  });
  it('marks the monitor unavailable with the reason when the market has no current estimate, without an event', () => {
    const snapshot = modeled();
    const missing = evaluateAlerts({ ...emptyAlertStore(), rules: [distanceRule('ETH-PERP')] }, snapshot, owner, at);
    expect(missing.events).toHaveLength(0);
    expect(missing.monitors[0]).toMatchObject({ status: 'unavailable', reason: 'No open ETH-PERP position was observed for this account.', lastFreshCheck: at.toISOString() });
    const unverified = evaluateAlerts({ ...emptyAlertStore(), rules: [distanceRule('SOL-PERP')] }, { ...snapshot, positions: snapshot.positions.map(position => ({ ...position, maintenanceMarginRatio: null })) }, owner, at);
    expect(unverified.events).toHaveLength(0);
    expect(unverified.monitors[0].reason).toContain('SOL-PERP: ');
    const isolated = evaluateAlerts({ ...emptyAlertStore(), rules: [distanceRule('SOL-PERP')] }, { ...snapshot, positions: snapshot.positions.map(position => ({ ...position, isolated: true })) }, owner, at);
    expect(isolated.monitors[0]).toMatchObject({ status: 'unavailable', lastFreshCheck: null });
  });
});
