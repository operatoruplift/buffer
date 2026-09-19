import 'server-only';
import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^-?(?:0|[1-9]\d{0,59})(?:\.\d{1,18})?$/;
const MAX_BYTES = 64 * 1024;
const MAX_RETRY_MS = 60 * 60 * 1000;
const APP_URL = 'https://bufferonsolana.vercel.app/app';

export interface DiscordEvent {
  mode: 'test' | 'production';
  eventId: string;
  ruleId: string;
  ruleVersion: number;
  provider: 'velocity';
  network: 'mainnet-beta';
  authority: string;
  subaccountId: number;
  subaccountName: string;
  metric: 'maintenance_headroom';
  unit: 'USD';
  direction: 'below' | 'above';
  value: string;
  threshold: string;
  observedAt: string;
  sourceSlot: number | null;
}

export interface DiscordDestination {
  id: string;
  provider: 'discord';
  label: string;
  maskedDestination: string;
  /** Credential-identity commitment. Never use this as authorization. */
  fingerprint: string;
}
export type DiscordRetry = { kind: 'retry'; retryAfterMs: number; errorCode: string };
export type DiscordPermanent = { kind: 'permanent'; errorCode: string };
export type DiscordVerification = { kind: 'verified'; destinationId: string; channelId: string; verifiedAt: string; fingerprint: string } | DiscordRetry | DiscordPermanent;
export type DiscordSendResult = { kind: 'accepted'; messageId: string; channelId: string; acceptedAt: string; contentHash: string } | DiscordRetry | DiscordPermanent | { kind: 'unknown'; errorCode: string };
export type DiscordReceipt = { kind: 'delivered'; messageId: string; channelId: string; receivedAt: string; contentHash: string } | { kind: 'pending'; retryAfterMs: number; errorCode: string } | DiscordPermanent;
export interface DiscordPreview { destination: DiscordDestination; content: string; contentHash: string }
export interface DiscordAdapter {
  listDestinations(ownerId: string): DiscordDestination[];
  preview(ownerId: string, destinationId: string, event: DiscordEvent): DiscordPreview;
  verifyDestination(ownerId: string, destinationId: string): Promise<DiscordVerification>;
  /** Hosted callers persist their fenced sending intent in beforePost. */
  send(ownerId: string, destinationId: string, event: DiscordEvent, beforePost?: () => Promise<boolean>): Promise<DiscordSendResult>;
  receipt(ownerId: string, destinationId: string, event: DiscordEvent, messageId: string): Promise<DiscordReceipt>;
}
interface Configuration {
  id: string; label: string; webhookId: string; webhookToken: string; channelId: string; ownerIds: string[];
}
interface Options {
  configuration?: string;
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  timeoutMs?: number;
}
type JsonObject = Record<string, unknown>;
type TransportResult = { status: number | null; body: unknown; retryAfter: string | null; failure?: string };

