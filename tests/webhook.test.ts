import { createHmac, timingSafeEqual } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type { DiscordEvent } from '../src/server/monitoring/discord';
import { createDiscordAdapter } from '../src/server/monitoring/discord';
import { createNotificationAdapter } from '../src/server/monitoring/notification';
import { acceptableWebhookUrl, createWebhookAdapter, renderWebhookPayload, signWebhookPayload, WebhookConfigurationError, WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER } from '../src/server/monitoring/webhook';

const owner = '10000000-0000-4000-8000-000000000001';
const otherOwner = '10000000-0000-4000-8000-000000000002';
const destination = '20000000-0000-4000-8000-000000000002';
const secret = 'synthetic_test_only_webhook_secret_with_no_external_access';
const url = 'https://alerts.example.com/hooks/buffer';
const config = { id: destination, label: 'Risk desk', url, secret, ownerIds: [owner] };
const now = Date.parse('2026-09-28T10:00:00.000Z');
const event: DiscordEvent = {
  mode: 'test', eventId: '30000000-0000-4000-8000-000000000001', ruleId: '40000000-0000-4000-8000-000000000001', ruleVersion: 2,
  provider: 'velocity', network: 'mainnet-beta', authority: '8vXZp5DRsAKGv6QwfqKjZ2MQgMT6arfYYpoCqAN2b9aw',
  subaccountId: 0, subaccountName: 'Main account', metric: 'liquidation_distance', unit: '%', market: 'SOL-PERP', direction: 'below',
  value: '4.250000000000000001', threshold: '5', observedAt: '2026-09-28T09:59:40.000Z', sourceSlot: 448360065,
};
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
function fixture(fetcher = vi.fn<typeof fetch>()) {
  const adapter = createWebhookAdapter({ configuration: JSON.stringify([config]), fetch: fetcher, now: () => now, random: () => 0.5 });
  return { adapter, fetcher, preview: adapter.preview(owner, destination, event) };
}
afterEach(() => vi.unstubAllEnvs());

