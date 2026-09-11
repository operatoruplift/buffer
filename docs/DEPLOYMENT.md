# Deployment and cloud configuration

Buffer runs on Node 24 with Next.js App Router. `/` is the public website, `/app` is the position explorer, and `/auth` contains optional email/password sign-in, signup, and password recovery. All scenario functionality works without a cloud account.

## Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `SOLANA_RPC_URL` | Server only | Solana mainnet RPC with `getGenesisHash`, `getProgramAccounts`, `getAccountInfo`, `getMultipleAccounts`, and `getSlot`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Dedicated project's API URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Enabled publishable key, never a service-role or secret key. |
| `NEXT_PUBLIC_AUTH_EMAIL_READY` | Public | Set `true` only after email signup, confirmation, recovery, and redirects have been verified. Otherwise signup/recovery remain visibly unavailable. |
| `BUFFER_TEST_AUTHORITY` | Local verification only | Optional real public authority; not used automatically by the app. |

No AI API key, signing wallet, private key, or service-role key is required by the application. Higgsfield is used to produce marketing media, not during app usage. No `SITE_URL` application variable is required: auth redirects use the current origin, and Supabase must explicitly allow each deployed `/auth` URL.

`.env.local` and `.vercel` are ignored by Git. Public variables are embedded at build time; redeploy after changing them. Configure production and preview environments deliberately; never use wildcard redirects across untrusted domains.

## Supabase

Create a dedicated Buffer project. Apply both files in `supabase/migrations/` in timestamp order through the Supabase migration workflow. They create `saved_reports`, a user/date index, authenticated select/insert/delete grants, owner-only row-level security, and strict report/title constraints. Anonymous users have no table privileges. Reports are immutable historical JSON records with a maximum size of 256 KiB. Users may download or delete their own records. Stored reports never become inputs to the live account reader.

In Auth settings:

1. Enable the email provider and email confirmation.
2. Set Site URL to `https://buffer-lovat.vercel.app` and allow exactly `https://buffer-lovat.vercel.app/auth`; add `http://127.0.0.1:3001/auth` only for local development.
3. Configure a minimum 12-character password, leaked-password protection, and production SMTP delivery. The form enforces 12 characters for signup and recovery, but server-side password policy must also enforce it.
4. Set the two public environment variables and rebuild.
5. Verify confirmed signup, login, password recovery, logout, save/download/delete, and cross-user isolation using dedicated test accounts. Check Supabase security/performance advisors. Only then enable `NEXT_PUBLIC_AUTH_EMAIL_READY=true` and rebuild.

The browser SDK manages sessions and refreshes tokens. Database RLS is the authorization boundary; client-rendered email or user state never authorizes access. Service workers bypass auth, Supabase, API, private reports, and Next.js data requests.

### Provisioning status

The dedicated project **Buffer** (`vhbngdatlowfnwaymvuq`, US East) was created in **operatoruplift's Org** after the owner upgraded the organization to Pro. Supabase quoted **$10/month** for the additional project. The server RPC and public Supabase credentials are configured locally and in Vercel's production, preview, and development environments. Both database migrations have been applied; owner isolation, malformed JSON rejection, restricted insert columns, and query indexing have been verified. See [database verification](DATABASE-VERIFICATION.md).

Real password sign-in and private report CRUD work with disposable confirmed accounts. Production email delivery, redirect allowlists, and Auth password policy still require management access and SMTP configuration; neither a native CLI access token nor an operable browser session was available during setup. Do not treat the built-in restricted Supabase mail sender as public production signup delivery.

## Vercel

The dedicated project is `operatoruplift/buffer`, linked to the public source repository `https://github.com/operatoruplift/buffer`. The SDK requires Node 24; Vercel supplies the current patch within its supported 24.x runtime, while local development pins 24.16.0. Do not use static export or edge-only hosting.

Build with `npm ci` and `npm run build`. Configure server-only `SOLANA_RPC_URL`, and configure Supabase public variables only after provisioning succeeds. Use at least a 30-second function duration; each RPC read has an 18-second abort deadline. Process-local request limits are defense in depth; scaled traffic needs hosting-level or shared ingress limits.

The initial RPC configuration uses Solana's shared mainnet endpoint. It is suitable for evaluating the integration but has no application-specific capacity guarantee. Replace it with a dedicated provider endpoint before relying on sustained production traffic. Do not place authenticated RPC URLs in client code, issue comments, reports, or public documentation.

## Installable app

See [PWA details](PWA.md) for supported browser installation and offline behavior. This delivery uses the same responsive web application on mobile and desktop. It does not include App Store/Play Store submissions, native mobile packages, or signed desktop installers.
