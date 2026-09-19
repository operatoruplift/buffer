# Deployment and cloud configuration

**Last updated:** September 20, 2026. Production deployment is now authorized. The reviewed alert hardening and function-permission migrations have been applied; see [the release record](RELEASE-2026-09-20.md) for the final deployment and verification result.

Buffer runs on Node 24 with Next.js App Router. `/` is the public website, `/app` is the public explorer with live Velocity as the default, modeled Pacifica reads, and inventory-only Jupiter Perps, and `/auth` contains optional email/password sign-in. The protocol selector also exposes the explicitly paused legacy Drift reader. Scenario functionality, live public reads, device-local reports, and downloads work without a cloud account.

## Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `SOLANA_RPC_URL` | Server only | Solana mainnet RPC with `getGenesisHash`, `getProgramAccounts`, `getAccountInfo`, `getMultipleAccounts`, and `getSlot`. The provider checks the mainnet genesis hash. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Dedicated Buffer project's API URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable key; never a service-role or secret key. |
| `NEXT_PUBLIC_AUTH_EMAIL_READY` | Public | Set `true` only after email signup, confirmation, recovery, redirects, and password policy are verified. It is currently `false`, so public signup and recovery remain visibly unavailable. |
| `RATE_LIMIT_SECRET` | Server only | Optional secret for the protected Supabase `consume_rate_limit` RPC; absent/unreachable shared storage falls back to process limits. Never expose this value to the browser. |
| `BUFFER_TEST_AUTHORITY` | Local verification only | Optional public authority for manual checks; the application does not load it automatically. |
| `BUFFER_ALERT_STORE` | Local worker only | Optional path for the durable local SQLite worker; defaults to `.local/alerts.sqlite` and is ignored by Git. |

No AI API key, signing wallet, private key, or service-role key is required by the application. Higgsfield produced marketing media; it is not a runtime integration. No `SITE_URL` application variable is required: auth redirects use the current origin, and Supabase must explicitly allow each deployed `/auth` URL.

`.env.local` and `.vercel` are ignored by Git. Public variables are embedded at build time; redeploy after changing them. Configure each Vercel environment deliberately. Never put an RPC URL, private key, or setup credential in client code, reports, issue comments, or public documentation.

## Protocol provider

The default live provider is the official `@velocity-exchange/sdk` **0.23.1**, bound to Velocity program `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`. Current Velocity settlement uses verified USDT spot market index `0` and fresh Pyth Lazer oracle reads. Pacifica is a fixed-origin, read-only public API provider covering Buffer's 76 configured perpetual identities; it needs no API key or RPC. Jupiter Perps uses the fixed mainnet program `PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu` for bounded inventory reads only: canonical positions, entry data, collateral custody, locked collateral-token units, and read metadata are shown, while current prices and collateral-dependent capped payoff remain unmodeled and never enter scenario totals. The legacy Drift provider uses `@drift-labs/sdk` **2.161.0-beta.5** and program `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` only when selected explicitly; its scenario path is paused and does not represent migrated Velocity state. See [provider details](PROVIDER.md) for PDA, oracle, freshness, and migration behavior.

The server-side RPC endpoint used by Velocity, Jupiter, and legacy Drift must be Solana **mainnet-beta**. Those providers reject a different genesis hash, check program ownership and account identity, and never substitute a sample when a live read fails. Requests have an 18-second abort deadline; Vercel functions need at least 30 seconds. Each process allows 60 reads per minute and four concurrent reads. The live-read route also applies the configured distributed limit when available; see `src/server/rate-limit.ts` and the environment template for its current readiness. A dedicated RPC is still needed for sustained provider capacity. Pacifica uses its fixed HTTPS API boundary and its own timestamp freshness rule.

## Supabase

Create or use the dedicated Buffer project **`vhbngdatlowfnwaymvuq`** in **operatoruplift's Org**. Apply all files in `supabase/migrations/` in timestamp order through the Supabase migration workflow. They create `saved_reports`, the user/date index, authenticated select/insert/delete grants, owner-only row-level security, and strict report/title constraints, plus the additive owner-scoped alert pipeline tables (`alert_rules`, `alert_events`, and `alert_outbox`). Anonymous users have no table privileges. Reports are immutable historical JSON records with a maximum size of 256 KiB and are never inputs to the live reader.

