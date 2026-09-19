import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AlertMonitor } from '@/lib/alerts';
import type { DiscordEvent } from './discord';

export class MonitoringFailure extends Error {
  constructor(readonly code: string, message: string, readonly status = 503, readonly retryable = false) { super(message); }
}
export interface DbRule {
  id: string; owner_id: string; version: number; authority: string; subaccount_id: number;
  direction: 'below' | 'above'; threshold: string | number; cadence_minutes: number; timezone: string;
  cooldown_minutes: number; hysteresis: string | number; destination_id: string; enabled: boolean;
  last_attempt_at: string | null; last_fresh_check: string | null; input_expires_at: string | null;
  next_check: string | null; monitoring_state: 'configured' | 'fresh' | 'unavailable' | 'paused';
  last_error: string | null; created_at: string; updated_at: string;
  check_token?: string; runtime_state: AlertMonitor | null;
}
export interface DbDestination { id: string; owner_id: string; config_ref: string; provider: 'discord'; fingerprint: string; label: string; masked_destination: string; enabled: boolean; verified_at: string | null }
export interface DbEvent {
  id: string; rule_id: string | null; rule_version: number; owner_id: string; state: string;
  observed_at: string; value: string | number; threshold: string | number; reason: string;
  observation: Omit<DiscordEvent, 'eventId' | 'value' | 'threshold' | 'observedAt'>;
  accepted_at: string | null; delivered_at: string | null; provider_message_id: string | null;
  provider_channel_id: string | null; content_hash: string | null; destination_fingerprint: string;
  preview: string | null; last_error?: string | null; attempts?: number;
}
export interface DbWork { outbox: { id: string; owner_id: string; lease_token: string; attempts: number }; event: DbEvent; destination: DbDestination }
export interface DbOverview {
  rules: DbRule[]; destinations: DbDestination[]; events: DbEvent[];
  heartbeat: { started_at: string; completed_at: string | null; outcome: string; mode: 'dry_run' | 'send' } | null;
}
export interface WorkerRepository { command<T>(action: string, data?: Record<string, unknown>): Promise<T> }
export function monitoringConfigured() { return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.BUFFER_ALERT_WORKER_SECRET && process.env.SOLANA_RPC_URL); }
export function sendsEnabled() { return process.env.BUFFER_ALERT_SEND_ENABLED === 'true'; }
export const monitoringFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(input, { ...init, cache: 'no-store', redirect: 'error', signal: controller.signal });
    if (!response.body) return response;
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        total += next.value.byteLength;
        if (total > 262144) throw new Error('Monitoring response exceeds its bound.');
        chunks.push(next.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const headers = new Headers(response.headers); headers.delete('content-length'); headers.delete('content-encoding');
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers });
  } finally { clearTimeout(timeout); }
};
function databaseClient(token?: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new MonitoringFailure('MONITORING_NOT_CONFIGURED', 'Cloud monitoring is awaiting server configuration.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname)) throw new MonitoringFailure('MONITORING_NOT_CONFIGURED', 'Cloud monitoring configuration is unavailable.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {}, fetch: monitoringFetch },
  });
}
export async function authenticateMonitoring(request: Request): Promise<{ ownerId: string; client: SupabaseClient }> {
  const match = /^Bearer ([A-Za-z0-9._-]{40,4096})$/.exec(request.headers.get('authorization') ?? '');
  if (!match) throw new MonitoringFailure('AUTH_REQUIRED', 'Sign in to configure background monitoring.', 401);
  const client = databaseClient(match[1]);
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user?.id) throw new MonitoringFailure('AUTH_REQUIRED', 'Your session expired. Sign in again.', 401);
  return { ownerId: data.user.id, client };
}
export async function ownerRpc<T>(client: SupabaseClient, name: 'buffer_monitor_status' | 'buffer_monitor_mutate', params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(name, params);
  if (error) {
    if (error.code === '23505') throw new MonitoringFailure('RULE_ALREADY_EXISTS', 'This account already has a monitoring rule. Reload monitoring to review or edit it.', 409);
    if (error.code === 'P0002') throw new MonitoringFailure('RULE_NOT_FOUND', 'That rule is no longer available to this account.', 404);
    if (['22023', '22P02', '23514', '23502'].includes(error.code)) throw new MonitoringFailure('INVALID_RULE', 'Check the rule fields and verified destination.', 400);
    if (error.code === '42501') throw new MonitoringFailure('AUTH_REQUIRED', 'This session cannot access those settings.', 403);
    throw new MonitoringFailure('MONITORING_UNAVAILABLE', 'Cloud monitoring storage is temporarily unavailable.', 503, true);
  }
  return data as T;
}
export function workerRepository(): WorkerRepository {
  const secret = process.env.BUFFER_ALERT_WORKER_SECRET;
  if (!secret || secret.length < 32 || secret.length > 256) throw new MonitoringFailure('WORKER_NOT_CONFIGURED', 'The background worker is awaiting server configuration.');
  const client = databaseClient();
  return { async command<T>(action: string, data: Record<string, unknown> = {}) {
    const { data: result, error } = await client.rpc('buffer_monitor_worker', { p_secret: secret, p_action: action, p_data: data });
    if (error) throw new MonitoringFailure('WORKER_STORAGE_UNAVAILABLE', 'The protected monitoring worker could not persist its operation.', 503, true);
    return result as T;
  } };
}
