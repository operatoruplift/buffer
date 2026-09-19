import { describe, expect, it, vi } from 'vitest';
import { evaluateHostedRule, runMonitoringWorker } from '../src/server/monitoring/coordinator';
import type { DbRule, DbWork, WorkerRepository } from '../src/server/monitoring/repository';
import type { DiscordAdapter } from '../src/server/monitoring/discord';
import { getSampleSnapshot } from '../src/lib/samples';
import { PROTOCOLS } from '../src/lib/protocols';

const at = new Date('2026-09-20T01:00:00.000Z');
const owner = '00000000-0000-4000-8000-000000000001';
const ruleId = '00000000-0000-4000-8000-000000000002';
const destinationId = '00000000-0000-4000-8000-000000000003';
const rule: DbRule = { id: ruleId, owner_id: owner, authority: '11111111111111111111111111111111', subaccount_id: 0, version: 1, threshold: '300', direction: 'below', cadence_minutes: 1, timezone: 'UTC', cooldown_minutes: 5, hysteresis: '10', destination_id: destinationId, enabled: true, last_attempt_at: at.toISOString(), last_fresh_check: null, input_expires_at: null, next_check: null, monitoring_state: 'configured', last_error: null, created_at: at.toISOString(), updated_at: at.toISOString(), check_token: destinationId, runtime_state: null };
function snapshot() { return { ...getSampleSnapshot('long-short'), protocol: PROTOCOLS.velocity, source: 'live' as const, network: 'mainnet-beta' as const, authority: rule.authority, subaccount: { id: 0, name: 'Primary', address: rule.authority }, retrievedAt: at.toISOString(), expiresAt: new Date(at.getTime() + 120000).toISOString(), risk: { scope: 'cross-margin' as const, totalCollateral: '1200', maintenanceRequirement: '950', maintenanceHeadroom: '250', canBeLiquidated: false, status: 'clear' as const, explanation: 'Current SDK observation.' } }; }
const work: DbWork = { outbox: { id: '00000000-0000-4000-8000-000000000004', owner_id: owner, lease_token: destinationId, attempts: 0 }, destination: { id: destinationId, owner_id: owner, config_ref: destinationId, provider: 'discord', fingerprint: 'a'.repeat(64), label: 'Test destination', masked_destination: 'Discord …0123', enabled: true, verified_at: at.toISOString() },
  event: { id: '00000000-0000-4000-8000-000000000005', rule_id: ruleId, rule_version: 1, owner_id: owner, state: 'queued', observed_at: at.toISOString(), value: '250', threshold: '300', reason: 'Threshold crossed.', accepted_at: null, delivered_at: null, provider_message_id: null, provider_channel_id: null, content_hash: null, destination_fingerprint: 'a'.repeat(64), preview: null,
    observation: { mode: 'test', ruleId, ruleVersion: 1, provider: 'velocity', network: 'mainnet-beta', authority: rule.authority, subaccountId: 0, subaccountName: 'Primary', metric: 'maintenance_headroom', unit: 'USD', direction: 'below', sourceSlot: 12 } } };
