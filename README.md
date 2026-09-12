# Buffer

**Understand what a market move would do to your perpetual positions.** Buffer is a read-only Solana / Velocity explorer with precise price scenarios, clear coverage, private saved reports, and an installable mobile and desktop web app. Legacy Drift reads remain available behind an explicit paused-deployment selector.

**Last updated:** September 12, 2026.

[Website](https://buffer-lovat.vercel.app) · [Open the app](https://buffer-lovat.vercel.app/app) · [Watch the demos](https://buffer-lovat.vercel.app/demo) · [Public source](https://github.com/operatoruplift/buffer)

Paste a public authority, select one Velocity subaccount, and explore a shared −20% to +20% price move on eligible SOL, BTC, and ETH perpetual positions. The current Velocity deployment settles in USDT; baseline SDK metrics remain USD. Buffer keeps the current baseline separate from modeled price P&L and explains what is excluded. Three deterministic samples work immediately, without an account or RPC configuration. The **Explore a live account** button opens a public example without a wallet connection.

## What is included

- A responsive website with an interactive sample, feature and method explanations, installation guidance, and a video gallery.
- Live Velocity account discovery through the official `@velocity-exchange/sdk` **0.23.1**, explicit subaccount selection, position contributions, collateral/debt/order inventory, freshness checks, and a Method dialog.
- An explicit legacy Drift provider for historical reads. Drift is paused and its balances do not migrate to Velocity; the app links to the official migration reference instead of silently mixing deployments.
- Precise JSON downloads, device-local saved reports with no account, and optional Supabase sign-in to save, download, and delete private historical reports.
- A PWA for supported mobile and desktop browsers, with original app icons and a clearly labeled offline sample.
- A narrated product demo, an actual Higgsfield-assisted pitch, and a technical walkthrough, with captions and transcripts.

The Vercel site, public routes, and media are deployed. The current provider cutover was verified against fresh Velocity mainnet account, market, and oracle reads: the public example has +0.05 BTC and +2 ETH on subaccount 0, USDT collateral, and valid oracle observations at the observed read slot. Every load refetches live data and keeps account, market, oracle, and current-slot observations visible. **Public signup and password-recovery email actions remain disabled until production SMTP, Auth redirects, and server-side password policy are configured and verified.** The public explorer and device-local reports need no sign-in. See [deployment status](docs/DEPLOYMENT.md) and [verification](docs/VERIFICATION.md) for exact checks and limits.

## Run locally

```sh
nvm install
nvm use
npm ci
cp .env.example .env.local
npm run dev -- --port 3001
```

Open `http://127.0.0.1:3001`; the explorer is at `/app`. Local Node is pinned to **24.16.0** in `.nvmrc`; `package.json` accepts Node **24.x**. Vercel selects a supported 24.x patch; the verified deployment used **24.19.0**.

| Environment variable | Purpose |
| --- | --- |
| `SOLANA_RPC_URL` | Server-only Solana mainnet RPC. Leave blank for Sample-only use. |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional dedicated Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Optional public Supabase key; never a service-role key. |
| `NEXT_PUBLIC_AUTH_EMAIL_READY` | Keep `false` until public confirmation and recovery email flows are verified. |
| `BUFFER_TEST_AUTHORITY` | Optional public authority for manual verification; not automatically loaded by the app. |

The RPC must support `getGenesisHash`, filtered `getProgramAccounts`, `getAccountInfo`, `getMultipleAccounts`, and `getSlot`. Do not expose its URL through a `NEXT_PUBLIC_` variable. Public Supabase settings are embedded at build time, so rebuild after changing them. No wallet private key, application AI key, or service-role key is needed. Setup-only credentials shown in `.env.example` are not read by the application.

## Use Buffer

1. Choose **SOL long**, **Long + short**, or **Partial coverage**, or use **Explore a live account** / enter a public authority and explicitly select a discovered subaccount. The protocol selector defaults to current Velocity; legacy Drift is clearly marked paused. Accounts are never combined.
2. Inspect the frozen baseline, positions, and inventory. Unavailable metrics explain missing or invalid coverage.
3. Move the slider, choose a preset, or use arrow keys in 1% steps. **Reset** returns to zero. A successful **Refresh** reloads the snapshot and resets the shock.
4. Open **Method** for assumptions, exclusions, addresses, source, and separate slot observations. **Download report** saves precise JSON locally.
5. Open **My reports** to save the current report on this device with no sign-up. With a confirmed cloud account, the same screen also saves, downloads, and deletes private cloud copies. Saved copies are historical records and never refresh with the market.

Public exploration does not upload a report. Device storage occurs only when a visitor selects **Save current scenario**; cloud storage occurs only when a signed-in user selects it. Supabase row-level security limits cloud records to their owner; report downloads and deterministic samples remain available without an account.

## Arithmetic and boundaries

For signed base quantity `q`, frozen external oracle price `p`, and shock fraction `s`:

```text
Incremental price P&L = q × p × s
Hypothetical price   = p × (1 + s)
Position notional    = abs(q × p)
```

At −10%, 100 SOL at 150 USDC contributes −1,500 USDC; −0.5 BTC at 100,000 contributes +5,000 USDC; the combined change is **+3,500 USDC**. This is the deterministic sample arithmetic. Live Velocity positions are settled in verified USDT, while the SDK's net-value and funding-inclusive P&L baselines are converted and labeled USD. Zero shock produces zero. Decimal strings preserve precision; rounding occurs only for presentation. Verified quote currencies retain separate totals.

The scenario holds sizes fixed and excludes collateral-price changes, future fills, funding, fees, borrowing interest, and liquidation effects. Spot deposits, debts, and order counts remain visible. Unsupported or nonlinear contracts, LP exposure, unknown flags, inactive markets, and invalid oracle prices receive explicit exclusions. This result is incremental perpetual price P&L, not hypothetical account equity, health, or a liquidation threshold.

Live perps use the SDK's applicable oracle validity helper plus Buffer's **150-slot maximum lag**. Spot valuation also checks protocol margin staleness, volatility, sufficient data, and a **1% confidence cap**. Live snapshots expire **120 seconds after retrieval**, or earlier when specified. Account, market, oracle, and current-slot reads are not atomic; their observations are retained separately. SDK baseline valuation may use a separately validated MM oracle. Cross-margin health is withheld for isolated positions.

Real local and deployed mainnet authority/subaccount reads succeeded with the pinned Velocity SDK. A fresh public example read had +0.05 BTC and +2 ETH, USDT collateral, and oracle lag of one slot; the scenario remains live and refetches on every read. The legacy Drift path still rejects stale or paused data rather than borrowing prices from Velocity. See [provider evidence](docs/PROVIDER.md).

## Architecture

```text
Website / demo gallery                    Optional email/password sign-in
            │                                           │
            ▼                                           ▼
/app: public explorer                         Supabase Auth session
   ├─ deterministic samples                           │
   └─ /api/accounts → explicit subaccount              ▼
      /api/snapshot → Velocity (default) or     saved_reports + owner RLS
                      legacy Drift provider    ▲  save / download / delete
                      │
              mainnet account/market/oracle checks
                      ▼                              │
              decimal-string Snapshot               │
                      ▼                              │
              pure scenario calculation → JSON report

PWA service worker → public offline sample and icon allowlist only
```

| Area | Source |
| --- | --- |
| Website, explorer, account screen, videos | `src/app/{page,app/page,auth/page,demo/page}.tsx` |
| Interactive UI | `src/components/Landing.tsx`, `Dashboard.tsx`, `AccountPanel.tsx`, `AuthForm.tsx` |
| Provider selection and query validation | `src/server/providers.ts`, `src/server/boundary.ts` |
| Velocity acquisition and cleanup | `src/server/velocity.ts` |
| Velocity coverage and normalization | `src/server/velocity-normalize.ts` |
| Legacy Drift compatibility | `src/server/drift.ts`, `src/server/normalize.ts` |
| Request validation and limits | `src/server/boundary.ts` |
| Types, scenario math, fixtures, reports | `src/lib/` |
| Private report schema and policies | `supabase/migrations/` |
| Installation and offline sample | `src/app/manifest.ts`, `src/components/PwaClient.tsx`, `public/sw.js`, `public/offline.html` |

The application uses Next.js **16.3.4**, React **19.3.0**, TypeScript **5.9.3**, Velocity SDK **0.23.1**, Velocity's web3.js **1.99.0** alias, legacy Drift SDK **2.161.0-beta.5**, spl-token **0.4.13**, decimal.js **10.6.0**, and Supabase JS **2.116.0**. Direct versions and the lockfile are pinned. Captured public State, perp, spot, and oracle buffers guard both the current Velocity decoder and the legacy Drift compatibility path.

RPC requests have an 18-second abort deadline and request-owned loaders without polling timers. Client/listener cleanup runs on completion or failure. The process cap is 60 reads/minute and four concurrent reads; a scaled service needs a shared ingress limit. Provider errors are sanitized and never silently replaced by samples. A failed refresh retains the old snapshot visibly as stale and disables calculations. Generation checks prevent late account, subaccount, or previous-user responses from replacing current state.

There is no wallet signing, custody, transaction, trading, or background monitoring path. The PWA caches only its explicit public offline assets; API responses, Supabase requests, auth, saved reports, and live page data bypass that cache. Browser-supported installation is included; native store packages and signed desktop installers are not.

## Verify and deploy

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Install Chromium with `npx playwright install chromium` if necessary. Playwright normally launches or reuses port 3001. Set `PLAYWRIGHT_BASE_URL` to exercise an already running deployment. The real Auth suite additionally needs `BUFFER_AUTH_FIXTURES` pointing to a private JSON array of two disposable confirmed accounts (`email` and `password`); otherwise those two desktop/mobile cases are skipped. Never commit fixture credentials. Most live UI state cases deliberately mock API responses and do not prove RPC success.

Vercel uses the explicit Next.js framework setting in `vercel.json`, Node route execution, and 30-second RPC function limits. The dedicated Supabase project and both saved-report migrations are deployed. The server RPC must be a Solana mainnet endpoint; use a dedicated endpoint for sustained production capacity. Follow [deployment](docs/DEPLOYMENT.md) for cloud configuration and email setup, [database verification](docs/DATABASE-VERIFICATION.md) for ownership checks, and [PWA documentation](docs/PWA.md) for installation limitations.

## Descriptions, design, and videos

- [Short and full Markdown descriptions](docs/DESCRIPTION.md)
- [Design references and MotionSites recommendations](docs/DESIGN.md)
- [Video files, transcripts, and Higgsfield provenance](docs/VIDEO.md)
- [Submission draft and sample demonstration](docs/SUBMISSION.md)

Buffer's refined gauge mark, wordmark, favicon, and monochrome variants live in `public/brand/`; install icons are in `public/icons/`. Verified token marks live in `public/tokens/`, including transparent Solana and USDT assets. The UI and media distinguish product identity from descriptive protocol names and sample data.

The [official event page](https://hackathons.solana.com/hackathons/perps-and-prediction-markets), checked September 11, lists September 18–25, 2026. Perps-only eligibility and pre-event development eligibility remain unverified. No event submission or acceptance is claimed.