describe('signed webhook destination boundary', () => {
  it('lists nothing for other owners and never contacts a URL for them', async () => {
    const { adapter, fetcher } = fixture();
    expect(adapter.listDestinations(otherOwner)).toEqual([]);
    expect(adapter.listDestinations('not-a-uuid')).toEqual([]);
    expect(await adapter.send(otherOwner, destination, event)).toEqual({ kind: 'permanent', errorCode: 'DESTINATION_UNAVAILABLE' });
    expect(await adapter.verifyDestination(otherOwner, destination)).toEqual({ kind: 'permanent', errorCode: 'DESTINATION_UNAVAILABLE' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts only public HTTPS hostnames without credentials, ports, queries or fragments', () => {
    for (const good of ['https://alerts.example.com/hooks/buffer', 'https://a.b.example.org/', 'https://x1.example.co.uk/path/to/hook']) expect(acceptableWebhookUrl(good)).toBe(true);
    for (const bad of ['http://alerts.example.com/hook', 'https://127.0.0.1/hook', 'https://[::1]/hook', 'https://10.0.0.5/hook', 'https://localhost/hook', 'https://alerts.localhost/hook',
      'https://printer.local/hook', 'https://svc.internal/hook', 'https://user:pass@alerts.example.com/hook', 'https://alerts.example.com:8443/hook', 'https://alerts.example.com/hook?x=1',
      'https://alerts.example.com/hook#frag', 'https://example/hook', 'ftp://alerts.example.com/', 'https://alerts.example.com/hook ', 42, null]) expect(acceptableWebhookUrl(bad)).toBe(false);
  });
  it('rejects malformed, oversized, weak-secret and duplicate configuration with a constant error', () => {
    const attempt = (configuration: unknown) => () => createWebhookAdapter({ configuration: typeof configuration === 'string' ? configuration : JSON.stringify(configuration) });
    expect(attempt('{')).toThrow(WebhookConfigurationError);
    expect(attempt([{ ...config, secret: 'short' }])).toThrow(WebhookConfigurationError);
    expect(attempt([{ ...config, url: 'http://alerts.example.com/hook' }])).toThrow(WebhookConfigurationError);
    expect(attempt([{ ...config, extra: true }])).toThrow(WebhookConfigurationError);
    expect(attempt([{ ...config, ownerIds: [] }])).toThrow(WebhookConfigurationError);
    expect(attempt([config, config])).toThrow(WebhookConfigurationError);
    expect(attempt(Array.from({ length: 33 }, (_, index) => ({ ...config, id: `2000000${index.toString().padStart(1, '0')}-0000-4000-8000-00000000000${index % 10}` })))).toThrow(WebhookConfigurationError);
    expect(createWebhookAdapter({ configuration: '' }).listDestinations(owner)).toEqual([]);
    try { attempt([{ ...config, secret: 'short' }])(); } catch (error) { expect(String(error)).not.toContain(secret); expect(String(error)).not.toContain(url); }
  });
  it('exposes only a redacted descriptor whose fingerprint changes on rotation', () => {
    const [descriptor] = fixture().adapter.listDestinations(owner);
    expect(descriptor).toMatchObject({ id: destination, provider: 'webhook', label: 'Risk desk', maskedDestination: 'Webhook alerts.example.com' });
    expect(JSON.stringify(descriptor)).not.toContain(secret);
    expect(JSON.stringify(descriptor)).not.toContain('/hooks/buffer');
    const rotated = createWebhookAdapter({ configuration: JSON.stringify([{ ...config, secret: `${secret}_rotated` }]) }).listDestinations(owner)[0];
    expect(rotated.fingerprint).not.toBe(descriptor.fingerprint);
  });
});

describe('signed webhook delivery', () => {
  it('renders a fixed JSON payload that a receiver can verify with HMAC-SHA256 over timestamp.body', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({ id: 'ack-7' }));
    const { adapter, preview } = fixture(fetcher);
    const payload = JSON.parse(preview.content);
    expect(payload).toMatchObject({ type: 'buffer.alert', version: 1, mode: 'test', metric: { name: 'liquidation_distance', unit: '%', market: 'SOL-PERP', value: '4.250000000000000001', threshold: '5', direction: 'below' } });
    expect(payload.link).toContain('#monitoring');
    expect(preview.content).toBe(renderWebhookPayload(event));
    const result = await adapter.send(owner, destination, event);
    expect(result).toEqual({ kind: 'accepted', messageId: 'ack-7', channelId: 'webhook', acceptedAt: new Date(now).toISOString(), contentHash: preview.contentHash });
    const [target, init] = fetcher.mock.calls[0];
    expect(target).toBe(url);
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', body: preview.content });
    const headers = init!.headers as Record<string, string>;
    const timestamp = Number(headers[WEBHOOK_TIMESTAMP_HEADER]);
    expect(timestamp).toBe(Math.floor(now / 1000));
    // Receiver-side verification, exactly as documented.
    const expected = `v1=${createHmac('sha256', secret).update(`${timestamp}.${init!.body}`).digest('hex')}`;
    expect(timingSafeEqual(Buffer.from(headers[WEBHOOK_SIGNATURE_HEADER]), Buffer.from(expected))).toBe(true);
    expect(headers[WEBHOOK_SIGNATURE_HEADER]).toBe(signWebhookPayload(secret, timestamp, preview.content));
    expect(JSON.stringify(init)).not.toContain(secret);
  });
  it('runs the durable guard before the single POST and does not post when it declines or fails', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({}));
    const { adapter } = fixture(fetcher);
    expect(await adapter.send(owner, destination, event, async () => false)).toEqual({ kind: 'permanent', errorCode: 'DELIVERY_CANCELLED' });
    expect(await adapter.send(owner, destination, event, async () => { throw new Error('db down'); })).toEqual({ kind: 'permanent', errorCode: 'DELIVERY_PREPARATION_FAILED' });
    expect(fetcher).not.toHaveBeenCalled();
    const order: string[] = [];
    fetcher.mockImplementation(async () => { order.push('post'); return json({}); });
    expect((await adapter.send(owner, destination, event, async () => { order.push('guard'); return true; })).kind).toBe('accepted');
    expect(order).toEqual(['guard', 'post']);
  });
  it('falls back to a status receipt when the acknowledgement carries no usable identifier', async () => {
    const { adapter } = fixture(vi.fn<typeof fetch>(async () => new Response('ok', { status: 202, headers: { 'x-request-id': 'req/with/slashes' } })));
    expect(await adapter.send(owner, destination, event)).toMatchObject({ kind: 'accepted', messageId: 'http-202' });
    const header = fixture(vi.fn<typeof fetch>(async () => new Response(null, { status: 200, headers: { 'x-buffer-receipt': 'evt_01' } })));
    expect(await header.adapter.send(owner, destination, event)).toMatchObject({ kind: 'accepted', messageId: 'evt_01' });
  });
  it('classifies 4xx as permanent, 429 and 5xx as bounded retries, and transport failure as unknown', async () => {
    expect(await fixture(vi.fn<typeof fetch>(async () => json({}, 404))).adapter.send(owner, destination, event)).toEqual({ kind: 'permanent', errorCode: 'WEBHOOK_HTTP_404' });
    expect(await fixture(vi.fn<typeof fetch>(async () => json({}, 429, { 'retry-after': '120' }))).adapter.send(owner, destination, event)).toEqual({ kind: 'retry', retryAfterMs: 120_125, errorCode: 'WEBHOOK_RATE_LIMITED' });
    expect(await fixture(vi.fn<typeof fetch>(async () => json({}, 429, { 'retry-after': 'soon' }))).adapter.send(owner, destination, event)).toEqual({ kind: 'permanent', errorCode: 'INVALID_RETRY_AFTER' });
    expect(await fixture(vi.fn<typeof fetch>(async () => json({}, 503))).adapter.send(owner, destination, event)).toMatchObject({ kind: 'retry', errorCode: 'WEBHOOK_HTTP_503' });
    expect(await fixture(vi.fn<typeof fetch>(async () => { throw new Error('socket hang up'); })).adapter.send(owner, destination, event)).toEqual({ kind: 'unknown', errorCode: 'WEBHOOK_SEND_OUTCOME_UNKNOWN' });
    expect(await fixture(vi.fn<typeof fetch>(async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example.com/' } }))).adapter.send(owner, destination, event)).toEqual({ kind: 'unknown', errorCode: 'REDIRECT_REJECTED' });
  });
  it('ends a stalled POST at the deadline with an unknown outcome and no retry', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>((_, init) => new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))));
      const adapter = createWebhookAdapter({ configuration: JSON.stringify([config]), fetch: fetcher, now: () => now, timeoutMs: 1000 });
      const pending = adapter.send(owner, destination, event);
      await vi.advanceTimersByTimeAsync(1100);
      expect(await pending).toEqual({ kind: 'unknown', errorCode: 'TIMEOUT' });
    } finally { vi.useRealTimers(); }
  });
  it('rejects an invalid notification without contacting the destination and reports receipts as not applicable', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const { adapter } = fixture(fetcher);
    expect(await adapter.send(owner, destination, { ...event, market: 'sol-perp' })).toEqual({ kind: 'permanent', errorCode: 'INVALID_NOTIFICATION' });
    expect(await adapter.send(owner, destination, { ...event, metric: 'maintenance_headroom' })).toEqual({ kind: 'permanent', errorCode: 'INVALID_NOTIFICATION' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await adapter.receipt(owner, destination, event, 'ack-7')).toEqual({ kind: 'permanent', errorCode: 'RECEIPT_NOT_APPLICABLE' });
  });
});

