# Buffer threshold monitoring

Updated September 20, 2026. This runbook separates local rehearsal, hosted dry runs, and configured Discord sending. The current evidence and outstanding gates are in [the integration matrix](BUFFER-INTEGRATION-STATUS.md).

Buffer checks **observed Velocity cross-margin maintenance headroom in USD**. It does not alert on the price slider or an estimated liquidation price. A rule binds an authenticated cloud owner, Solana authority/subaccount, provider/network, exact threshold and direction, cadence, timezone, cooldown, hysteresis, destination reference, enabled state, and version. Watching a public address does not prove ownership or require signing.

## Two disjoint experiences

An example portfolio shows **Alert rehearsal** and **Run example check**. Its fixture identity and fixed 250 USD headroom never enter the live provider path. Browser storage uses `buffer.alerts.rehearsal.v2:<owner>`; older `buffer.alerts.v1:<owner>` history is preserved in place, never imported into hosted rules. The example history download includes fixture/rehearsal provenance. Cross-tab writes use Web Locks; corrupt data fails visibly without overwriting the journal. No rehearsal entry point can send a notification.

A live account shows **Live monitoring**. Guests can use the account explorer, risk context, calculator and reports; signing in is required only to save cloud rules. The browser uses owner-authenticated `/api/monitoring` endpoints. Supabase verifies the Bearer token and RLS enforces ownership; a client owner ID grants no authority. Session changes abort requests and unmount the previous owner's state. Late responses cannot restore another session's rules or receipts.

**Run fresh check** starts a new supported provider read on the server. It never restamps cached client data. Expired observations can be checked again, but changing the selected scope blocks actions until the new account is read. Missing/isolated risk, incorrect identity, invalid oracles, unavailable inventory or expired observations preserve the unavailable reason and do not advance `lastFreshCheck`. Current scenario headroom remains independent of slider moves.

## Hosted runtime

The additive migration `20260920020000_hosted_monitoring.sql` extends the existing alert tables and adds a private worker credential and run journal. Database state, event episodes, versions, attempts, leases and receipts survive process restarts. Existing saved reports and browser/SQLite rehearsal stores retain their semantics.

- Authenticated owners use narrowly scoped status/mutation functions. Cross-owner reads, writes and destination assignment are denied. Server-owned destination metadata and event/outbox transitions are not browser-writable.
- The worker uses a dedicated server-only secret. Only its SHA-256 hash is stored in `private.buffer_monitor_credentials`; this credential cannot act as a service-role key. The public SDK key alone cannot operate the worker.
- A separate `CRON_SECRET` protects `/api/monitoring/worker`. The database admits a scheduled minute key once across concurrent invocations. Manual checks do not establish a scheduler heartbeat.
- Fenced database claims coordinate due checks and dispatch. Each invocation atomically selects one kind of work: a fresh queued delivery first, a receipt lookup next, or a due account observation. A slow provider read cannot consume the dispatch turn. Observations use the shared exact-decimal alert engine and persist the resulting episode/event before delivery.
- Cadence, cooldown and hysteresis survive unavailable observations and restarts. Pausing, deleting or changing a rule version invalidates pending work. History is retained; a remotely accepted message cannot be recalled.
- The scheduler is bounded server work, not a browser timer. A heartbeat expires after 180 seconds, including on a page left open. UI separates attempted check, last fresh observation, next check, provider acceptance and matching receipt.

## Exactly one outbound provider: Discord

See [the Discord contract and setup](DISCORD-ALERTS.md) for exact configuration, official API references, quotas and sanitized preview. `BUFFER_DISCORD_DESTINATIONS_JSON` contains platform-admin destination references and an explicit allowed-owner list. Tokens stay in server environment variables. Users cannot paste arbitrary fetch URLs. Metadata GET verifies the configured channel; webhook calls use a fixed Discord HTTPS origin/path with redirects rejected.

Sending is disabled unless `BUFFER_ALERT_SEND_ENABLED=true`. `BUFFER_ALERT_NOTIFICATION_MODE=test` labels genuine current-account notifications as tests; it does not fabricate observations. Production mode is a deliberate separate setting. Destination metadata verification performs no notification POST.

