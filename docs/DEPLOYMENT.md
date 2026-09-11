# Deployment and cloud configuration

Buffer runs on Node 24 with Next.js App Router. `/` is the public website, `/app` is the live Velocity explorer, and `/auth` contains optional email/password sign-in. The protocol selector exposes the paused legacy Drift reader. All scenario functionality, live public reads, device-local reports, and downloads work without a cloud account.

## Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `SOLANA_RPC_URL` | Server only | Solana mainnet RPC with `getGenesisHash`, `getProgramAccounts`, `getAccountInfo`, `getMultipleAccounts`, and `getSlot`. The provider checks the mainnet genesis hash. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Dedicated Buffer project's API URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable key; never a service-role or secret key. |
| `NEXT_PUBLIC_AUTH_EMAIL_READY` | Public | Set `true` only after email signup, confirmation, recovery, redirects, and password policy are verified. It is currently `false`, so public signup and recovery remain visibly unavailable. |
| `BUFFER_TEST_AUTHORITY` | Local verification only | Optional public authority for manual checks; the application does not load it automatically. |

No AI API key, signing wallet, private key, or service-role key is required by the application. Higgsfield produced marketing media; it is not a runtime integration. No `SITE_URL` application variable is required: auth redirects use the current origin, and Supabase must explicitly allow each deployed `/auth` URL.

`.env.local` and `.vercel` are ignored by Git. Public variables are embedded at build time; redeploy after changing them. Configure production and preview environments deliberately. Never put an RPC URL, private key, or setup credential in client code, reports, issue comments, or public documentation.

## Protocol provider

The default server provider is the official `@velocity-exchange/sdk` **0.23.1**, bound to Velocity program `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`. Current Velocity settlement uses verified USDT spot market index `0` and fresh Pyth Lazer oracle reads. The legacy Drift provider uses `@drift-labs/sdk` **2.161.0-beta.5** and program `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` only when selected explicitly. See [provider details](PROVIDER.md) for PDA, oracle, freshness, and migration behavior.

The endpoint must be Solana **mainnet-beta**. The provider rejects a different genesis hash, checks program ownership and account identity, and never substitutes a sample when a live read fails. Requests have an 18-second abort deadline; Vercel functions need at least 30 seconds. Each process allows 60 reads per minute and four concurrent reads. A dedicated RPC is recommended before sustained traffic; add shared ingress limits when running more than one instance.

## Supabase

Create or use the dedicated Buffer project **`vhbngdatlowfnwaymvuq`** in **operatoruplift's Org**. Apply both files in `supabase/migrations/` in timestamp order through the Supabase migration workflow. They create `saved_reports`, the user/date index, authenticated select/insert/delete grants, owner-only row-level security, and strict report/title constraints. Anonymous users have no table privileges. Reports are immutable historical JSON records with a maximum size of 256 KiB and are never inputs to the live reader.

In Auth settings:

1. Keep the email provider available for existing confirmed accounts, but leave `NEXT_PUBLIC_AUTH_EMAIL_READY=false` until delivery is ready.
2. Set Site URL to `https://buffer-lovat.vercel.app` and allow exactly `https://buffer-lovat.vercel.app/auth`; add `http://127.0.0.1:3001/auth` for local development.
3. Configure a minimum 12-character password, leaked-password protection, and production SMTP delivery. The form enforces 12 characters for new passwords, but server-side policy must also enforce it.
4. Set the two public environment variables and rebuild.
5. Verify confirmed signup, login, recovery, logout, save/download/delete, and cross-user isolation with dedicated disposable accounts. Check Supabase security and performance advisors.
6. Set `NEXT_PUBLIC_AUTH_EMAIL_READY=true` only after those checks pass.

The browser SDK manages sessions and refreshes tokens. Database RLS is the authorization boundary; client-rendered email or user state never authorizes access. Device-local reports are stored in browser storage and are separate from Supabase. The service worker bypasses Auth, Supabase, API, private reports, and live data.

### Provisioning status

The dedicated project **Buffer** (`vhbngdatlowfnwaymvuq`, US East) was created in **operatoruplift's Org** after the organization was upgraded to Pro. Supabase quoted **$10/month** for the additional project. Both saved-report migrations are applied; owner isolation, malformed JSON rejection, restricted insert columns, and query indexing have been verified. See [database verification](DATABASE-VERIFICATION.md).

Confirmed-account password sign-in and private report CRUD work with disposable confirmed accounts. Production SMTP delivery, redirect allowlists, Auth password policy, and compromised-password screening still require management-side configuration and verification. Do not treat the built-in restricted Supabase mail sender as public production signup delivery.

## Vercel

The Vercel project is `operatoruplift/buffer`, linked to [the public source repository](https://github.com/operatoruplift/buffer), with the production alias [buffer-lovat.vercel.app](https://buffer-lovat.vercel.app). Production, Preview, and Development contain `SOLANA_RPC_URL`, the two public Supabase variables, and an explicit `NEXT_PUBLIC_AUTH_EMAIL_READY=false` config value. Use the Next.js framework setting in `vercel.json`, Node route execution, and a 30-second function duration. Do not use static export or edge-only hosting for the RPC routes.

Build with `npm ci` and `npm run build`. Configure server-only `SOLANA_RPC_URL` and the two public Supabase variables in the intended Vercel environments. Redeploy after changing them. The initial RPC is Solana's shared mainnet endpoint; it is suitable for evaluation but has no application-specific capacity guarantee.

## Installable app

See [PWA details](PWA.md) for supported browser installation and offline behavior. The same responsive web application works on mobile and desktop, and the service worker provides a clearly labeled fixed sample offline. Native App Store/Play Store packages and signed desktop installers are outside this delivery.
