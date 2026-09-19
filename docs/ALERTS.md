# Buffer threshold monitoring

Updated September 20, 2026. Browser and SQLite delivery remain local. The database hardening is now applied to hosted Supabase; it does not activate a scheduler or external delivery.

Buffer monitors **current Velocity cross-margin maintenance headroom**, in USD. A rule identifies an owner, exact authority/subaccount, threshold/direction, minimum check interval, timezone, cooldown, recovery distance (hysteresis), and mock destination. It never derives an alert from an estimated liquidation price.

## Browser experience

The dashboard stores rules on the current device, partitioned by the current authenticated owner or the guest device profile. Session and account changes clear the displayed state and cancel pending checks. Cross-tab edits use Web Locks and reload the latest persisted state before writing. A storage failure is visible and does not report a successful save.

**Run fixture check** appears only while exploring a deterministic example; its event is explicitly labeled as a fixture. **Check current snapshot** uses the selected live observation, without pretending to fetch a new one. Unsupported, incomplete, isolated, stale, failed-refresh, and mismatched scopes do not become fixtures. Refresh the account to obtain a new provider observation. The UI reports idle after each manual pass. Closing the tab stops browser work; cadence is a minimum interval, not a background scheduling promise.

## Durable local worker

Use Node 24 and the existing npm lockfile:

```sh
npm ci
npm run alert:worker -- --fixture
npm run alert:worker -- --fixture --watch --interval 5
npm run alert:worker -- --status
```

The default database is `.local/alerts.sqlite`, ignored by Git. `BUFFER_ALERT_STORE` selects another local SQLite path. The fixture flag is explicit and refreshes only deterministic test input. No provider or destination is contacted. To consume a real, locally saved Buffer Velocity snapshot:

```sh
npm run alert:worker -- --snapshot /absolute/path/velocity-snapshot.json --owner local-reviewer
```

`--watch` rereads this file. An old file becomes unavailable after at most 120 seconds, including when `expiresAt` is absent; it is never restamped as fresh. This worker does not fetch new observations. The file must be refreshed independently by a reviewed read-only provider adapter before a real scheduled monitor can be enabled.

Use the rule ID printed by `--status`:

```sh
npm run alert:worker -- --pause RULE_ID
npm run alert:worker -- --resume RULE_ID
npm run alert:worker -- --delete RULE_ID
npm run alert:worker -- --rule RULE_ID --threshold 300 --cooldown 15 --hysteresis 10
```

Browser localStorage and worker SQLite are separate stores. There is no implied browser-to-worker sync. The former JSON fixture file is not silently imported: the new worker rejects non-SQLite input rather than resetting delivery history.

## Reliability contract

- SQLite WAL, full synchronization, and `BEGIN IMMEDIATE` serialize process mutations. A revision comparison detects stale writes.
- A claim with a random token and 30-second lease commits **before** completion. An expired worker cannot complete another worker's claim.
- Versioned rule + breach episode keys prevent duplicate events through restarts, cadence ticks, and multiple runners. Hysteresis requires recovery beyond the configured distance before another crossing. Cooldown limits repeated episodes.
- A local mock delivery journal and event/outbox completion commit in the same transaction. This proves one mock delivery per event; it is not a claim of exactly-once external email/webhook delivery.
- Retries have bounded exponential backoff and stop after three attempts. `--fail-sink` and `--claim-only` expose test paths.
- Pausing, editing, or deleting invalidates queued/claimed work before delivery. Deletion retains the event history.
- Stale/incomplete input marks monitoring unavailable, preserves unresolved breaches, and does not advance the last-fresh timestamp.
- Corrupt or oversized state fails closed. Limits are 20 rules and 10,000 rows per journal collection; no unresolved history is silently discarded. Back up/rotate a local test database explicitly when full.

## Database preparation and external gates

The original `20260915120000_create_alert_pipeline.sql` is recorded as applied to Buffer Supabase. The reviewed `20260919090000_harden_alert_pipeline.sql` and `20260920010000_harden_function_permissions.sql` were applied to Buffer Supabase during the authorized September 20 release. Hosted migration versions are `20260919172720` and `20260919173121` respectively (UTC). It adds verified mock destinations, owner-linked foreign keys, restricted configuration columns, automatic rule versions, worker-only fenced claim/completion functions, cancellation, and protected 30-day history retention. The followup also removes direct Supabase default grants from trigger helpers and fixes the existing rate-limit pruning function’s search path. These migrations do not start a worker or enable external delivery.

Local PostgreSQL semantics can be checked without hosted credentials using PGlite installed in a temporary directory:

```sh
npm install --prefix /tmp/buffer-sql-verification --no-audit --no-fund @electric-sql/pglite@0.5.8
BUFFER_PGLITE_MODULE=/tmp/buffer-sql-verification/node_modules/@electric-sql/pglite/dist/index.js node scripts/verify-alert-schema.mjs
```

The 55 local assertions simulate Supabase’s direct function grants and check ownership, trigger behavior and worker permissions. Hosted postflight separately confirms RLS and denied browser execution of protected helpers; this is not multi-session PostgreSQL performance evidence. Hosted activation still requires a deployed provider-polling scheduler, database-coordinated evaluation, quotas, protected credentials, and an authorized verified destination. Email/Discord/Telegram integrations are **not implemented or enabled**. No arbitrary URL is fetched and no external message is sent.

## Verification

`tests/alerts.test.ts` covers threshold semantics, freshness, null inputs, owner isolation, bounded retries, hysteresis/cooldown, version invalidation, and fenced leases. `tests/alert-worker.test.ts` runs real child processes against SQLite, including six concurrent runners, restart deduplication, expired-lease recovery, crash rollback, and corrupt-store rejection. `e2e/alerts.spec.ts` covers explicit fixtures, persistence, idle/paused state, unavailable live risk, cross-tab coordination, and mocked owner switches.
