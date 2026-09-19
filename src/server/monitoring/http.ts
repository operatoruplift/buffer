import 'server-only';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MonitoringDeliveryState, MonitoringOverview } from '@/lib/monitoring';
import { resolveProvider } from '@/server/providers';
import { consumeSharedLimit } from '@/server/rate-limit';
import { createDiscordAdapter } from './discord';
import { notificationEvent, runMonitoringWorker } from './coordinator';
import { authenticateMonitoring, monitoringConfigured, MonitoringFailure, ownerRpc, sendsEnabled, workerRepository, type DbOverview } from './repository';
import { readRuleBody, validateRuleId, validateRuleInput } from './validation';

const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: HEADERS });
async function safe(action: () => Promise<Response>): Promise<Response> {
  try { return await action(); }
  catch (error) {
    const failure = error instanceof MonitoringFailure ? error : new MonitoringFailure('MONITORING_UNAVAILABLE', 'Monitoring could not complete this request. Please retry.', 503, true);
    return response({ error: { code: failure.code, message: failure.message, retryable: failure.retryable } }, failure.status);
  }
}
let localWindow = 0; let localRequests = 0;
async function ingress(request: Request) {
  const limit = await consumeSharedLimit(request, 'monitoring', 30);
  if (!limit) { if (Date.now() - localWindow >= 60_000) { localWindow = Date.now(); localRequests = 0; } localRequests += 1; if (localRequests > 60) throw new MonitoringFailure('RATE_LIMITED', 'Monitoring is busy. Wait a minute and retry.', 429, true); }
  if (limit && !limit.allowed) throw new MonitoringFailure('RATE_LIMITED', 'Too many monitoring requests. Wait a minute and retry.', 429, true);
}
async function overview(ownerId: string, client: SupabaseClient, verify = false): Promise<MonitoringOverview> {
  const adapter = createDiscordAdapter();
  const configured = monitoringConfigured();
  let raw = await ownerRpc<DbOverview>(client, 'buffer_monitor_status');
  const configuredDestinations = adapter.listDestinations(ownerId);
  if (verify && configured) {
    // One platform-admin destination per owner, with provider ownership verified
    // by a metadata GET. No POST notification is sent by configuration/status.
    const descriptor = configuredDestinations[0];
    const existing = raw.destinations.find(item => item.config_ref === descriptor?.id);
    if (descriptor && (!existing || existing.fingerprint !== descriptor.fingerprint || !existing.enabled || !existing.verified_at || Date.now() - Date.parse(existing.verified_at) > 3_600_000)) {
      const verification = await adapter.verifyDestination(ownerId, descriptor.id);
      if (verification.kind === 'verified') {
        await workerRepository().command('destination', { ownerId, configRef: descriptor.id, fingerprint: verification.fingerprint, label: descriptor.label, maskedDestination: descriptor.maskedDestination });
      } else if (existing && verification.kind === 'permanent') await workerRepository().command('destination_unavailable', { ownerId });
      raw = await ownerRpc<DbOverview>(client, 'buffer_monitor_status');
    }
  }
  const destinations = raw.destinations.map(item => ({ id: item.id, provider: 'discord' as const, label: item.label, maskedDestination: item.masked_destination,
    verifiedAt: item.verified_at, enabled: item.enabled && configuredDestinations.some(descriptor => descriptor.id === item.config_ref && descriptor.fingerprint === item.fingerprint) }));
  const available = destinations.some(item => item.enabled && item.verifiedAt !== null);
  const heartbeat = raw.heartbeat;
  const healthy = heartbeat && heartbeat.outcome === 'ok' && heartbeat.completed_at && Date.now() - Date.parse(heartbeat.started_at) < 180_000;
  const eventPreview = (event: DbOverview['events'][number]) => {
    if (event.preview) return event.preview;
    const destination = raw.destinations.find(item => item.id === raw.rules.find(rule => rule.id === event.rule_id)?.destination_id);
    const descriptor = configuredDestinations.find(item => item.id === destination?.config_ref && item.fingerprint === event.destination_fingerprint);
    if (!descriptor) return null;
    try { return adapter.preview(ownerId, descriptor.id, notificationEvent(event)).content; } catch { return null; }
  };
  const state = (value: string): MonitoringDeliveryState => value === 'claimed' ? 'queued' : value as MonitoringDeliveryState;
  return {
    capability: { configured, sendEnabled: sendsEnabled(), destinationAvailable: available,
      message: !configured ? 'Background monitoring is awaiting server configuration.' : !available ? 'An administrator must connect a verified Discord destination for this account.' : !sendsEnabled() ? 'Rules and fresh checks are available. Outbound delivery is awaiting activation.' : 'Discord monitoring is configured. Check the worker heartbeat and message receipt below.' },
    heartbeat: { lastRunAt: heartbeat?.started_at ?? null, lastCompletedAt: heartbeat?.completed_at ?? null, status: !heartbeat ? 'awaiting_activation' : healthy ? 'healthy' : 'unavailable', mode: heartbeat?.mode ?? 'dry_run' },
    destinations,
    rules: raw.rules.map(rule => ({ id: rule.id, version: rule.version, authority: rule.authority, subaccountId: rule.subaccount_id,
      provider: 'velocity', network: 'mainnet-beta', metric: 'maintenance_headroom', unit: 'USD', direction: rule.direction, threshold: String(rule.threshold),
      cadenceMinutes: rule.cadence_minutes, timezone: rule.timezone, cooldownMinutes: rule.cooldown_minutes, hysteresis: String(rule.hysteresis),
      destinationId: rule.destination_id, enabled: rule.enabled, monitoringState: rule.monitoring_state, lastAttemptAt: rule.last_attempt_at,
      lastFreshCheck: rule.last_fresh_check, inputExpiresAt: rule.input_expires_at, nextCheckAt: rule.next_check, lastError: rule.last_error,
      breached: rule.runtime_state?.breached ?? false, createdAt: rule.created_at, updatedAt: rule.updated_at })),
    events: raw.events.sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at)).map(event => ({ id: event.id, ruleId: event.rule_id, ruleVersion: event.rule_version, state: state(event.state),
      observedAt: event.observed_at, value: String(event.value), threshold: String(event.threshold), reason: event.reason,
      acceptedAt: event.accepted_at, deliveredAt: event.delivered_at, messageId: event.provider_message_id, lastError: event.last_error ?? null, attempts: event.attempts ?? 0, preview: eventPreview(event) })),
  };
}
export async function getMonitoring(request: Request) { return safe(async () => {
  await ingress(request);
  const session = await authenticateMonitoring(request);
  return response(await overview(session.ownerId, session.client, true));
}); }
export async function mutateMonitoring(request: Request, action: 'create' | 'update' | 'delete', id?: string) { return safe(async () => {
  await ingress(request);
  const session = await authenticateMonitoring(request);
  const ruleId = id ? validateRuleId(id) : null;
  const body = action === 'delete' ? {} : validateRuleInput(await readRuleBody(request), action === 'update');
  await ownerRpc(session.client, 'buffer_monitor_mutate', { p_action: action, p_id: ruleId, p_config: body });
  return response(await overview(session.ownerId, session.client));
}); }
export async function freshMonitoringCheck(request: Request, id: string) { return safe(async () => {
  await ingress(request);
  const session = await authenticateMonitoring(request); const ruleId = validateRuleId(id);
  const raw = await ownerRpc<DbOverview>(session.client, 'buffer_monitor_status');
  if (!raw.rules.some(rule => rule.id === ruleId && rule.enabled)) throw new MonitoringFailure('RULE_NOT_FOUND', 'An enabled rule for this account is required.', 404);
  const result = await runMonitoringWorker({ repository: workerRepository(), adapter: createDiscordAdapter(), sendEnabled: false, notificationMode: process.env.BUFFER_ALERT_NOTIFICATION_MODE === 'production' ? 'production' : 'test',
    snapshot: async (authority, subaccount) => (await resolveProvider('velocity')).snapshot(authority, subaccount) }, { runKey: `manual:${randomUUID()}`, ownerId: session.ownerId, ruleId });
  if (!result.checked) throw new MonitoringFailure('CHECK_NOT_DUE', 'A check is already running or this rule was checked within the last minute.', 429, true);
  return response(await overview(session.ownerId, session.client));
}); }
export function validCronAuthorization(request: Request): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured || configured.length < 32 || configured.length > 256) return false;
  const received = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${configured}`;
  const receivedBytes = Buffer.from(received); const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}
export async function scheduledMonitoring(request: Request) { return safe(async () => {
  if (!validCronAuthorization(request)) throw new MonitoringFailure('WORKER_AUTH_REQUIRED', 'A valid scheduler credential is required.', 401);
  // The database admits one scheduled invocation per minute across all instances.
  const result = await runMonitoringWorker({ repository: workerRepository(), adapter: createDiscordAdapter(), sendEnabled: sendsEnabled(), notificationMode: process.env.BUFFER_ALERT_NOTIFICATION_MODE === 'production' ? 'production' : 'test',
    snapshot: async (authority, subaccount) => (await resolveProvider('velocity')).snapshot(authority, subaccount) }, { runKey: `cron:${Math.floor(Date.now() / 60_000)}` });
  return response(result);
}); }

/** A fixed, non-sensitive HEAD envelope for the database scheduler transport. */
function monitoringResultHeader(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const keys = ['duplicate', 'mode', 'checked', 'available', 'delivery', 'receipt'];
  if (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key)) ||
      typeof result.duplicate !== 'boolean' || typeof result.checked !== 'boolean' ||
      (result.available !== null && typeof result.available !== 'boolean') ||
      (result.mode !== 'dry_run' && result.mode !== 'send') ||
      ![null, 'suppressed', 'failed', 'accepted_by_provider', 'unknown_outcome'].includes(result.delivery as string | null) ||
      ![null, 'destination_unavailable', 'delivered', 'pending', 'permanent'].includes(result.receipt as string | null)) return null;
  const encoded = JSON.stringify({ duplicate: result.duplicate, mode: result.mode, checked: result.checked,
    available: result.available, delivery: result.delivery, receipt: result.receipt });
  return Buffer.byteLength(encoded, 'utf8') <= 512 ? encoded : null;
}
export async function headScheduledMonitoring(request: Request): Promise<Response> {
  const executed = await scheduledMonitoring(request);
  const headers = new Headers(executed.headers);
  headers.delete('content-length');
  headers.delete('X-Buffer-Monitoring-Result');
  if (executed.status !== 200) {
    await executed.body?.cancel().catch(() => undefined);
    return new Response(null, { status: executed.status, headers });
  }
  let encoded: string | null = null;
  try { encoded = monitoringResultHeader(await executed.json()); } catch { /* Fail closed if the result envelope changes. */ }
  if (!encoded) return new Response(null, { status: 503, headers });
  headers.set('X-Buffer-Monitoring-Result', encoded);
  return new Response(null, { status: 200, headers });
}
