import { alertInputProblem, emptyAlertStore, evaluateAlerts, parseAlertStore, type AlertRule } from '@/lib/alerts';
import type { Snapshot } from '@/lib/types';
import type { DiscordAdapter, DiscordEvent } from './discord';
import type { DbEvent, DbRule, DbWork, WorkerRepository } from './repository';

export interface WorkerDependencies {
  repository: WorkerRepository; adapter: DiscordAdapter;
  snapshot(authority: string, subaccount: number): Promise<Snapshot>;
  sendEnabled: boolean; notificationMode?: 'test' | 'production'; now?: () => Date;
}
export interface WorkerResult { duplicate: boolean; mode: 'dry_run' | 'send'; checked: boolean; available: boolean | null; delivery: string | null; receipt: string | null }
export function notificationEvent(event: DbEvent): DiscordEvent {
  return { ...event.observation, eventId: event.id, ruleId: event.observation.ruleId,
    value: String(event.value), threshold: String(event.threshold), observedAt: event.observed_at };
}
function localRule(rule: DbRule): AlertRule {
  return { id: rule.id, version: rule.version, ownerId: rule.owner_id, authority: rule.authority, subaccountId: rule.subaccount_id,
    metric: 'maintenance_headroom', direction: rule.direction, threshold: String(rule.threshold), cadenceMinutes: rule.cadence_minutes,
    timezone: rule.timezone, destination: 'mock', enabled: rule.enabled, createdAt: rule.created_at, updatedAt: rule.updated_at,
    cooldownMinutes: rule.cooldown_minutes, hysteresis: String(rule.hysteresis) };
}
/** Shared pure evaluator; the provider observation is never restamped or changed into fixture data. */
export function evaluateHostedRule(rule: DbRule, snapshot: Snapshot, now: Date, mode: 'test' | 'production' = 'production') {
  const problem = snapshot.authority !== rule.authority || snapshot.subaccount.id !== rule.subaccount_id ? 'The observation does not match the configured account.' : alertInputProblem(snapshot, now);
  if (problem) return { ruleId: rule.id, token: rule.check_token, version: rule.version, problem };
  const input = emptyAlertStore();
  input.rules = [localRule(rule)]; input.monitors = rule.runtime_state ? [rule.runtime_state] : [];
  try { parseAlertStore(JSON.stringify(input)); }
  catch { return { ruleId: rule.id, token: rule.check_token, version: rule.version, problem: 'Saved monitoring state failed validation. Existing events are preserved; an administrator must repair this rule.' }; }
  const evaluated = evaluateAlerts(input, snapshot, rule.owner_id, now);
  const observation: Omit<DiscordEvent, 'eventId' | 'value' | 'threshold' | 'observedAt'> = {
    mode, ruleId: rule.id, ruleVersion: rule.version, provider: 'velocity', network: 'mainnet-beta', authority: rule.authority,
    subaccountId: rule.subaccount_id, subaccountName: snapshot.subaccount.name.slice(0, 160), metric: 'maintenance_headroom', unit: 'USD',
    direction: rule.direction, sourceSlot: snapshot.accountSlot,
  };
  return { ruleId: rule.id, token: rule.check_token, version: rule.version, monitor: evaluated.monitors[0], event: evaluated.events[0] ?? null, observation };
}
async function boundedObservation(read: () => Promise<Snapshot>): Promise<Snapshot> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Provider deadline exceeded.')), 20_000); })]); }
  finally { clearTimeout(timer); }
}
async function recordSend(repository: WorkerRepository, data: Record<string, unknown>) {
  try { await repository.command('finish_send', data); }
  catch { // Retrying the fenced DB commit never repeats the provider POST.
    await repository.command('finish_send', data);
  }
}
type NextWork = { kind: 'check'; work: DbRule } | { kind: 'delivery' | 'receipt'; work: DbWork } | null;
export async function runMonitoringWorker(dependencies: WorkerDependencies, input: { runKey: string; ownerId?: string; ruleId?: string }): Promise<WorkerResult> {
  const { repository, adapter } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const started = now().getTime();
  const mode = dependencies.sendEnabled ? 'send' : 'dry_run';
  const result: WorkerResult = { duplicate: false, mode, checked: false, available: null, delivery: null, receipt: null };
  const start = await repository.command<{ duplicate: boolean }>('start', { runKey: input.runKey, mode, ownerId: input.ownerId });
  if (start.duplicate) return { ...result, duplicate: true };
  let outcome = 'ok';
  try {
    // Fresh queued notifications have a 120-second deadline; receipts do not.
    // Atomic selection prioritizes delivery, then receipt, then a new account
    // observation. Slow valid provider reads cannot consume a delivery's turn.
    const selected = await repository.command<NextWork>('next_work', { ownerId: input.ownerId, ruleId: input.ruleId, sendEnabled: dependencies.sendEnabled });
    if (selected?.kind === 'check') {
      const rule = selected.work;
      result.checked = true;
      let evaluation: ReturnType<typeof evaluateHostedRule>;
      try { evaluation = evaluateHostedRule(rule, await boundedObservation(() => dependencies.snapshot(rule.authority, rule.subaccount_id)), now(), dependencies.notificationMode ?? 'test'); }
      catch { evaluation = { ruleId: rule.id, token: rule.check_token, version: rule.version, problem: 'The current provider observation could not be verified. Retry after the next scheduled check.' }; }
      const completed = await repository.command<{ available?: boolean; fenced?: boolean }>('complete_check', evaluation);
      result.available = completed.available ?? false;
      if (!result.available) outcome = 'unavailable';
    } else if (selected?.kind === 'receipt' && dependencies.sendEnabled) {
      const receipt = selected.work;
      const descriptor = adapter.listDestinations(receipt.event.owner_id).find(item => item.id === receipt.destination.config_ref && item.fingerprint === receipt.event.destination_fingerprint);
      if (!descriptor || !receipt.event.provider_message_id) {
        await repository.command('finish_receipt', { outboxId: receipt.outbox.id, token: receipt.outbox.lease_token, state: 'pending', permanent: true, errorCode: 'DESTINATION_CHANGED' });
        result.receipt = 'destination_unavailable';
      } else {
        const observed = await adapter.receipt(receipt.event.owner_id, descriptor.id, notificationEvent(receipt.event), receipt.event.provider_message_id);
        await repository.command('finish_receipt', { outboxId: receipt.outbox.id, token: receipt.outbox.lease_token,
          ...(observed.kind === 'delivered' ? { state: 'delivered', messageId: observed.messageId, channelId: observed.channelId, contentHash: observed.contentHash } : { state: 'pending', permanent: observed.kind === 'permanent', retryAfterMs: observed.kind === 'pending' ? observed.retryAfterMs : null, errorCode: observed.errorCode }) });
        result.receipt = observed.kind;
      }
    } else if (selected?.kind === 'delivery' && dependencies.sendEnabled) {
      const work = selected.work;
      const descriptor = adapter.listDestinations(work.event.owner_id).find(item => item.id === work.destination.config_ref && item.fingerprint === work.event.destination_fingerprint);
      if (!descriptor) {
        await repository.command('suppress_delivery', { outboxId: work.outbox.id, token: work.outbox.lease_token, reason: 'The verified destination configuration changed.' });
        result.delivery = 'suppressed';
      } else {
        const event = notificationEvent(work.event);
        const preview = adapter.preview(work.event.owner_id, descriptor.id, event);
        let transmissionStarted = false; let preflightFenced = false; let sent;
        try {
          sent = await adapter.send(work.event.owner_id, descriptor.id, event, async () => {
            const prepared = await repository.command<{ send: boolean }>('begin_send', { outboxId: work.outbox.id, token: work.outbox.lease_token, fingerprint: descriptor.fingerprint, preview: preview.content });
            transmissionStarted = prepared.send; preflightFenced = !prepared.send;
            return prepared.send;
          });
        } catch { sent = transmissionStarted ? { kind: 'unknown' as const, errorCode: 'PROVIDER_OUTCOME_UNKNOWN' } : { kind: 'permanent' as const, errorCode: 'PROVIDER_PREPARATION_FAILED' }; }
        if (preflightFenced) result.delivery = 'suppressed';
        else if (!transmissionStarted) {
          await repository.command('fail_delivery', { outboxId: work.outbox.id, token: work.outbox.lease_token, retryable: sent.kind === 'retry', retryAfterMs: sent.kind === 'retry' ? sent.retryAfterMs : null, errorCode: 'errorCode' in sent ? sent.errorCode : 'TRANSMISSION_INTENT_MISSING' });
          result.delivery = 'failed';
        } else {
          const state = sent.kind === 'accepted' ? 'accepted_by_provider' : sent.kind === 'unknown' ? 'unknown_outcome' : 'failed';
          await recordSend(repository, { outboxId: work.outbox.id, token: work.outbox.lease_token, state,
            ...(sent.kind === 'accepted' ? { messageId: sent.messageId, channelId: sent.channelId, contentHash: sent.contentHash } : { retryable: sent.kind === 'retry', retryAfterMs: sent.kind === 'retry' ? sent.retryAfterMs : null, errorCode: sent.errorCode }) });
          result.delivery = state;
        }
      }
    }
    return result;
  } catch (error) { outcome = 'unavailable'; throw error; }
  finally {
    if (now().getTime() - started < 38_000) await repository.command('prune');
    await repository.command('end', { runKey: input.runKey, outcome });
  }
}
