# Buffer threshold monitoring

Buffer ships a narrow, reviewable monitoring wedge for one verified Velocity metric: current cross-margin maintenance headroom. A rule selects the authority/subaccount, `below` or `above` direction, decimal threshold, cadence and the local mock destination. Rules, versioned events, outbox work and mock deliveries are persisted in an owner-keyed browser store. When Supabase auth is available, the owner key is the authenticated user ID; otherwise the panel is clearly labeled as a deterministic guest demo and never claims private ownership.

The browser panel only evaluates fresh live Velocity snapshots that contain a complete `risk` context. It never treats a sample, stale response, isolated scope or missing value as a triggered alert. Event keys include rule version, cadence bucket and metric, so a repeated check is idempotent. The local worker claims one pending item with a 30-second lease, records an attempt, and writes a mock delivery state. Pause disables future evaluation.

Run the deterministic worker locally:

```sh
npm run alert:worker -- --reset
```

It writes `.local/alert-store.json` (ignored by Git) and prints the worker state, event count, pending count and delivered count. Set `BUFFER_ALERT_STORE=/tmp/buffer-alerts.json` to choose another local file. This worker never contacts a provider or external destination.

The additive migration `supabase/migrations/20260915120000_create_alert_pipeline.sql` defines owner-scoped `alert_rules`, `alert_events` and `alert_outbox` tables. Applying it is a prerequisite for hosted persistence. A hosted worker must use a protected service role, a real scheduler, bounded leases/retries and a provider-restricted destination. No email, Discord, Telegram, webhook or push notification is enabled by this release.

Validation covers owner isolation, stale suppression, rule/version/cadence idempotency, lease claim, mock delivery, pause behavior and malformed-store recovery in `tests/alerts.test.ts`.