describe('composite notification adapter', () => {
  it('lists both providers per owner and routes each call to the destination that owns the id', async () => {
    const discordDestination = '20000000-0000-4000-8000-000000000001';
    const discord = createDiscordAdapter({ configuration: JSON.stringify([{ id: discordDestination, label: 'Operator alerts', webhookId: '123456789012345678', webhookToken: 'synthetic_test_only_webhook_token_no_external_access', channelId: '234567890123456789', ownerIds: [owner] }]), fetch: vi.fn<typeof fetch>() });
    const webhookFetch = vi.fn<typeof fetch>(async () => json({ id: 'ack-1' }));
    const webhook = createWebhookAdapter({ configuration: JSON.stringify([config]), fetch: webhookFetch, now: () => now });
    const adapter = createNotificationAdapter({ discord, webhook });
    expect(adapter.listDestinations(owner).map(item => item.provider)).toEqual(['discord', 'webhook']);
    expect(adapter.listDestinations(otherOwner)).toEqual([]);
    expect(adapter.preview(owner, destination, event).destination.provider).toBe('webhook');
    expect(adapter.preview(owner, discordDestination, { ...event, metric: 'maintenance_headroom', unit: 'USD', market: null }).content).toContain('Maintenance headroom');
    expect(await adapter.send(owner, destination, event)).toMatchObject({ kind: 'accepted', messageId: 'ack-1' });
    expect(await adapter.send(owner, '20000000-0000-4000-8000-00000000000f', event)).toEqual({ kind: 'permanent', errorCode: 'DESTINATION_UNAVAILABLE' });
    expect(() => adapter.preview(otherOwner, destination, event)).toThrow('Notification destination is not configured for this owner.');
  });
});
