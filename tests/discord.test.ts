import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createDiscordAdapter, DiscordConfigurationError, type DiscordEvent } from '../src/server/monitoring/discord';

const owner = '10000000-0000-4000-8000-000000000001';
const otherOwner = '10000000-0000-4000-8000-000000000002';
const destination = '20000000-0000-4000-8000-000000000001';
const webhookId = '123456789012345678';
const channelId = '234567890123456789';
const messageId = '345678901234567890';
const token = 'synthetic_test_only_webhook_token_no_external_access';
const config = { id: destination, label: 'Operator alerts', webhookId, webhookToken: token, channelId, ownerIds: [owner] };
const now = Date.parse('2026-09-20T10:00:00.000Z');
const event: DiscordEvent = {
  mode: 'test', eventId: '30000000-0000-4000-8000-000000000001', ruleId: '40000000-0000-4000-8000-000000000001', ruleVersion: 3,
  provider: 'velocity', network: 'mainnet-beta', authority: '8vXZp5DRsAKGv6QwfqKjZ2MQgMT6arfYYpoCqAN2b9aw',
  subaccountId: 0, subaccountName: 'Main account', metric: 'maintenance_headroom', unit: 'USD', direction: 'below',
  value: '-9007199254740993.123456789012345678', threshold: '300.012345678901234567', observedAt: '2026-09-20T09:59:40.000Z', sourceSlot: 448360065,
};
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
const metadata = () => json({ id: webhookId, channel_id: channelId, type: 1, token });
function fixture(fetcher = vi.fn<typeof fetch>()) {
  const adapter = createDiscordAdapter({ configuration: JSON.stringify([config]), fetch: fetcher, now: () => now, random: () => 0.5 });
  const preview = adapter.preview(owner, destination, event);
  const message = (patch: Record<string, unknown> = {}) => ({
    id: messageId, channel_id: channelId, webhook_id: webhookId, content: preview.content,
    timestamp: '2026-09-20T10:00:00.000000+00:00', edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], ...patch,
  });
  return { adapter, fetcher, preview, message };
}
afterEach(() => vi.useRealTimers());