/** Only fixed, credential-free errors may cross this server boundary. */
export class DiscordConfigurationError extends Error {
  readonly code = 'DISCORD_CONFIGURATION_INVALID';
  constructor() { super('Discord destination configuration is invalid.'); this.name = 'DiscordConfigurationError'; }
}
class InvalidEvent extends Error {
  constructor() { super('Discord notification data is invalid.'); this.name = 'InvalidDiscordEvent'; }
}
function record(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function snowflake(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
}
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function safeText(value: string, limit: number): string {
  return value.normalize('NFKC').replace(/[^\p{L}\p{N} .,'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
function parseConfiguration(raw: string | undefined): Configuration[] {
  if (!raw?.trim()) return [];
  if (raw.length > MAX_BYTES) throw new DiscordConfigurationError();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new DiscordConfigurationError(); }
  if (!Array.isArray(parsed) || parsed.length > 32) throw new DiscordConfigurationError();
  const ids = new Set<string>();
  return parsed.map(item => {
    if (!record(item) || Object.keys(item).some(key => !['id', 'label', 'webhookId', 'webhookToken', 'channelId', 'ownerIds'].includes(key)) ||
      typeof item.id !== 'string' || !UUID.test(item.id) || ids.has(item.id.toLowerCase()) ||
      typeof item.label !== 'string' || !item.label.trim() || item.label.length > 80 || !safeText(item.label, 80) ||
      !snowflake(item.webhookId) || !snowflake(item.channelId) || typeof item.webhookToken !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(item.webhookToken) ||
      !Array.isArray(item.ownerIds) || !item.ownerIds.length || item.ownerIds.length > 100 ||
      item.ownerIds.some(owner => typeof owner !== 'string' || !UUID.test(owner))) throw new DiscordConfigurationError();
    const id = item.id.toLowerCase();
    ids.add(id);
    return { id, label: safeText(item.label, 80), webhookId: item.webhookId, webhookToken: item.webhookToken, channelId: item.channelId,
      ownerIds: [...new Set((item.ownerIds as string[]).map(owner => owner.toLowerCase()))].sort() };
  });
}
function descriptor(config: Configuration): DiscordDestination {
  return { id: config.id, provider: 'discord', label: config.label, maskedDestination: `Discord channel …${config.channelId.slice(-4)}`,
    fingerprint: hash(JSON.stringify([config.id, config.webhookId, config.webhookToken, config.channelId, config.ownerIds])) };
}
function isoDate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  // Date.parse normalizes impossible dates such as February 30; reject those.
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0, 10) === value.slice(0, 10);
}
function render(event: DiscordEvent): string {
  if (!record(event) || !['test', 'production'].includes(event.mode) || !UUID.test(event.eventId) || !UUID.test(event.ruleId) ||
    !Number.isSafeInteger(event.ruleVersion) || event.ruleVersion < 1 || event.provider !== 'velocity' || event.network !== 'mainnet-beta' ||
    event.metric !== 'maintenance_headroom' || event.unit !== 'USD' || !['below', 'above'].includes(event.direction) ||
    typeof event.value !== 'string' || !DECIMAL.test(event.value) || typeof event.threshold !== 'string' || !DECIMAL.test(event.threshold) ||
    !isoDate(event.observedAt) || !Number.isSafeInteger(event.subaccountId) || event.subaccountId < 0 || event.subaccountId > 65535 ||
    typeof event.subaccountName !== 'string' || event.subaccountName.length > 160 || typeof event.authority !== 'string' ||
    event.authority.length > 44 || (event.sourceSlot !== null && (!Number.isSafeInteger(event.sourceSlot) || event.sourceSlot < 0))) throw new InvalidEvent();
  try { if (new PublicKey(event.authority).toBase58() !== event.authority) throw new Error(); } catch { throw new InvalidEvent(); }
  const name = safeText(event.subaccountName, 80) || 'Account';
  const link = new URL(APP_URL);
  link.searchParams.set('protocol', event.provider);
  link.searchParams.set('authority', event.authority);
  link.searchParams.set('subaccount', String(event.subaccountId));
  link.searchParams.set('alert', event.eventId.toLowerCase());
  link.hash = 'monitoring';
  return [`Buffer | ${event.mode === 'test' ? 'TEST' : 'PRODUCTION'} alert`,
    'Velocity / Solana mainnet | Maintenance headroom',
    `Account: ${event.authority.slice(0, 4)}…${event.authority.slice(-4)} | ${name} (#${event.subaccountId})`,
    `Observed: ${event.value} USD`, `Threshold: at or ${event.direction} ${event.threshold} USD`,
    `Observed at: ${new Date(event.observedAt).toISOString()}`, `Source slot: ${event.sourceSlot ?? 'Unavailable'}`,
    `Event: ${event.eventId.toLowerCase()}`, `Rule: ${event.ruleId.toLowerCase()} | Version: ${event.ruleVersion}`,
    `Open Buffer: ${link.href}`].join('\n');
}

/** No caller-supplied URL, authorization header, automatic retry or remote error text. */
async function request(fetcher: typeof fetch, url: string, timeoutMs: number, content?: string): Promise<TransportResult> {
  const controller = new AbortController();
  let status: number | null = null;
  let retryAfter: string | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, timeoutMs);
  });
  const operation = async (): Promise<TransportResult> => {
    const response = await fetcher(url, { method: content === undefined ? 'GET' : 'POST', cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'DiscordBot (https://bufferonsolana.vercel.app, 1.0.0)' },
      ...(content === undefined ? {} : { body: JSON.stringify({ content, allowed_mentions: { parse: [] }, flags: 4, tts: false }) }) });
    status = response.status;
    retryAfter = response.headers.get('retry-after');
    if (response.redirected || (response.url && response.url !== url) || (status >= 300 && status < 400)) {
      void response.body?.cancel().catch(() => undefined);
      return { status, retryAfter, body: null, failure: 'REDIRECT_REJECTED' };
    }
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) {
      void response.body?.cancel().catch(() => undefined);
      return { status, retryAfter, body: null, failure: 'RESPONSE_TOO_LARGE' };
    }
    if (!response.body) return { status, retryAfter, body: null, failure: 'INVALID_RESPONSE' };
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    controller.signal.addEventListener('abort', cancel, { once: true });
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        controller.signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > MAX_BYTES) return { status, retryAfter, body: null, failure: 'RESPONSE_TOO_LARGE' };
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body: unknown;
      try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { return { status, retryAfter, body: null, failure: 'INVALID_RESPONSE' }; }
      return { status, retryAfter, body };
    } finally { controller.signal.removeEventListener('abort', cancel); cancel(); reader.releaseLock(); }
  };
  try { return await Promise.race([operation(), expired]); }
  catch { return { status, retryAfter, body: null, failure: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_FAILURE' }; }
  finally { if (timeout) clearTimeout(timeout); }
}
function delay(random: () => number, base = 1000): number {
  const value = random();
  const jitter = Math.floor((Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0) * 250);
  return Math.min(MAX_RETRY_MS, Math.max(1000, base) + jitter);
}
function rateLimit(result: TransportResult, random: () => number): DiscordRetry | DiscordPermanent {
  const rawBody = record(result.body) ? result.body.retry_after : undefined;
  const values: number[] = [];
  if (result.retryAfter !== null) {
    if (!/^\d+(?:\.\d+)?$/.test(result.retryAfter)) return { kind: 'permanent', errorCode: 'INVALID_RETRY_AFTER' };
    values.push(Number(result.retryAfter));
  }
  if (rawBody !== undefined) {
    if (typeof rawBody !== 'number') return { kind: 'permanent', errorCode: 'INVALID_RETRY_AFTER' };
    values.push(rawBody);
  }
  if (!values.length || values.some(seconds => !Number.isFinite(seconds) || seconds < 0 || seconds * 1000 > MAX_RETRY_MS)) return { kind: 'permanent', errorCode: 'INVALID_RETRY_AFTER' };
  return { kind: 'retry', retryAfterMs: delay(random, Math.ceil(Math.max(...values) * 1000)), errorCode: 'DISCORD_RATE_LIMITED' };
}
function failure(result: TransportResult, sending: boolean, random: () => number): DiscordRetry | DiscordPermanent | { kind: 'unknown'; errorCode: string } | null {
  if (result.status === 429) return rateLimit(result, random);
  if (result.status !== null && result.status >= 400 && result.status < 500 && result.status !== 408) return { kind: 'permanent', errorCode: `DISCORD_HTTP_${result.status}` };
  if (result.failure || result.status === null || result.status < 200 || result.status >= 300) {
    if (sending) return { kind: 'unknown', errorCode: 'DISCORD_SEND_OUTCOME_UNKNOWN' };
    if (result.failure === 'REDIRECT_REJECTED' || result.failure === 'RESPONSE_TOO_LARGE' || result.failure === 'INVALID_RESPONSE') return { kind: 'permanent', errorCode: result.failure };
    return { kind: 'retry', retryAfterMs: delay(random), errorCode: 'DISCORD_READ_UNAVAILABLE' };
  }
  return null;
}
function matchesMessage(body: unknown, config: Configuration, content: string, messageId?: string): body is JsonObject & { id: string } {
  return record(body) && snowflake(body.id) && (!messageId || body.id === messageId) && body.channel_id === config.channelId &&
    body.webhook_id === config.webhookId && body.content === content && isoDate(body.timestamp) && body.edited_timestamp === null &&
    body.mention_everyone === false && Array.isArray(body.mentions) && body.mentions.length === 0 && Array.isArray(body.mention_roles) && body.mention_roles.length === 0;
}

export function createDiscordAdapter(options: Options = {}): DiscordAdapter {
  const configs = parseConfiguration(options.configuration ?? process.env.BUFFER_DISCORD_DESTINATIONS_JSON);
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const timeoutMs = options.timeoutMs ?? 6000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 6000) throw new DiscordConfigurationError();
  const lookup = (ownerId: string, id: string) => typeof ownerId === 'string' && UUID.test(ownerId) && typeof id === 'string'
    ? configs.find(item => item.id === id.toLowerCase() && item.ownerIds.includes(ownerId.toLowerCase())) : undefined;
  const endpoint = (config: Configuration) => `https://discord.com/api/v10/webhooks/${config.webhookId}/${config.webhookToken}`;
  const unavailable: DiscordPermanent = { kind: 'permanent', errorCode: 'DESTINATION_UNAVAILABLE' };
  const preview = (ownerId: string, id: string, event: DiscordEvent): DiscordPreview => {
    const config = lookup(ownerId, id);
    if (!config) throw new DiscordConfigurationError();
    const content = render(event);
    return { destination: descriptor(config), content, contentHash: hash(content) };
  };
  const verifyDestination = async (ownerId: string, id: string): Promise<DiscordVerification> => {
    const config = lookup(ownerId, id);
    if (!config) return unavailable;
    const result = await request(fetcher, endpoint(config), timeoutMs);
    const problem = failure(result, false, random);
    if (problem) return problem.kind === 'unknown' ? { kind: 'retry', errorCode: 'DISCORD_READ_UNAVAILABLE', retryAfterMs: delay(random) } : problem;
    if (!record(result.body) || result.body.id !== config.webhookId || result.body.channel_id !== config.channelId || result.body.type !== 1) return { kind: 'permanent', errorCode: 'DESTINATION_MISMATCH' };
    return { kind: 'verified', destinationId: config.id, channelId: config.channelId, fingerprint: descriptor(config).fingerprint, verifiedAt: new Date(now()).toISOString() };
  };
  return {
    listDestinations(ownerId) { return typeof ownerId === 'string' && UUID.test(ownerId) ? configs.filter(item => item.ownerIds.includes(ownerId.toLowerCase())).map(descriptor) : []; },
    preview,
    verifyDestination,
    async send(ownerId, id, event, beforePost) {
      const config = lookup(ownerId, id);
      if (!config) return unavailable;
      let rendered: DiscordPreview;
      try { rendered = preview(ownerId, id, event); } catch { return { kind: 'permanent', errorCode: 'INVALID_NOTIFICATION' }; }
      const verified = await verifyDestination(ownerId, id);
      if (verified.kind !== 'verified') return verified;
      if (beforePost) {
        try { if (!await beforePost()) return { kind: 'permanent', errorCode: 'DELIVERY_CANCELLED' }; }
        catch { return { kind: 'permanent', errorCode: 'DELIVERY_PREPARATION_FAILED' }; }
      }
      const result = await request(fetcher, `${endpoint(config)}?wait=true`, timeoutMs, rendered.content);
      const problem = failure(result, true, random);
      if (problem) return problem;
      if (!matchesMessage(result.body, config, rendered.content)) return { kind: 'unknown', errorCode: 'DISCORD_ACCEPTANCE_UNVERIFIED' };
      return { kind: 'accepted', messageId: result.body.id, channelId: config.channelId, acceptedAt: new Date(now()).toISOString(), contentHash: rendered.contentHash };
    },
    async receipt(ownerId, id, event, messageId) {
      const config = lookup(ownerId, id);
      if (!config) return unavailable;
      if (!snowflake(messageId)) return { kind: 'permanent', errorCode: 'INVALID_MESSAGE_ID' };
      let rendered: DiscordPreview;
      try { rendered = preview(ownerId, id, event); } catch { return { kind: 'permanent', errorCode: 'INVALID_NOTIFICATION' }; }
      const result = await request(fetcher, `${endpoint(config)}/messages/${messageId}`, timeoutMs);
      const problem = failure(result, false, random);
      if (problem) return problem.kind === 'permanent' ? problem : { kind: 'pending', errorCode: problem.errorCode, retryAfterMs: problem.kind === 'retry' ? problem.retryAfterMs : delay(random) };
      if (!matchesMessage(result.body, config, rendered.content, messageId)) return { kind: 'permanent', errorCode: 'RECEIPT_MISMATCH' };
      return { kind: 'delivered', messageId, channelId: config.channelId, receivedAt: new Date(now()).toISOString(), contentHash: rendered.contentHash };
    },
  };
}