States are `queued`, `sending`, `accepted_by_provider`, `delivered`, `failed`, `suppressed` and `unknown_outcome`. Discord `wait=true` returns a validated message ID; this establishes acceptance only. A separate GET must return the matching message ID, channel, webhook and event content before Buffer records a receipt. “Receipt verified” means the channel message was retrieved; it does not mean a person read it.

Discord webhook POST has no documented idempotency key. An ambiguous POST or an expired in-flight send becomes `unknown_outcome`; it is never blindly resent. If the message ID was durably recorded, the worker can reconcile it by GET without another POST. Retries are bounded and safe rate-limit responses respect validated Retry-After with jitter. Permanent credential/destination failures require intervention. No database outbox promises exactly-once external delivery.

## Local rehearsal command

Use Node 24 and the existing npm lockfile:

```sh
npm run alert:worker -- --fixture
npm run alert:worker -- --fixture --watch --interval 5
npm run alert:worker -- --status
```

SQLite `.local/alerts.sqlite` uses WAL, full synchronization and transactional revisions. `BUFFER_ALERT_STORE` selects a separate path. `--snapshot /absolute/path/velocity-snapshot.json --owner local-reviewer` consumes a locally saved observation; it does not fetch or refresh it. Old files become unavailable within120 seconds and are never restamped. `--pause RULE_ID`, `--resume RULE_ID`, `--delete RULE_ID` and `--rule RULE_ID --threshold 300 --cooldown 15 --hysteresis 10` exercise local state. `--claim-only` and `--fail-sink` expose crash/retry behavior. SQLite/browser rehearsal and hosted monitoring never implicitly sync.

## Activation and operation

1. Apply the reviewed additive migration and verify RLS/function privileges. Use the existing Buffer Supabase project; do not create another project or replace its report tables.
2. Generate distinct random worker and cron credentials. Store the worker hash in the private credential row, and put the actual values in server-only Vercel variables. Configure `BUFFER_ALERT_SEND_ENABLED=false` and `BUFFER_ALERT_NOTIFICATION_MODE=test` initially. Deploy before activating the scheduler.
3. Use Supabase Pro `pg_cron` + pinned synchronous `http` 1.6 HEAD to invoke the fixed production worker once per minute. Keep the cron credential in Supabase Vault. [Deployment](DEPLOYMENT.md) records the activation/rollback procedure. Check actual cron result and persisted heartbeat; environment variables alone do not prove execution.
4. Configure exactly one Discord destination for the intended confirmed Supabase owner. Verify its metadata; prepare the exact redacted message and destination. Obtain recipient-send authorization before turning on sends. Existing signup/recovery email stays disabled independently.
5. Save an authorized test threshold around a real current observation. Confirm event ID, rule version, source slot/time, provider message ID and matching channel receipt. Retain redacted evidence, then pause/delete the test rule. Do not call this step verified until a real receipt exists.

To pause: disable the scheduler job and set sending false. To rotate: first disable sends, rotate the webhook/token and configuration fingerprint, reverify the channel, invalidate old pending work, redeploy, then reenable only after authorization. Never reuse unknown-outcome events as fresh sends. Inspect unavailable reasons, heartbeat age and outbox state; do not erase a damaged journal to make the UI green. Rollback leaves the additive schema/RLS in place, disables the job and sending, and promotes the previous known-good application.

## Verification

Unit suites cover exact threshold semantics, provider contracts, response bounds, invalid inputs, owner/session changes, immutable report semantics and crash outcomes. PGlite scripts exercise actual migrations, RLS, two-owner denial, uniqueness and fenced transitions. Real-process SQLite tests exercise independent concurrent runners and crash rollback. Browser tests intercept auth/provider/monitoring transport and explicitly check fixture/live separation, accepted-versus-receipt UI, unknown outcomes, expired heartbeat, unavailable storage and sign-out. These deterministic tests never send to Discord. Hosted scheduler execution and actual recipient delivery have separate evidence gates.


The narrow worker processes at most one work item per minute; configured cadence is a minimum interval, not a guaranteed maximum notification delay under backlog. Limits are 20 rules per owner, 100 events per owner per day, 10 send attempts per owner per hour, 3 send attempts and 5 receipt lookups per event. Stale queued events are suppressed after 120seconds rather than dispatched after an outage. Completed/suppressed unreferenced history is pruned after 30 days in bounded batches; unresolved outcomes remain available for investigation. Fresh deliveries take precedence over receipt retries so a slow receipt cannot expire another event's send window.
