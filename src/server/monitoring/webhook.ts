import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { DiscordEvent, DiscordPermanent, DiscordRetry, DiscordSendResult, DiscordReceipt, DiscordVerification } from './discord';
import { renderNotificationFields } from './discord';

/**
 * Signed webhook destinations. Like Discord destinations, every URL and secret
 * is server configuration allowlisted per owner; the browser never supplies a
 * URL. A 2xx acknowledgement is this destination's delivery receipt because a
 * generic receiver has no message read-back; the worker records `delivered`
 * directly from `send`.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 64 * 1024;
const MAX_RETRY_MS = 60 * 60 * 1000;
const ACK_ID = /^[A-Za-z0-9._:-]{1,120}$/;
export const WEBHOOK_SIGNATURE_HEADER = 'X-Buffer-Signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'X-Buffer-Timestamp';
export const WEBHOOK_EVENT_HEADER = 'X-Buffer-Event';
export const WEBHOOK_USER_AGENT = 'Buffer-Alerts/1.0 (+https://bufferonsolana.vercel.app)';

export interface WebhookDestination {
  id: string;
  provider: 'webhook';
  label: string;
  maskedDestination: string;
  /** Credential-identity commitment. Never use this as authorization. */
  fingerprint: string;
}
export interface WebhookPreview { destination: WebhookDestination; content: string; contentHash: string }
export interface WebhookAdapter {
  listDestinations(ownerId: string): WebhookDestination[];
  preview(ownerId: string, destinationId: string, event: DiscordEvent): WebhookPreview;
  verifyDestination(ownerId: string, destinationId: string): Promise<DiscordVerification>;
  /** Hosted callers persist their fenced sending intent in beforePost. */
  send(ownerId: string, destinationId: string, event: DiscordEvent, beforePost?: () => Promise<boolean>): Promise<DiscordSendResult>;
  receipt(ownerId: string, destinationId: string, event: DiscordEvent, messageId: string): Promise<DiscordReceipt>;
}
interface Configuration { id: string; label: string; url: string; secret: string; ownerIds: string[] }
interface Options { configuration?: string; fetch?: typeof fetch; now?: () => number; random?: () => number; timeoutMs?: number }
type JsonObject = Record<string, unknown>;

