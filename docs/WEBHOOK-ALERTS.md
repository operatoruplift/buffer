# Signed webhook alerts and liquidation-distance sentinels

Added 28 September 2026. Two additions to hosted monitoring, both behind the same owner-scoped rules, worker credential and scheduler as [Discord alerts](DISCORD-ALERTS.md):

- a second **metric**, `liquidation_distance`: the unsigned percentage move from the current oracle price to one position's estimated liquidation price under model `cross-margin-hold-others-v1` (see [RISK-CONTEXT.md](RISK-CONTEXT.md));
- a second **destination kind**, `webhook`: an HMAC-signed JSON POST to a server-configured HTTPS URL.

No credentials, URLs or recipient tests were exercised outside synthetic transports. The migration `20260928120000_liquidation_sentinels.sql` is additive and is exercised end to end against local PostgreSQL by `scripts/verify-hosted-monitoring.mjs`.

## Liquidation-distance rules

A rule binds `metric = liquidation_distance`, one `market` (`^[A-Z0-9]{1,16}-PERP$`) and unit `%`, alongside the usual authority, subaccount, direction, exact threshold, cadence, timezone, cooldown and hysteresis. Metric and market are creation-time identity: the API rejects them on PATCH, the trigger treats them as immutable, and the live-scope unique index is `(owner, provider, network, authority, subaccount, metric, market)`, so a headroom rule and one sentinel per market coexist for the same account.

On each fresh check the worker runs the same observation gate as headroom rules (live Velocity, mainnet, fresh, complete cross-margin risk, valid oracles, no isolated positions), then evaluates the estimate for the named market:

- the value is `|distancePercent|` from `estimateLiquidationPrices`, compared with the threshold exactly (`below` triggers at or below; default recovery distance 1 percentage point);
- if the market has no open position, no verified maintenance ratio or no positive boundary, the check completes as **unavailable** with that reason. No monitor state is written, no event is queued, and the earlier breached episode is retained;
- the persisted observation carries `metric`, `unit` and `market`; `complete_check` rejects any observation whose metric, unit or market differs from the rule.

Notification text and payloads name the metric and market: `Velocity / Solana mainnet | Liquidation distance SOL-PERP`, `Observed: 4.25 %`.

## Webhook destinations

Set **server-only** `BUFFER_WEBHOOK_DESTINATIONS_JSON` to a JSON array. Every value below is a placeholder:

```json
[
  {
    "id": "20000000-0000-4000-8000-000000000002",
    "label": "Risk desk",
    "url": "https://alerts.example.com/hooks/buffer",
    "secret": "REPLACE_WITH_32_TO_256_URL_SAFE_CHARACTERS",
    "ownerIds": ["10000000-0000-4000-8000-000000000001"]
  }
]
```

- `url` must be `https://`, a public DNS hostname (no IP literals, `localhost`, `.local`, `.internal`, `.home.arpa`), with no credentials, port, query or fragment. Buffer never accepts a pasted URL from the browser; an owner outside `ownerIds` cannot list, preview or send to the destination.
- `secret` is 32–256 URL-safe characters and never leaves the server. The browser sees only the id, label, `Webhook <hostname>` and a one-way fingerprint over id, URL, secret and sorted owners. Rotating any of them changes the fingerprint, which disables rules until the destination is re-verified on the next status read.
- Verification is configuration policy only: no request is made until a real event is due. Keep `BUFFER_ALERT_SEND_ENABLED=false` until the receiver has been reviewed.

### Request

```text
POST <url>
Content-Type: application/json
User-Agent: Buffer-Alerts/1.0 (+https://bufferonsolana.vercel.app)
X-Buffer-Event: <event uuid>
X-Buffer-Timestamp: <unix seconds>
X-Buffer-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<body>")>
```

Body (fixed field order; exact decimals as strings):

```json
{
  "type": "buffer.alert", "version": 1, "mode": "test",
  "event": { "id": "…", "ruleId": "…", "ruleVersion": 2 },
  "scope": { "provider": "velocity", "network": "mainnet-beta", "authority": "…", "subaccountId": 0, "subaccountName": "Main account" },
  "metric": { "name": "liquidation_distance", "label": "Liquidation distance", "unit": "%", "market": "SOL-PERP", "direction": "below", "value": "4.25", "threshold": "5" },
  "observedAt": "2026-09-28T09:59:40.000Z", "sourceSlot": 448360065, "link": "https://bufferonsolana.vercel.app/app?…#monitoring"
}
```

Receiver verification (Node):

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
const expected = `v1=${createHmac('sha256', secret).update(`${req.headers['x-buffer-timestamp']}.${rawBody}`).digest('hex')}`;
const ok = timingSafeEqual(Buffer.from(req.headers['x-buffer-signature']), Buffer.from(expected))
  && Math.abs(Date.now() / 1000 - Number(req.headers['x-buffer-timestamp'])) < 300;
```

Compare over the raw body bytes, reject old timestamps, and deduplicate on `X-Buffer-Event`: the worker never re-sends an event whose outcome is uncertain, but a receiver may still see a retried event after a `429` or `5xx`.

Before configuring the first webhook destination on a deployment whose scheduler was installed before 28 September 2026, re-run the `private.invoke_buffer_monitor_worker()` block of `supabase/setup/monitoring-scheduler.sql` as the project owner (the SQL editor's role can set the helper's HTTP timeout; the migration role cannot). The updated helper accepts a worker result of `delivered`; the earlier one would report each webhook delivery minute as a failed invocation, although the delivery itself is recorded.

### Outcomes

| Response | Recorded state | Notes |
|---|---|---|
| `2xx` | `delivered` | The acknowledgement is the receipt; generic receivers offer no read-back. The receipt id is `X-Buffer-Receipt`, `X-Request-Id` or JSON `id` when present, else `http-<status>`. |
| `429` | `failed` (retryable) | Honors a numeric `Retry-After` up to one hour, else waits about 30 s, with bounded jitter. |
| `5xx`, `408` | `failed` (retryable) | About 60 s before the next attempt; three attempts total. |
| other `4xx` | `failed` (permanent) | Not retried. |
| redirect, timeout, transport error after the write | `unknown_outcome` | Never re-sent automatically. |

The worker persists its fenced sending intent (`begin_send`) after the rule, destination fingerprint, lease and observation freshness are rechecked and immediately before the single POST, exactly as for Discord. `finish_send` accepts `delivered` only for webhook destinations and `accepted_by_provider` only for Discord.
