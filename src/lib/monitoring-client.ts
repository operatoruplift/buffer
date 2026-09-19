import Decimal from 'decimal.js';
import { MONITORING_UUID, type MonitoringOverview } from './monitoring';
import { getSupabase } from './supabase';
import { persistedAuthSession, sameAuthSession, sessionIdentity, type AuthSessionIdentity } from './auth-storage';

const AUTH_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown, max = 500): value is string => typeof value === 'string' && value.length <= max;
const date = (value: unknown) => value === null || text(value, 40) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const member = (value: unknown, values: string[]) => typeof value === 'string' && values.includes(value);
const uuid = (value: unknown) => text(value, 36) && MONITORING_UUID.test(value);
const decimal = (value: unknown) => {
  if (!text(value, 128) || !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return false;
  try { return new Decimal(value).isFinite(); } catch { return false; }
};
const integer = (value: unknown, max = 10080) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max;

/** Validate server responses before replacing the visible owner-bound state. */
export function parseMonitoringOverview(value: unknown): MonitoringOverview {
  if (!object(value) || !object(value.capability) || !object(value.heartbeat)) throw new Error('Monitoring returned an invalid response.');
  const capability = value.capability;
  const heartbeat = value.heartbeat;
  if (!['configured', 'sendEnabled', 'destinationAvailable'].every(key => typeof capability[key] === 'boolean') || !text(capability.message) ||
      !date(heartbeat.lastRunAt) || !date(heartbeat.lastCompletedAt) || !member(heartbeat.status, ['awaiting_activation', 'healthy', 'unavailable']) ||
      !member(heartbeat.mode, ['dry_run', 'send'])) throw new Error('Monitoring readiness could not be verified.');
  if (!Array.isArray(value.destinations) || value.destinations.length > 20 || !value.destinations.every(item => object(item) && uuid(item.id) &&
      item.provider === 'discord' && text(item.label, 100) && text(item.maskedDestination, 100) && date(item.verifiedAt) && typeof item.enabled === 'boolean')) {
    throw new Error('Monitoring destinations could not be verified.');
  }
  if (!Array.isArray(value.rules) || value.rules.length > 20 || !value.rules.every(item => object(item) && uuid(item.id) && uuid(item.destinationId) &&
      integer(item.version, Number.MAX_SAFE_INTEGER) && Number(item.version) > 0 && text(item.authority, 44) && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(item.authority) &&
      integer(item.subaccountId, 65535) && item.provider === 'velocity' && item.network === 'mainnet-beta' && item.metric === 'maintenance_headroom' && item.unit === 'USD' &&
      member(item.direction, ['below', 'above']) && decimal(item.threshold) && decimal(item.hysteresis) && new Decimal(item.hysteresis as string).gte(0) &&
      integer(item.cadenceMinutes, 1440) && Number(item.cadenceMinutes) > 0 && integer(item.cooldownMinutes, 1440) && Number(item.cooldownMinutes) > 0 && text(item.timezone, 80) &&
      typeof item.enabled === 'boolean' && typeof item.breached === 'boolean' && member(item.monitoringState, ['configured', 'fresh', 'unavailable', 'paused']) &&
      ['lastAttemptAt', 'lastFreshCheck', 'inputExpiresAt', 'nextCheckAt', 'createdAt', 'updatedAt'].every(key => date(item[key])) && item.createdAt !== null && item.updatedAt !== null && (item.lastError === null || text(item.lastError)))) {
    throw new Error('Monitoring rules could not be verified.');
  }
  if (!Array.isArray(value.events) || value.events.length > 100 || !value.events.every(item => object(item) && uuid(item.id) && (item.ruleId === null || uuid(item.ruleId)) &&
      integer(item.ruleVersion, Number.MAX_SAFE_INTEGER) && Number(item.ruleVersion) > 0 && member(item.state, ['queued', 'sending', 'accepted_by_provider', 'delivered', 'failed', 'suppressed', 'unknown_outcome']) &&
      date(item.observedAt) && item.observedAt !== null && decimal(item.value) && decimal(item.threshold) && text(item.reason) && date(item.acceptedAt) && date(item.deliveredAt) &&
      (item.messageId === null || text(item.messageId, 22) && /^\d{17,22}$/.test(item.messageId)) && integer(item.attempts, 20) &&
      (item.lastError === null || text(item.lastError)) && (item.preview === null || text(item.preview, 2000)) &&
      (!member(item.state, ['accepted_by_provider', 'delivered']) || item.messageId !== null && item.acceptedAt !== null) &&
      (item.state !== 'delivered' || item.deliveredAt !== null))) {
    throw new Error('Monitoring events could not be verified.');
  }
  for (const entries of [value.destinations, value.rules, value.events]) {
    if (new Set(entries.map(item => item.id)).size !== entries.length) throw new Error('Monitoring returned duplicate identifiers.');
  }
  return value as unknown as MonitoringOverview;
}

export async function requestMonitoring(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body: unknown,
  expected: AuthSessionIdentity, signal: AbortSignal): Promise<MonitoringOverview> {
  if (!/^\/api\/monitoring(?:\/rules(?:\/[0-9a-f-]{36}(?:\/check)?)?)?$/.test(path)) throw new Error('Invalid monitoring operation.');
  const db = getSupabase();
  const current = () => !signal.aborted && sameAuthSession(persistedAuthSession(AUTH_URL), expected);
  if (!db || !current()) throw new Error('Sign in again before changing monitoring.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, 45_000);
  let rejectAbort: (() => void) | undefined;
  try {
    const cancelled = new Promise<never>((_, reject) => { rejectAbort = () => reject(new Error('The monitoring request ended. Try again.')); controller.signal.addEventListener('abort', rejectAbort, { once: true }); });
    const { data, error } = await Promise.race([db.auth.getSession(), cancelled]);
    if (error || !data.session || !sameAuthSession(sessionIdentity(data.session), expected) || !current()) throw new Error('The account session changed. Reload monitoring.');
    const response = await fetch(path, { method, cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.body) throw new Error('Monitoring returned an empty response.');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 131_072) { await reader.cancel(); throw new Error('Monitoring returned too much data.'); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('Monitoring returned an invalid response.'); }
    if (!current()) throw new Error('The account session changed. Reload monitoring.');
    if (!response.ok) {
      const message = object(value) && object(value.error) && text(value.error.message, 300) ? value.error.message : 'Monitoring is temporarily unavailable. Try again.';
      throw new Error(message);
    }
    return parseMonitoringOverview(value);
  } finally {
    window.clearTimeout(timeout); signal.removeEventListener('abort', abort);
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
  }
}
