# Deployment and cloud configuration

**Last updated:** September 16, 2026.

Buffer runs on Node 24 with Next.js App Router. `/` is the public website, `/app` is the public explorer with live Velocity as the default, modeled Pacifica reads, and inventory-only Jupiter Perps, and `/auth` contains optional email/password sign-in. The protocol selector also exposes the explicitly paused legacy Drift reader. Scenario functionality, live public reads, device-local reports, and downloads work without a cloud account.

## Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `SOLANA_RPC_URL` | Server only | Solana mainnet RPC with `getGenesisHash`, `getProgramAccounts`, `getAccountInfo`, `getMultipleAccounts`, and `getSlot`. The provider checks the mainnet genesis hash. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Dedicated Buffer project's API URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable key; never a service-role or secret key. |
| `NEXT_PUBLIC_AUTH_EMAIL_READY` | Public | Set `true` only after email signup, confirmation, recovery, redirects, and password policy are verified. It is currently `false`, so public signup and recovery remain visibly unavailable. |
| `BUFFER_TEST_AUTHORITY` | Local verification only | Optional public authority for manual checks; the application does not load it automatically. |
| `BUFFER_ALERT_STORE` | Local worker only | Optional path for the deterministic local alert-store JSON file; defaults to `.local/alert-store.json` and is ignored by Git. |

No AI API key, signing wallet, private key, or service-role key is required by the application. Higgsfield produced marketing media; it is not a runtime integration. No `SITE_URL` application variable is required: auth redirects use the current origin, and Supabase must explicitly allow each deployed `/auth` URL.

`.env.local` and `.vercel` are ignored by Git. Public variables are embedded at build time; redeploy after changing them. Configure each Vercel environment deliberately. Never put an RPC URL, private key, or setup credential in client code, reports, issue comments, or public documentation.

## Protocol provider

The default live provider is the official `@velocity-exchange/sdk` **0.23.1**, bound to Velocity program `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`. Current Velocity settlement uses verified USDT spot market index `0` and fresh Pyth Lazer oracle reads. Pacifica is a fixed-origin, read-only public API provider covering Buffer's 76 configured perpetual identities; it needs no API key or RPC. Jupiter Perps uses the fixed mainnet program `PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu` for bounded inventory reads only: canonical positions, entry data, collateral custody, locked collateral-token units, and read metadata are shown, while current prices and collateral-dependent capped payoff remain unmodeled and never enter scenario totals. The legacy Drift provider uses `@drift-labs/sdk` **2.161.0-beta.5** and program `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` only when selected explicitly; its scenario path is paused and does not represent migrated Velocity state. See [provider details](PROVIDER.md) for PDA, oracle, freshness, and migration behavior.

The server-side RPC endpoint used by Velocity, Jupiter, and legacy Drift must be Solana **mainnet-beta**. Those providers reject a different genesis hash, check program ownership and account identity, and never substitute a sample when a live read fails. Requests have an 18-second abort deadline; Vercel functions need at least 30 seconds. Each process allows 60 reads per minute and four concurrent reads. A dedicated RPC is recommended before sustained traffic; add shared ingress limits when running more than one instance. Pacifica uses its fixed HTTPS API boundary and its own timestamp freshness rule.

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

The dedicated project **Buffer** (`vhbngdatlowfnwaymvuq`, US East) was created in **operatoruplift's Org** after the organization was upgraded to Pro. Supabase quoted **$10/month** for the additional project. Both saved-report migrations and the additive alert migration are applied; owner isolation, malformed JSON rejection, restricted insert columns, query indexing, and the alert tables' RLS posture have been verified. The shipped browser monitor uses bounded localStorage state and a local mock sink, so hosted delivery is not implied by the production deploy; a protected worker and destination are still required. See [database verification](DATABASE-VERIFICATION.md) and the [alert runbook](ALERTS.md).

The original implementation recorded confirmed-account password sign-in and private report CRUD with disposable confirmed accounts. That is historical evidence from the original version. The current redesign's browser auth and report coverage uses the installed Supabase SDK with intercepted/mock transport; it does not prove a current production auth or email journey. Production SMTP delivery, redirect allowlists, Auth password policy, and compromised-password screening still require management-side configuration and verification. Do not treat the built-in restricted Supabase mail sender as public production signup delivery.

## Vercel

The Vercel project is `operatoruplift/buffer`, linked to [the public source repository](https://github.com/operatoruplift/buffer), with the production alias [bufferonsolana.vercel.app](https://bufferonsolana.vercel.app). The current project has `SOLANA_RPC_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in **Production only**. `NEXT_PUBLIC_AUTH_EMAIL_READY=false` is configured in Production, Preview, and Development; keep it false until the Supabase email and Auth management checks above pass. `BUFFER_TEST_AUTHORITY` is a local verification value and is not required for deployment. Use the Next.js framework setting in `vercel.json`, Node route execution, and a 30-second function duration. Do not use static export or edge-only hosting for the RPC routes.

Build with `npm ci` and `npm run build`. From a Node 24 checkout linked to this project, the authenticated Vercel CLI route is `npx --yes vercel@59.16.0 --prod`; the Vercel dashboard's Git production deployment is equivalent. Deploy a final committed state and verify `/`, `/app`, `/auth`, `/demo`, the manifest, and the live API routes after the deployment. Redeploy after changing environment variables. The initial RPC is Solana's shared mainnet endpoint; it is suitable for evaluation but has no application-specific capacity guarantee.
The latest production verification also exercises `/brand-kit`, `/api/config`, and `/api/snapshot` with a public Velocity authority. The production alias is [bufferonsolana.vercel.app](https://bufferonsolana.vercel.app).

## Installable app

See [PWA details](PWA.md) for supported browser installation and offline behavior. The same responsive web application works on mobile and desktop, and the service worker provides a clearly labeled fixed sample offline. Native App Store/Play Store packages and signed desktop installers are outside this delivery.