In Auth settings:

1. Keep the email provider available for existing confirmed accounts, but leave `NEXT_PUBLIC_AUTH_EMAIL_READY=false` until delivery is ready.
2. Set Site URL to `https://bufferonsolana.vercel.app` and allow `https://bufferonsolana.vercel.app/auth`; keep `https://buffer-lovat.vercel.app/auth` during the alias transition and add `http://127.0.0.1:3001/auth` plus `http://localhost:3001/auth` for local development.
3. Configure a minimum 12-character password, leaked-password protection, and production SMTP delivery. The form enforces 12 characters for new passwords, but server-side policy must also enforce it.
4. Set the two public environment variables and rebuild.
5. Verify confirmed signup, login, recovery, logout, save/download/delete, and cross-user isolation with dedicated disposable accounts. Check Supabase security and performance advisors.
6. Set `NEXT_PUBLIC_AUTH_EMAIL_READY=true` only after those checks pass.

The browser SDK manages sessions and refreshes tokens. Database RLS is the authorization boundary; client-rendered email or user state never authorizes access. Device-local reports are stored in browser storage and are separate from Supabase. The service worker bypasses Auth, Supabase, API, private reports, and live data.

### Provisioning status

The dedicated project **Buffer** (`vhbngdatlowfnwaymvuq`, US East) was created in **operatoruplift's Org** after the organization was upgraded to Pro. Supabase quoted **$10/month** for the additional project. Both saved-report migrations and the September 15 additive alert migration are recorded as applied; the September 19 hardening and September 20 function-permission migrations are now applied; owner isolation, malformed JSON rejection, restricted insert columns, query indexing, and the alert tables' RLS posture have been verified. The shipped browser monitor uses bounded localStorage state and a local mock sink, so hosted delivery is not implied by the production deploy; a hosted provider-polling worker and verified external destination are still required. See [database verification](DATABASE-VERIFICATION.md) and the [alert runbook](ALERTS.md).

The original implementation recorded confirmed-account password sign-in and private report CRUD with disposable confirmed accounts. That is historical evidence from the original version. The current redesign's browser auth and report coverage uses the installed Supabase SDK with intercepted/mock transport; it does not prove a current production auth or email journey. Production SMTP delivery, redirect allowlists, Auth password policy, and compromised-password screening still require management-side configuration and verification. Do not treat the built-in restricted Supabase mail sender as public production signup delivery.

## Vercel