describe('Discord server-managed destination boundary', () => {
  it('has no recipient when unconfigured and never fetches for another owner', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const empty = createDiscordAdapter({ configuration: '', fetch: fetcher });
    expect(empty.listDestinations(owner)).toEqual([]);
    const { adapter } = fixture(fetcher);
    expect(adapter.listDestinations(otherOwner)).toEqual([]);
    expect(adapter.listDestinations('not-an-owner')).toEqual([]);
    expect(() => adapter.preview(otherOwner, destination, event)).toThrow(DiscordConfigurationError);
    expect(await adapter.verifyDestination(otherOwner, destination)).toEqual({ kind: 'permanent', errorCode: 'DESTINATION_UNAVAILABLE' });
    expect(await adapter.send(otherOwner, destination, event)).toEqual({ kind: 'permanent', errorCode: 'DESTINATION_UNAVAILABLE' });
    expect(await adapter.receipt(otherOwner, destination, event, messageId)).toEqual({ kind: 'permanent', errorCode: 'DESTINATION_UNAVAILABLE' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { url: 'http://127.0.0.1/private' }, { webhookId: 'https://discord.com@localhost' }, { channelId: '../messages/123' },
    { webhookToken: `${token}/messages/${messageId}` }, { webhookToken: `${token}%2f..%2f` }, { webhookToken: `${token}\\evil` },
    { webhookToken: `${token}?wait=false` }, { webhookToken: `${token}@127.0.0.1` }, { ownerIds: [] }, { ownerIds: ['not-uuid'] },
    { id: 'user-reference' }, { label: 'x'.repeat(81) }, { webhookId: '18446744073709551616' }, { channelId: '0' },
  ])('rejects unsafe server configuration %# without echoing credentials', patch => {
    expect(() => createDiscordAdapter({ configuration: JSON.stringify([{ ...config, ...patch }]) })).toThrow('Discord destination configuration is invalid.');
  });
  it('rejects malformed, oversized and duplicate configuration', () => {
    for (const configuration of ['{', 'null', '{}', ' '.repeat(65_536) + '{}', JSON.stringify([config, config]), JSON.stringify(Array(33).fill(config))]) {
      expect(() => createDiscordAdapter({ configuration })).toThrow(DiscordConfigurationError);
    }
  });
  it('returns redacted metadata and changes its identity commitment on rotation', () => {
    const { adapter } = fixture();
    const current = adapter.listDestinations(owner)[0];
    expect(current).toMatchObject({ id: destination, provider: 'discord', label: 'Operator alerts', maskedDestination: 'Discord channel …6789' });
    expect(JSON.stringify(current)).not.toContain(token);
    expect(JSON.stringify(current)).not.toContain(webhookId);
    expect(JSON.stringify(current)).not.toContain(channelId);
    for (const patch of [{ webhookToken: `${token}_rotated` }, { channelId: '234567890123456788' }, { ownerIds: [owner, otherOwner] }]) {
      const rotated = createDiscordAdapter({ configuration: JSON.stringify([{ ...config, ...patch }]) }).listDestinations(owner)[0];
      expect(rotated.fingerprint).not.toBe(current.fingerprint);
    }
    current.label = 'Mutated client copy';
    expect(adapter.listDestinations(owner)[0].label).toBe('Operator alerts');
  });
  it('verifies exact channel metadata by GET without sending and redacts provider token', async () => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(metadata());
    const verified = await adapter.verifyDestination(owner, destination);
    expect(verified).toMatchObject({ kind: 'verified', destinationId: destination, channelId, verifiedAt: new Date(now).toISOString() });
    expect(JSON.stringify(verified)).not.toContain(token);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`https://discord.com/api/v10/webhooks/${webhookId}/${token}`, expect.objectContaining({ method: 'GET', redirect: 'error', cache: 'no-store' }));
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('user-agent')).toBe('DiscordBot (https://bufferonsolana.vercel.app, 1.0.0)');
  });
  it.each([{ id: messageId }, { channel_id: messageId }, { type: 2 }, { type: 3 }])('rejects mismatched metadata before any POST: %j', async patch => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(json({ id: webhookId, channel_id: channelId, type: 1, ...patch }));
    expect(await adapter.send(owner, destination, event)).toEqual({ kind: 'permanent', errorCode: 'DESTINATION_MISMATCH' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects redirects without following them or disclosing a credential-bearing exception', async () => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(new Response('', { status: 302, headers: { Location: 'http://127.0.0.1/secrets' } }));
    expect(await adapter.verifyDestination(owner, destination)).toEqual({ kind: 'permanent', errorCode: 'REDIRECT_REJECTED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('error');
    fetcher.mockRejectedValueOnce(new Error(`fetch https://discord.com/api/v10/webhooks/${webhookId}/${token}`));
    const result = await adapter.verifyDestination(owner, destination);
    expect(result.kind).toBe('retry');
    expect(JSON.stringify(result)).not.toContain(token);
  });
});

describe('Discord notification and receipt provenance', () => {
  it('previews exact decimals, redacted account, sanitized user text and fixed Buffer link without I/O', () => {
    const { adapter, fetcher } = fixture();
    const preview = adapter.preview(owner, destination, { ...event, subaccountName: '@everyone <@123>\n[phish](https://evil.test) **hacked**\u202e' });
    expect(preview.content).toContain('Buffer | TEST alert');
    expect(preview.content).toContain(event.value);
    expect(preview.content).toContain(event.threshold);
    expect(preview.content).toContain(`Threshold: at or below ${event.threshold} USD`);
    expect(preview.content).toContain('Velocity / Solana mainnet | Maintenance headroom');
    expect(preview.content).toContain('Account: 8vXZ…b9aw');
    expect(preview.content.split('\n').find(line => line.startsWith('Account:'))).not.toContain(event.authority);
    expect(preview.content).not.toMatch(/@|<@|\*\*|\u202e|https:\/\/evil/);
    expect(preview.content).toContain(`https://bufferonsolana.vercel.app/app?protocol=velocity&authority=${event.authority}&subaccount=0&alert=${event.eventId}#monitoring`);
    expect(preview.content).toContain(`Event: ${event.eventId}`);
    expect(preview.content).toContain(`Rule: ${event.ruleId} | Version: 3`);
    expect(preview.content).toContain('Source slot: 448360065');
    expect(preview.content.length).toBeLessThan(2000);
    expect(adapter.preview(owner, destination, { ...event, mode: 'production' }).content).toContain('PRODUCTION alert');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { provider: 'jupiter' }, { network: 'devnet' }, { authority: 'https://evil.test' }, { subaccountId: -1 }, { subaccountId: 65536 },
    { value: 'NaN' }, { value: '1e30' }, { threshold: '0'.repeat(1000) }, { value: '1'.repeat(61) }, { unit: 'USDT' },
    { metric: 'liquidation_price' }, { eventId: '../event' }, { ruleVersion: 0 }, { observedAt: 'today' }, { observedAt: '2026-02-30T00:00:00.000Z' }, { sourceSlot: -1 },
  ])('refuses unsupported or malformed notification %# before I/O', async patch => {
    const { adapter, fetcher } = fixture();
    expect(await adapter.send(owner, destination, { ...event, ...patch } as DiscordEvent)).toEqual({ kind: 'permanent', errorCode: 'INVALID_NOTIFICATION' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('distinguishes single POST acceptance from subsequent matching channel receipt', async () => {
    const { adapter, fetcher, message, preview } = fixture();
    fetcher.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(json(message())).mockResolvedValueOnce(json(message()));
    expect(await adapter.send(owner, destination, event)).toEqual({ kind: 'accepted', messageId, channelId, acceptedAt: new Date(now).toISOString(), contentHash: preview.contentHash });
    const [url, init] = fetcher.mock.calls[1];
    expect(url).toBe(`https://discord.com/api/v10/webhooks/${webhookId}/${token}?wait=true`);
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' });
    expect(JSON.parse(String(init?.body))).toEqual({ content: preview.content, allowed_mentions: { parse: [] }, flags: 4, tts: false });
    expect(await adapter.receipt(owner, destination, event, messageId)).toEqual({ kind: 'delivered', messageId, channelId, receivedAt: new Date(now).toISOString(), contentHash: preview.contentHash });
    expect(fetcher.mock.calls[2][0]).toBe(`https://discord.com/api/v10/webhooks/${webhookId}/${token}/messages/${messageId}`);
    expect(fetcher.mock.calls[2][1]?.method).toBe('GET');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('runs the durable guard after metadata and before the single POST', async () => {
    const { adapter, fetcher, message } = fixture();
    const order: string[] = [];
    fetcher.mockImplementationOnce(async () => { order.push('metadata'); return metadata(); })
      .mockImplementationOnce(async () => { order.push('POST'); return json(message()); });
    const result = await adapter.send(owner, destination, event, async () => { order.push('persist-sending-intent'); return true; });
    expect(result.kind).toBe('accepted');
    expect(order).toEqual(['metadata', 'persist-sending-intent', 'POST']);
  });
  it('suppresses POST when pause or expiry is detected after metadata', async () => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(metadata());
    const guard = vi.fn(async () => false);
    expect(await adapter.send(owner, destination, event, guard)).toEqual({ kind: 'permanent', errorCode: 'DELIVERY_CANCELLED' });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.method).toBe('GET');
  });
  it('does not POST or leak errors when the durable guard fails', async () => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(metadata());
    expect(await adapter.send(owner, destination, event, async () => { throw new Error(token); })).toEqual({ kind: 'permanent', errorCode: 'DELIVERY_PREPARATION_FAILED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not persist sending intent when destination verification failed', async () => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(json({ id: webhookId, channel_id: messageId, type: 1 }));
    const guard = vi.fn(async () => true);
    expect(await adapter.send(owner, destination, event, guard)).toEqual({ kind: 'permanent', errorCode: 'DESTINATION_MISMATCH' });
    expect(guard).not.toHaveBeenCalled();
  });
  it.each([
    { id: '345678901234567891' }, { channel_id: messageId }, { webhook_id: channelId }, { content: 'Forged event' },
    { timestamp: 'invalid' }, { edited_timestamp: new Date(now).toISOString() }, { mention_everyone: true }, { mentions: [{ id: webhookId }] }, { mention_roles: [channelId] },
  ])('rejects forged or modified receipt %#', async patch => {
    const { adapter, fetcher, message } = fixture();
    fetcher.mockResolvedValueOnce(json(message(patch)));
    expect(await adapter.receipt(owner, destination, event, messageId)).toEqual({ kind: 'permanent', errorCode: 'RECEIPT_MISMATCH' });
  });
  it('cannot reuse a message receipt for another event or rule version', async () => {
    const { adapter, fetcher, message } = fixture();
    for (const patch of [{ eventId: '30000000-0000-4000-8000-000000000002' }, { ruleVersion: 4 }, { sourceSlot: 448360066 }, { mode: 'production' as const }]) {
      fetcher.mockResolvedValueOnce(json(message()));
      expect(await adapter.receipt(owner, destination, { ...event, ...patch }, messageId)).toEqual({ kind: 'permanent', errorCode: 'RECEIPT_MISMATCH' });
    }
  });
  it('never lets a receipt ID modify the pinned endpoint', async () => {
    const { adapter, fetcher } = fixture();
    for (const id of ['../123', '123?wait=true', 'https://localhost', `${messageId}/other`, `${messageId}%2fother`]) {
      expect(await adapter.receipt(owner, destination, event, id)).toEqual({ kind: 'permanent', errorCode: 'INVALID_MESSAGE_ID' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Discord bounded failure handling', () => {
  it('honors the larger validated Retry-After with bounded jitter, never retries internally', async () => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(json({ retry_after: 1.25 }, 429, { 'Retry-After': '2.5' }));
    expect(await adapter.send(owner, destination, event)).toEqual({ kind: 'retry', retryAfterMs: 2625, errorCode: 'DISCORD_RATE_LIMITED' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    { body: {}, header: undefined }, { body: { retry_after: -1 }, header: undefined }, { body: { retry_after: '1' }, header: undefined },
    { body: { retry_after: 1 }, header: 'NaN' }, { body: { retry_after: 3601 }, header: '1' }, { body: { retry_after: 1 }, header: 'Wed, 21 Oct 2026 07:28:00 GMT' },
  ])('does not schedule unsafe or unbounded Retry-After %#', async ({ body, header }) => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(json(body, 429, header === undefined ? undefined : { 'Retry-After': header }));
    expect(await adapter.send(owner, destination, event)).toEqual({ kind: 'permanent', errorCode: 'INVALID_RETRY_AFTER' });
  });
  it.each([400, 401, 403, 404, 422])('treats known POST HTTP %s rejection as permanent and redacts its body', async status => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(json({ message: token }, status));
    expect(await adapter.send(owner, destination, event)).toEqual({ kind: 'permanent', errorCode: `DISCORD_HTTP_${status}` });
  });
  it.each([408, 500, 502, 503])('keeps ambiguous POST HTTP %s unknown without blindly retrying', async status => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(json({ message: token }, status));
    expect(await adapter.send(owner, destination, event)).toEqual({ kind: 'unknown', errorCode: 'DISCORD_SEND_OUTCOME_UNKNOWN' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('keeps transport failure and malformed successful POST response unknown', async () => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(metadata()).mockRejectedValueOnce(new Error(token));
    expect(await adapter.send(owner, destination, event)).toEqual({ kind: 'unknown', errorCode: 'DISCORD_SEND_OUTCOME_UNKNOWN' });
    fetcher.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(new Response('invalid json'));
    expect(await adapter.send(owner, destination, event)).toEqual({ kind: 'unknown', errorCode: 'DISCORD_SEND_OUTCOME_UNKNOWN' });
    fetcher.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(json({ id: messageId }));
    expect(await adapter.send(owner, destination, event)).toEqual({ kind: 'unknown', errorCode: 'DISCORD_ACCEPTANCE_UNVERIFIED' });
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it('bounds both advertised and decoded bodies and cancels the stream', async () => {
    const { adapter, fetcher } = fixture();
    for (const declared of [true, false]) {
      const cancelled = vi.fn();
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(65_537)); }, cancel: cancelled });
      fetcher.mockResolvedValueOnce(new Response(stream, { headers: declared ? { 'Content-Length': '65537' } : {} }));
      expect(await adapter.verifyDestination(owner, destination)).toEqual({ kind: 'permanent', errorCode: 'RESPONSE_TOO_LARGE' });
      expect(cancelled).toHaveBeenCalled();
    }
  });
  it('ends a stalled POST at the deadline with unknown outcome and no retry', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(metadata()).mockImplementationOnce(() => new Promise<Response>(() => {}));
    const adapter = createDiscordAdapter({ configuration: JSON.stringify([config]), fetch: fetcher, timeoutMs: 20 });
    const pending = adapter.send(owner, destination, event);
    await vi.advanceTimersByTimeAsync(25);
    expect(await pending).toEqual({ kind: 'unknown', errorCode: 'DISCORD_SEND_OUTCOME_UNKNOWN' });
    expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('bounds stalled receipt bodies, reports pending, and does not send again', async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancelled })));
    const adapter = createDiscordAdapter({ configuration: JSON.stringify([config]), fetch: fetcher, timeoutMs: 20, random: () => 0 });
    const pending = adapter.receipt(owner, destination, event, messageId);
    await vi.advanceTimersByTimeAsync(25);
    expect(await pending).toEqual({ kind: 'pending', retryAfterMs: 1000, errorCode: 'DISCORD_READ_UNAVAILABLE' });
    expect(cancelled).toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.method).toBe('GET');
  });
  it('never treats a missing channel message as delivered', async () => {
    const { adapter, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(json({ code: 10008, message: 'Unknown Message' }, 404));
    expect(await adapter.receipt(owner, destination, event, messageId)).toEqual({ kind: 'permanent', errorCode: 'DISCORD_HTTP_404' });
  });
});
