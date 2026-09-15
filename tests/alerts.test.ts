import { describe, expect, it } from 'vitest';
import { createAlertRule, decodeAlertStore, deleteAlertRule, emptyAlertStore, encodeAlertStore, evaluateAlerts, runAlertWorker } from '../src/lib/alerts';
import { getSampleSnapshot } from '../src/lib/samples';
import { PROTOCOLS } from '../src/lib/protocols';

const owner = 'owner-a';
const at = new Date('2026-09-15T00:00:00.000Z');
function live(headroom: string, expiresAt = '2026-09-15T00:02:00.000Z') {
  const snapshot = getSampleSnapshot('long-short');
  return { ...snapshot, source: 'live' as const, network: 'mainnet-beta' as const, protocol: PROTOCOLS.velocity, authority: '11111111111111111111111111111111', subaccount: { id: 0, name: 'Primary', address: '11111111111111111111111111111111' }, retrievedAt: at.toISOString(), expiresAt, risk: { scope: 'cross-margin' as const, totalCollateral: '1200', maintenanceRequirement: '950', maintenanceHeadroom: headroom, canBeLiquidated: false, status: 'clear' as const, explanation: 'Fixture observation.' } };
}

describe('local threshold alert pipeline', () => {
  it('creates one versioned event, claims it, and records idempotent mock delivery', () => {
    const rule = createAlertRule({ ownerId: owner, authority: '11111111111111111111111111111111', subaccountId: 0, direction: 'below', threshold: '300', cadenceMinutes: 15, timezone: 'UTC' }, at);
    const initial = { ...emptyAlertStore(), rules: [rule] };
    const evaluated = evaluateAlerts(initial, live('250'), owner, at);
    expect(evaluated.events).toHaveLength(1);
    expect(evaluated.outbox[0]).toMatchObject({ state: 'pending', eventId: evaluated.events[0].id, attempts: 0 });
    const delivered = runAlertWorker(evaluated, owner, 'worker-a', at);
    expect(delivered.events[0]).toMatchObject({ state: 'delivered', claimedBy: 'worker-a' });
    expect(delivered.outbox[0]).toMatchObject({ state: 'delivered', attempts: 1 });
    expect(delivered.deliveries).toHaveLength(1);
    expect(evaluateAlerts(delivered, live('250'), owner, at).events).toHaveLength(1);
  });

  it('suppresses stale or unsupported input and keeps owners isolated', () => {
    const rule = createAlertRule({ ownerId: owner, authority: '11111111111111111111111111111111', subaccountId: 0, direction: 'below', threshold: '300', cadenceMinutes: 15, timezone: 'UTC' }, at);
    const initial = { ...emptyAlertStore(), rules: [rule] };
    expect(evaluateAlerts(initial, live('250', '2026-09-14T23:59:00.000Z'), owner, at).events).toHaveLength(0);
    expect(evaluateAlerts(initial, live('250'), 'another-owner', at).events).toHaveLength(0);
    expect(evaluateAlerts(initial, { ...live('250'), risk: undefined }, owner, at).events).toHaveLength(0);
  });

  it('round-trips bounded persistent state and rejects malformed storage to a clean store', () => {
    const raw = encodeAlertStore(emptyAlertStore());
    expect(decodeAlertStore(raw)).toEqual(emptyAlertStore());
    expect(decodeAlertStore('{"version":1,"rules":[{"bad":true}]}')).toEqual(emptyAlertStore());
  });

  it('retries a failed sink and removes queued work only for the owning rule', () => {
    const rule = createAlertRule({ ownerId: owner, authority: '11111111111111111111111111111111', subaccountId: 0, direction: 'below', threshold: '300', cadenceMinutes: 15, timezone: 'UTC' }, at);
    const queued = evaluateAlerts({ ...emptyAlertStore(), rules: [rule] }, live('250'), owner, at);
    const failed = runAlertWorker(queued, owner, 'worker-a', at, () => false);
    expect(failed.outbox[0]).toMatchObject({ state: 'failed', attempts: 1 });
    const retried = runAlertWorker(failed, owner, 'worker-a', new Date(at.getTime() + 1_000));
    expect(retried.outbox[0]).toMatchObject({ state: 'delivered', attempts: 2 });
    const deleted = deleteAlertRule(queued, rule.id, owner);
    expect(deleted.rules).toHaveLength(0);
    expect(deleted.events).toHaveLength(0);
    expect(deleted.outbox).toHaveLength(0);
  });
});