The Vercel project is `operatoruplift/buffer`, linked to [the public source repository](https://github.com/operatoruplift/buffer), with the production alias [bufferonsolana.vercel.app](https://bufferonsolana.vercel.app). The current project has `SOLANA_RPC_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in **Production only**. `RATE_LIMIT_SECRET` is also configured server-side in Production. `NEXT_PUBLIC_AUTH_EMAIL_READY=false` is configured in Production, Preview, and Development; keep it false until the Supabase email and Auth management checks above pass. `BUFFER_TEST_AUTHORITY` is a local verification value and is not required for deployment. Use the Next.js framework setting in `vercel.json`, Node route execution, and a 30-second function duration. Do not use static export or edge-only hosting for the RPC routes.

Build with `npm ci` and `npm run build`. From a Node 24 checkout linked to this project, the authenticated Vercel CLI route is `npx --yes vercel@59.16.0 --prod`; the Vercel dashboard's Git production deployment is equivalent. Deploy a final committed state and verify `/`, `/app`, `/auth`, `/demo`, the manifest, and the live API routes after the deployment. Redeploy after changing environment variables. The initial RPC is Solana's shared mainnet endpoint; it is suitable for evaluation but has no application-specific capacity guarantee.
The latest production verification also exercises `/brand-kit`, `/api/config`, and `/api/snapshot` with a public Velocity authority. The production alias is [bufferonsolana.vercel.app](https://bufferonsolana.vercel.app).

## Installable app

See [PWA details](PWA.md) for supported browser installation and offline behavior. The same responsive web application works on mobile and desktop, and the service worker provides a clearly labeled fixed sample offline. Native App Store/Play Store packages and signed desktop installers are outside this delivery.

## Hosted monitoring addition — September 20

The current monitoring implementation adds authenticated `/api/monitoring` configuration/status/check endpoints and the protected `/api/monitoring/worker` scheduled endpoint. It uses the existing public Supabase SDK key with owner JWTs for RLS, and a separate narrowly scoped worker RPC credential; no service-role key is required. Read [the alert runbook](ALERTS.md) and [Discord contract](DISCORD-ALERTS.md) before activation. The integration matrix records actual live-verification status.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `BUFFER_ALERT_WORKER_SECRET` | Server only | Random 32+ character secret; only its SHA-256 hash is stored in the private worker credential row. |
| `CRON_SECRET` | Server only | A different 32+ character secret authenticating the scheduled endpoint; also stored in Supabase Vault for the scheduler. |
| `BUFFER_ALERT_SEND_ENABLED` | Server only | Defaults to false. Keep false until an exact destination and test message are authorized. |
| `BUFFER_ALERT_NOTIFICATION_MODE` | Server only | Defaults to `test`; labels genuine live observations as test notifications. `production` is a deliberate separate choice. |
| `BUFFER_DISCORD_DESTINATIONS_JSON` | Server only | One reviewed Discord configuration with webhook credentials, channel ID, stable config UUID and explicit allowed owner UUIDs. See the exact schema in the provider runbook. |

Apply `20260920020000_hosted_monitoring.sql` only after its PostgreSQL verification passes. Initialize `private.buffer_monitor_credentials` with a SHA-256 hash through the administrator connection. Never commit the plaintext secret or put it in a URL. Deploy the new server variables before scheduling. Worker routes declare 60-second duration; their coordinator bounds due-provider work and dispatch. Browser requests time out after 45 seconds.

Supabase Pro hosts the minute scheduler. The reviewed `supabase/setup/monitoring-scheduler.sql` installs `pg_cron` and pinned `http` 1.6, creates a private fixed-origin helper with an empty search path, and denies browser/service-role execution. Vault reads are denied to browser roles. Setup attempts to revoke base HTTP execution, but hosted managed grants may remain; postflight records the actual ACL. The private helper and Vault, rather than the general HTTP primitive, protect the scheduler credential. It **does not activate a job**. Store `buffer_monitor_cron_secret` securely in Vault with the same value as Vercel's `CRON_SECRET`; inspect existing `cron.job` entries before scheduling `buffer-monitor-minute` once per minute.

The synchronous helper uses HEAD, the non-redirecting method in reviewed http 1.6, with certificate/hostname verification, cleared inherited curl overrides, a five-second connection limit and a 55-second total limit. The Vault-derived Authorization header exists only during the request. It refuses debug server logging and requires a 200 response with the exact bounded six-field worker acknowledgement. It never includes provider payloads or secrets in scheduler errors. The protected database worker deduplicates each minute across requests.

Initial hosted preparation used pg_net, but postflight found its managed queue grants remained public despite tenant revocation attempts. No Buffer job or credential-bearing queue request was activated. The synchronous helper replaces that path; Buffer does not use the pg_net queue.

Check both `cron.job_run_details` and completed scheduled entries in `private.buffer_monitor_runs`. A valid HTTP acknowledgement can represent a deduplicated request; require a new completed persisted run for heartbeat evidence. Alert status considers scheduled runs only and expires after 180 seconds. Manual checks are not scheduler evidence.

To pause or roll back, disable this named cron job, set sending to false and redeploy/promote the known-good website. Keep additive tables and RLS; do not remove owner controls or discard unknown-outcome events. A remotely accepted message cannot be retracted by rollback. Rotate the cron value in both Vercel and Vault while paused; rotate the worker secret and stored hash together, then deploy and recheck authorization/heartbeat. Rotate Discord credentials through the provider runbook.

Official references verified for this pass: [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions), [Supabase Cron](https://supabase.com/docs/guides/cron), [Supabase HTTP extension](https://supabase.com/docs/guides/database/extensions/http) and [reviewed http 1.6 source](https://github.com/pramsey/pgsql-http/blob/v1.6.0/http.c), and [Vercel cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