/** Only fixed, credential-free errors may cross this server boundary. */
export class WebhookConfigurationError extends Error {
  readonly code = 'WEBHOOK_CONFIGURATION_INVALID';
  constructor() { super('Webhook destination configuration is invalid.'); this.name = 'WebhookConfigurationError'; }
}
function record(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function safeText(value: string, limit: number): string {
  return value.normalize('NFKC').replace(/[^\p{L}\p{N} .,'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
/** Public HTTPS origins only: no IP literals, loopback, link-local, private suffixes, credentials, ports, queries or fragments. */
export function acceptableWebhookUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 512) return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.href !== value) return false;
  if (!host || isIP(host.replace(/^\[|\]$/g, '')) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return false;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return false;
  return true;
}
function parseConfiguration(raw: string | undefined): Configuration[] {
  if (!raw?.trim()) return [];
  if (raw.length > MAX_BYTES) throw new WebhookConfigurationError();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new WebhookConfigurationError(); }
  if (!Array.isArray(parsed) || parsed.length > 32) throw new WebhookConfigurationError();
  const ids = new Set<string>();
  return parsed.map(item => {
    if (!record(item) || Object.keys(item).some(key => !['id', 'label', 'url', 'secret', 'ownerIds'].includes(key)) ||
      typeof item.id !== 'string' || !UUID.test(item.id) || ids.has(item.id.toLowerCase()) ||
      typeof item.label !== 'string' || !item.label.trim() || item.label.length > 80 || !safeText(item.label, 80) ||
      !acceptableWebhookUrl(item.url) || typeof item.secret !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(item.secret) ||
      !Array.isArray(item.ownerIds) || !item.ownerIds.length || item.ownerIds.length > 100 ||
      item.ownerIds.some(owner => typeof owner !== 'string' || !UUID.test(owner))) throw new WebhookConfigurationError();
    const id = item.id.toLowerCase();
    ids.add(id);
    return { id, label: safeText(item.label, 80), url: item.url, secret: item.secret, ownerIds: [...new Set((item.ownerIds as string[]).map(owner => owner.toLowerCase()))].sort() };
  });
}
function descriptor(config: Configuration): WebhookDestination {
  return { id: config.id, provider: 'webhook', label: config.label, maskedDestination: `Webhook ${new URL(config.url).hostname}`,
    fingerprint: hash(JSON.stringify([config.id, config.url, config.secret, config.ownerIds])) };
}
/** The signed body: fixed field order, validated through the shared notification renderer. */
export function renderWebhookPayload(event: DiscordEvent): string {
  const fields = renderNotificationFields(event);
  return JSON.stringify({ type: 'buffer.alert', version: 1, mode: fields.mode, event: { id: fields.eventId, ruleId: fields.ruleId, ruleVersion: fields.ruleVersion },
    scope: { provider: fields.provider, network: fields.network, authority: fields.authority, subaccountId: fields.subaccountId, subaccountName: fields.subaccountName },
    metric: { name: fields.metric, label: fields.label, unit: fields.unit, market: fields.market, direction: fields.direction, value: fields.value, threshold: fields.threshold },
    observedAt: fields.observedAt, sourceSlot: fields.sourceSlot, link: fields.link });
}
/** `v1=` HMAC-SHA256 over `${timestamp}.${body}`; receivers compare in constant time and reject old timestamps. */
export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  return `v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}
function delay(random: () => number, base = 1000): number {
  const value = random();
  const jitter = Math.floor((Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0) * 250);
  return Math.min(MAX_RETRY_MS, Math.max(1000, base) + jitter);
}
function retryAfter(header: string | null, random: () => number): DiscordRetry | DiscordPermanent {
  if (header === null) return { kind: 'retry', retryAfterMs: delay(random, 30_000), errorCode: 'WEBHOOK_RATE_LIMITED' };
  if (!/^\d{1,6}$/.test(header)) return { kind: 'permanent', errorCode: 'INVALID_RETRY_AFTER' };
  const seconds = Number(header);
  if (seconds * 1000 > MAX_RETRY_MS) return { kind: 'permanent', errorCode: 'INVALID_RETRY_AFTER' };
  return { kind: 'retry', retryAfterMs: delay(random, seconds * 1000), errorCode: 'WEBHOOK_RATE_LIMITED' };
}
async function ackId(response: Response, signal: AbortSignal): Promise<string> {
  const header = response.headers.get('x-buffer-receipt') ?? response.headers.get('x-request-id');
  const fallback = `http-${response.status}`;
  if (header && ACK_ID.test(header)) { void response.body?.cancel().catch(() => undefined); return header; }
  if (!response.body) return fallback;
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) { void response.body.cancel().catch(() => undefined); return fallback; }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_BYTES) return fallback;
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return record(body) && typeof body.id === 'string' && ACK_ID.test(body.id) ? body.id : fallback;
  } catch { return fallback; }
  finally { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export function createWebhookAdapter(options: Options = {}): WebhookAdapter {
  const configs = parseConfiguration(options.configuration ?? process.env.BUFFER_WEBHOOK_DESTINATIONS_JSON);
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const timeoutMs = options.timeoutMs ?? 6000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 6000) throw new WebhookConfigurationError();
  const lookup = (ownerId: string, id: string) => typeof ownerId === 'string' && UUID.test(ownerId) && typeof id === 'string'
    ? configs.find(item => item.id === id.toLowerCase() && item.ownerIds.includes(ownerId.toLowerCase())) : undefined;
  const unavailable: DiscordPermanent = { kind: 'permanent', errorCode: 'DESTINATION_UNAVAILABLE' };
  const preview = (ownerId: string, id: string, event: DiscordEvent): WebhookPreview => {
    const config = lookup(ownerId, id);
    if (!config) throw new WebhookConfigurationError();
    const content = renderWebhookPayload(event);
    return { destination: descriptor(config), content, contentHash: hash(content) };
  };
  return {
    listDestinations(ownerId) { return typeof ownerId === 'string' && UUID.test(ownerId) ? configs.filter(item => item.ownerIds.includes(ownerId.toLowerCase())).map(descriptor) : []; },
    preview,
    /** Verification is configuration policy only: no request is made until a real event is sent. */
    async verifyDestination(ownerId, id) {
      const config = lookup(ownerId, id);
      if (!config) return unavailable;
      return { kind: 'verified', destinationId: config.id, channelId: 'webhook', fingerprint: descriptor(config).fingerprint, verifiedAt: new Date(now()).toISOString() };
    },
    async send(ownerId, id, event, beforePost) {
      const config = lookup(ownerId, id);
      if (!config) return unavailable;
      let rendered: WebhookPreview;
      try { rendered = preview(ownerId, id, event); } catch { return { kind: 'permanent', errorCode: 'INVALID_NOTIFICATION' }; }
      if (beforePost) {
        try { if (!await beforePost()) return { kind: 'permanent', errorCode: 'DELIVERY_CANCELLED' }; }
        catch { return { kind: 'permanent', errorCode: 'DELIVERY_PREPARATION_FAILED' }; }
      }
      const timestamp = Math.floor(now() / 1000);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let transmitted = false;
      try {
        transmitted = true;
        const response = await fetcher(config.url, { method: 'POST', cache: 'no-store', redirect: 'error', signal: controller.signal, body: rendered.content,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': WEBHOOK_USER_AGENT,
            [WEBHOOK_EVENT_HEADER]: event.eventId.toLowerCase(), [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp), [WEBHOOK_SIGNATURE_HEADER]: signWebhookPayload(config.secret, timestamp, rendered.content) } });
        if (response.redirected || (response.url && response.url !== config.url) || (response.status >= 300 && response.status < 400)) {
          void response.body?.cancel().catch(() => undefined);
          return { kind: 'unknown', errorCode: 'REDIRECT_REJECTED' };
        }
        if (response.status === 429) { void response.body?.cancel().catch(() => undefined); return retryAfter(response.headers.get('retry-after'), random); }
        if (response.status >= 400 && response.status < 500 && response.status !== 408) { void response.body?.cancel().catch(() => undefined); return { kind: 'permanent', errorCode: `WEBHOOK_HTTP_${response.status}` }; }
        if (response.status < 200 || response.status >= 300) { void response.body?.cancel().catch(() => undefined); return { kind: 'retry', retryAfterMs: delay(random, 60_000), errorCode: `WEBHOOK_HTTP_${response.status}` }; }
        return { kind: 'accepted', messageId: await ackId(response, controller.signal), channelId: 'webhook', acceptedAt: new Date(now()).toISOString(), contentHash: rendered.contentHash };
      } catch {
        return transmitted ? { kind: 'unknown', errorCode: controller.signal.aborted ? 'TIMEOUT' : 'WEBHOOK_SEND_OUTCOME_UNKNOWN' } : { kind: 'permanent', errorCode: 'WEBHOOK_SEND_FAILED' };
      } finally { clearTimeout(timer); }
    },
    /** Generic receivers offer no message read-back; delivery was recorded on acknowledgement. */
    async receipt(ownerId, id) {
      const config = lookup(ownerId, id);
      if (!config) return unavailable;
      return { kind: 'permanent', errorCode: 'RECEIPT_NOT_APPLICABLE' };
    },
  };
}