function setup(responses: Record<string, unknown> = {}) {
  const calls: Array<{ action: string; data?: Record<string, unknown> }> = [];
  const repository: WorkerRepository = { async command<T>(action: string, data?: Record<string, unknown>) { calls.push({ action, data }); if (action === 'next_work') return (responses.next_work ?? (data?.sendEnabled ? responses.claim_receipt ? { kind: 'receipt', work: responses.claim_receipt } : { kind: 'delivery', work } : { kind: 'check', work: rule })) as T; return ({ start: { duplicate: false }, claim_check: rule, complete_check: { available: true }, claim_delivery: work, claim_receipt: null, begin_send: { send: true }, ...responses }[action]) as T; } };
  const adapter: DiscordAdapter = { listDestinations: vi.fn<DiscordAdapter['listDestinations']>(() => [{ id: destinationId, provider: 'discord', label: 'Test destination', maskedDestination: 'Discord …0123', fingerprint: 'a'.repeat(64) }]), preview: vi.fn<DiscordAdapter['preview']>(() => ({ destination: { id: destinationId, provider: 'discord', label: 'Test destination', maskedDestination: 'Discord …0123', fingerprint: 'a'.repeat(64) }, content: 'Verified event preview', contentHash: 'a'.repeat(64) })), verifyDestination: vi.fn(), send: vi.fn<DiscordAdapter['send']>(async (_owner, _destination, _event, beforePost) => { if (beforePost && !await beforePost()) return { kind: 'permanent', errorCode: 'DELIVERY_CANCELLED' }; return { kind: 'accepted', messageId: '123456789012345678', channelId: '234567890123456789', contentHash: 'a'.repeat(64), acceptedAt: at.toISOString() }; }), receipt: vi.fn<DiscordAdapter['receipt']>(async () => ({ kind: 'delivered', messageId: '123456789012345678', channelId: '234567890123456789', contentHash: 'a'.repeat(64), receivedAt: at.toISOString() })) };
  return { calls, repository, adapter, snapshot: vi.fn(async () => snapshot()), sendEnabled: false, now: () => at };
}
describe('hosted monitoring coordinator', () => {
  it('uses a new provider fetch and the shared episode evaluator while default dry run never sends', async () => {
    const deps = setup();
    const result = await runMonitoringWorker(deps, { runKey: 'cron:1' });
    expect(deps.snapshot).toHaveBeenCalledWith(rule.authority, 0);
    const evaluation = deps.calls.find(call => call.action === 'complete_check')!.data!;
    expect(evaluation.event).toMatchObject({ value: '250', observedAt: at.toISOString() });
    expect(evaluation.observation).toMatchObject({ mode: 'test', provider: 'velocity', network: 'mainnet-beta' });
    expect(deps.adapter.send).not.toHaveBeenCalled(); expect(deps.adapter.receipt).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mode: 'dry_run', checked: true, available: true });
  });
  it('sends a fresh queued episode on the next tick even after a valid slow provider read', async () => {
    let current = at.getTime();
    const deps = setup({ next_work: { kind: 'check', work: rule } }); deps.sendEnabled = true; deps.now = () => new Date(current);
    deps.snapshot.mockImplementation(async () => { current += 11_000; return { ...snapshot(), retrievedAt: new Date(current).toISOString(), expiresAt: new Date(current+120000).toISOString() }; });
    const first = await runMonitoringWorker(deps, { runKey: 'cron:1' });
    expect(first).toMatchObject({ checked: true, available: true, delivery: null });
    expect(deps.adapter.send).not.toHaveBeenCalled();
    const next = setup({ next_work: { kind: 'delivery', work } }); next.sendEnabled = true; next.now = () => new Date(current+60_000);
    expect((await runMonitoringWorker(next, { runKey: 'cron:2' })).delivery).toBe('accepted_by_provider');
    expect(next.snapshot).not.toHaveBeenCalled(); expect(next.adapter.send).toHaveBeenCalledTimes(1);
  });
  it('rejects stale, incomplete, isolated, fixture and wrong-account observations without replacing timestamps', () => {
    const input = snapshot();
    for (const bad of [{ ...input, source: 'sample' as const }, { ...input, network: 'fixture' as const }, { ...input, authority: destinationId }, { ...input, subaccount: { ...input.subaccount, id: 1 } }, { ...input, retrievedAt: new Date(at.getTime() - 120000).toISOString(), expiresAt: null }, { ...input, risk: undefined }, { ...input, risk: { ...input.risk, maintenanceHeadroom: '251' } }, { ...input, positions: [{ ...input.positions[0], isolated: true }] }]) {
      const evaluated = evaluateHostedRule(rule, bad, at);
      expect(evaluated).toHaveProperty('problem'); expect(evaluated).not.toHaveProperty('event');
    }
  });
  it('retains a prior breached episode through unavailable provider recovery', () => {
    const first = evaluateHostedRule(rule, snapshot(), at);
    if (!('monitor' in first) || !first.monitor) throw new Error('Expected observation');
    const later = new Date(at.getTime() + 60000);
    const next = evaluateHostedRule({ ...rule, runtime_state: first.monitor }, { ...snapshot(), retrievedAt: later.toISOString(), expiresAt: new Date(later.getTime()+120000).toISOString() }, later);
    expect(next).toHaveProperty('event', null);
    expect(next).toHaveProperty('monitor.breached', true);
  });
  it('quarantines corrupt runtime state instead of resetting deduplication and emitting again', () => {
    const first = evaluateHostedRule(rule, snapshot(), at);
    if (!('monitor' in first) || !first.monitor) throw new Error('Expected observation');
    const corrupt = { ...first.monitor, episode: -1 };
    const result = evaluateHostedRule({ ...rule, runtime_state: corrupt }, snapshot(), at);
    expect(result).toHaveProperty('problem', 'Saved monitoring state failed validation. Existing events are preserved; an administrator must repair this rule.');
    expect(result).not.toHaveProperty('event');
  });
  it('does not read providers or transmit again for a replayed scheduler key', async () => {
    const deps = setup({ start: { duplicate: true } });
    expect((await runMonitoringWorker(deps, { runKey: 'cron:1' })).duplicate).toBe(true);
    expect(deps.snapshot).not.toHaveBeenCalled(); expect(deps.calls).toHaveLength(1);
  });
  it('records transmission intent before one provider POST and treats acceptance separately from receipt', async () => {
    const deps = setup(); deps.sendEnabled = true;
    vi.mocked(deps.adapter.send).mockImplementation(async (_owner, _destination, _event, beforePost) => { await beforePost?.(); expect(deps.calls.at(-1)?.action).toBe('begin_send'); return { kind: 'accepted', messageId: '123456789012345678', channelId: '234567890123456789', contentHash: 'a'.repeat(64), acceptedAt: at.toISOString() }; });
    const result = await runMonitoringWorker(deps, { runKey: 'cron:1' });
    expect(result.delivery).toBe('accepted_by_provider');
    expect(deps.calls.find(call => call.action === 'finish_send')?.data).toMatchObject({ state: 'accepted_by_provider', messageId: '123456789012345678' });
    expect(deps.adapter.receipt).not.toHaveBeenCalled();
  });
  it('does not POST when a pause/version change fences preflight', async () => {
    const deps = setup({ begin_send: { send: false } }); deps.sendEnabled = true;
    expect((await runMonitoringWorker(deps, { runKey: 'cron:1' })).delivery).toBe('suppressed');
    expect(deps.calls.some(call => call.action === 'finish_send')).toBe(false);
  });
  it('marks uncertain provider outcomes without retry and recovers only the DB commit', async () => {
    const deps = setup(); deps.sendEnabled = true;
    vi.mocked(deps.adapter.send).mockImplementation(async (_owner, _destination, _event, beforePost) => { await beforePost?.(); throw new Error('Connection ended after write.'); });
    const original = deps.repository.command; let finishes = 0;
    deps.repository.command = async function<T>(action: string, data?: Record<string, unknown>) { if (action === 'finish_send' && finishes++ === 0) throw new Error('Transient DB outage'); return original<T>(action, data); };
    expect((await runMonitoringWorker(deps, { runKey: 'cron:1' })).delivery).toBe('unknown_outcome');
    expect(deps.adapter.send).toHaveBeenCalledTimes(1); expect(finishes).toBe(2);
    expect(deps.calls.find(call => call.action === 'finish_send')?.data).toMatchObject({ state: 'unknown_outcome', retryable: false });
  });
  it('requires configured credential identity to match the persisted destination', async () => {
    const deps = setup(); deps.sendEnabled = true;
    vi.mocked(deps.adapter.listDestinations).mockReturnValue([]);
    await runMonitoringWorker(deps, { runKey: 'cron:1' });
    expect(deps.adapter.send).not.toHaveBeenCalled();
    expect(deps.calls.some(call => call.action === 'suppress_delivery')).toBe(true);
  });
  it('reconciles an accepted message in a separate pass without another POST', async () => {
    const receipt = structuredClone(work); receipt.event.provider_message_id = '123456789012345678';
    const deps = setup({ claim_receipt: receipt }); deps.sendEnabled = true;
    const result = await runMonitoringWorker(deps, { runKey: 'cron:2' });
    expect(result.receipt).toBe('delivered'); expect(deps.adapter.send).not.toHaveBeenCalled();
    expect(deps.calls.find(call => call.action === 'finish_receipt')?.data).toMatchObject({ state: 'delivered', messageId: '123456789012345678' });
  });
  it('binds manual fresh checks to the authenticated owner/rule and reports provider failures', async () => {
    const deps = setup({ complete_check: { available: false } }); deps.snapshot.mockRejectedValue(new Error('RPC unavailable'));
    const result = await runMonitoringWorker(deps, { runKey: `manual:${ruleId}`, ownerId: owner, ruleId });
    expect(deps.calls.find(call => call.action === 'next_work')?.data).toMatchObject({ ownerId: owner, ruleId, sendEnabled: false });
    expect(result.available).toBe(false);
    expect(deps.calls.find(call => call.action === 'complete_check')?.data).not.toHaveProperty('monitor');
  });
});
