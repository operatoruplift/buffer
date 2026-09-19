# Discord alerts: restricted adapter and receipt evidence

Reviewed 20 September 2026 (Asia/Ho_Chi_Minh). The adapter is implemented and tested with synthetic transports. **No Discord credentials, outbound acceptance, or recipient receipt were verified during this implementation.** A configured scheduler and an explicitly authorized recipient test remain separate gates; see [ALERTS.md](ALERTS.md) for the worker runbook.

## Official API references

The current [Discord webhook resource](https://docs.discord.com/developers/resources/webhook) documents token-authenticated webhook metadata reads, webhook execution with `wait=true`, and retrieval of a previously sent webhook message. `wait=true` returns the created message instead of an unconfirmed empty response. Forum/media channels require thread parameters; this adapter deliberately supports an incoming webhook in a standard channel only.

[Discord rate limits](https://docs.discord.com/developers/topics/rate-limits) specify HTTP 429 and a `Retry-After` header or numeric `retry_after` body field, measured in seconds. [The message schema and allowed mentions](https://docs.discord.com/developers/resources/message#allowed-mentions-object) define message/channel/webhook identifiers, message content and timestamps, and `allowed_mentions.parse=[]` to suppress mentions. These official references were read for this implementation. No documented webhook idempotency guarantee is assumed.

The [HTTP API reference](https://docs.discord.com/developers/reference#user-agent) requires a versioned client User-Agent; the adapter identifies Buffer with `DiscordBot (https://bufferonsolana.vercel.app, 1.0.0)` and sends JSON content headers.

## Server configuration and access policy

An administrator creates a Discord incoming webhook for the intended standard text channel and records that channel's ID independently. Retain the webhook ID and token in server environment secrets. Buffer accepts no pasted destination URL, arbitrary host, thread override, bot token or user-supplied authorization header.

Set **server-only** `BUFFER_DISCORD_DESTINATIONS_JSON` to a JSON array with the following shape. Every value below is an illustrative placeholder, not an active destination:

```json
[
  {
    "id": "20000000-0000-4000-8000-000000000001",
    "label": "Operator alerts",
    "webhookId": "123456789012345678",
    "webhookToken": "REPLACE_WITH_SERVER_ONLY_WEBHOOK_TOKEN",
    "channelId": "234567890123456789",
    "ownerIds": ["10000000-0000-4000-8000-000000000001"]
  }
]
```

- Generate a stable UUID for `id`. Store this reference in the database; never store the token in a rule or browser payload.
- `ownerIds` contains explicitly allowed authenticated Supabase user UUIDs. Authentication identifies the monitoring owner; it does not prove ownership of the public Solana address. An owner outside the allowlist cannot list, preview, verify, send or retrieve messages through this adapter.
- `label` is at most 80 characters. Credentials, channel IDs, webhook IDs and owner lists remain inside the server adapter. Browser-facing descriptors contain only the reference, sanitized label, masked channel suffix and a one-way configuration fingerprint.
- There are at most 32 configured destinations and 100 owners per destination. Configuration is bounded, identifiers are validated, unknown keys are rejected, and malformed configuration fails with a constant credential-free error.
- Never prefix this environment name with `NEXT_PUBLIC_`. Keep `BUFFER_ALERT_SEND_ENABLED=false` until the configured worker is reviewed and a recipient test has been authorized. Creating the adapter, rendering a preview and reading metadata do not send a notification.

The fingerprint binds the destination UUID, webhook ID, token, channel and sorted owner allowlist. Rotation changes the fingerprint. The worker must reject an old verified destination until it has verified the new configuration; the fingerprint is not an authentication token. Remove an owner or destination from configuration to deny subsequent adapter access. Pause rules before rotation, verify the replacement channel, then deliberately resume. Already accepted messages cannot be recalled by pausing a local rule.

## Exact adapter behavior

`src/server/monitoring/discord.ts` is server-only. `createDiscordAdapter()` closes over configuration and exposes safe descriptors, `preview`, `verifyDestination`, `send` and `receipt` methods. Injected fetch/clock/random implementations exist for deterministic tests; the production default uses the fixed Discord origin.

Only these request paths are constructed, from validated IDs and a single token path segment:

```text
GET  https://discord.com/api/v10/webhooks/{webhookId}/{token}
POST https://discord.com/api/v10/webhooks/{webhookId}/{token}?wait=true
GET  https://discord.com/api/v10/webhooks/{webhookId}/{token}/messages/{messageId}
```

Redirects are rejected. Every request uses `no-store`, a maximum six-second deadline that includes body consumption, and a 64 KiB decoded-response limit. Exceptions and provider bodies are never returned or logged. No webhook credential is exposed in a result. The adapter performs no automatic retry and cannot contact any caller-supplied URL.

Before its single POST, `send` performs a fresh metadata GET and requires the incoming-webhook type, exact webhook ID and independently configured channel ID. This detects a moved/replaced destination before sending. The hosted worker supplies `beforePost`, a bounded callback run after metadata verification and immediately before POST. It atomically rechecks the rule, configuration fingerprint, lease and observation freshness and persists the fenced sending intent. A pause or expiry during the metadata read therefore suppresses POST. A false callback returns `DELIVERY_CANCELLED`; a callback failure returns `DELIVERY_PREPARATION_FAILED`; neither posts. Discord I/O takes up to twelve seconds plus the caller's bounded preparation operation; reconcile its receipt in a later worker pass when necessary.

The immutable notification DTO contains event/rule IDs, rule version, test/production mode, Velocity/mainnet scope, validated public authority and subaccount, maintenance-headroom metric in USD, exact decimal observation and threshold, direction, observation time and source slot. The account summary displays its prefix/suffix. The link includes the public authority, protocol and subaccount to restore the monitored scope. User-provided account names are normalized and stripped of mention, control, link and Markdown syntax. The outgoing message has `allowed_mentions: { "parse": [] }`, disables TTS and suppresses link embeds. The only generated link points to Buffer's fixed production `/app` URL with canonical scope parameters, the event ID and `#monitoring` fragment.

## Acceptance, receipt and uncertainty

| Adapter result | What it establishes | Caller action |
| --- | --- | --- |
| `verified` | Metadata matches the allowlisted webhook and expected channel. | Persist verification bound to the current fingerprint. No message was sent. |
| `accepted` | `wait=true` returned a valid message ID and matching channel/webhook/content. | Persist the provider message ID and content hash. Do not mark a recipient receipt yet. |
| `delivered` | A separate authenticated webhook-message GET returns that exact ID, channel, webhook and complete expected content, including event/rule/version provenance. | Record the observation timestamp as channel-presence evidence. This is not proof that a human read it. |
| `retry` | A known retryable rejection/read failure, with a bounded delay. | Retry only under the durable worker's attempt and freshness limits. |
| `pending` | Receipt retrieval is temporarily unavailable. | Retain the accepted ID and retry GET only. Never resend the notification. |
| `permanent` | Invalid configuration, authorization/payload rejection, or a mismatched/missing receipt. | Surface an actionable failure. Never manufacture delivery or resend merely because GET failed. |
| `unknown` | POST timed out, lost its response, returned an ambiguous server error, or did not provide a verifiable acceptance. | Retain the unresolved outcome. No automatic POST retry. |

An externally accepted message can exist even if the process crashes before saving its message ID. Discord webhooks are not treated as idempotent. If no reliable ID survives, this narrow adapter cannot search channel history. An operator must inspect the destination. When an acceptance ID survives in durable storage, the worker checks it with `receipt` against the persisted event. There is no browser endpoint to attach an arbitrary message ID to an unknown outcome. A message from another event, edited content or forged channel/webhook identity cannot satisfy that check. Until reconciliation succeeds, the state remains unknown rather than delivered or silently retried.

Ordinary HTTP 4xx rejections are permanent, except 429. A POST 408, 5xx, network failure or deadline expiry is conservatively unknown. For 429, numeric delays must be finite, nonnegative and at most one hour; contradictory valid header/body values use the larger value. Malformed or excessive delays stop automatic retry instead of retrying earlier than Discord requested. Returned delays have a one-second floor and up to 250 ms jitter, capped at one hour. GET transport/server failures permit a bounded read retry. The durable worker, not this adapter, owns attempt caps, bounded retry scheduling, quotas and leases.

## Concrete redacted notification preview

This is synthetic contract-test data, not a live account observation or authorized send:

```text
Buffer | TEST alert
Velocity / Solana mainnet | Maintenance headroom
Account: 8vXZ…b9aw | Main account (#0)
Observed: 250 USD
Threshold: at or below 300 USD
Observed at: 2026-09-20T09:59:40.000Z
Source slot: 448360065
Event: 30000000-0000-4000-8000-000000000001
Rule: 40000000-0000-4000-8000-000000000001 | Version: 3
Open Buffer: https://bufferonsolana.vercel.app/app?protocol=velocity&authority=8vXZp5DRsAKGv6QwfqKjZ2MQgMT6arfYYpoCqAN2b9aw&subaccount=0&alert=30000000-0000-4000-8000-000000000001#monitoring
```

An actual authorization request must use the configured masked destination and a freshly generated preview, then preserve event ID, source observation, provider message ID, acceptance time and matching GET receipt time. Do not substitute this illustrative preview for that evidence.

## Verification and remaining gates

Run `npm test -- --run tests/discord.test.ts --reporter=dot` under Node 24. The focused suite uses fake fetch only; it does not read credentials or contact Discord. The suite covers URL/path rejection, two-owner isolation, configuration rotation, metadata mismatch, exact decimals, safe previews, accepted-versus-delivered transitions, forged/replayed receipt rejection, 429 handling, timeouts, stream bounds, ambiguous sends and the final pre-transmission guard. See the command output or final verification record for the latest count.

Live channel verification still requires a server-configured allowlisted destination, a read-only metadata verification, an active protected durable worker, explicit authorization for the exact recipient/message test, and matching channel receipt evidence. The adapter and passing tests alone do not satisfy those live gates.
