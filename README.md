# Buffer

**Understand what a market move would do to your perpetual positions.** Buffer reads Velocity and Pacifica accounts for precise price scenarios, adds Jupiter Perps position inventory with explicit modeling limits, and keeps legacy Drift clearly paused. Explore the responsive web app, inspect coverage, and keep dated reports without connecting a wallet.

**Last updated:** September 16, 2026.

[Website](https://bufferonsolana.vercel.app) · [Open the app](https://bufferonsolana.vercel.app/app) · [Watch the demos](https://bufferonsolana.vercel.app/demo) · [Public source](https://github.com/operatoruplift/buffer)

Paste a public Solana wallet address, select an account, and explore a shared −20% to +20% price move. Pacifica adds **76 perpetual markets**, spanning crypto, equities, commodities, FX, and indexes. Velocity supports its four current SOL, BTC, ETH, and HYPE markets. The searchable market list shows coverage for each provider. Twelve deterministic fixture scenarios and a new editable four-market portfolio work immediately; **Explore a live account** loads a public example for the selected provider without a wallet connection. Market counts describe provider listings, not unique assets across exchanges.

## What is included

- A responsive website with an interactive sample, feature and method explanations, installation guidance, and a video gallery.
- A sample-only portfolio builder. The default portfolio starts with 100 SOL long at 150, 0.5 BTC short at 100,000, 8 ETH long at 2,500, and 2,500 XRP long at 2. **Add perps** searches all 76 configured sample identities; each position supports Long or Short, editable quantity and baseline price, and removal. USDC, USDT, and USD are illustrative denominations: changing the label preserves the numbers, performs no FX conversion, and creates no trade or provider read. Refreshing a sample preserves custom positions and resets only the price move.
- Live Velocity account discovery through the official `@velocity-exchange/sdk` **0.23.1**, explicit subaccount selection, position contributions, collateral/debt/order inventory, freshness checks, and a Method dialog.
- Public Pacifica account and position reads through its fixed official REST API. All 76 configured perpetual identities are checked against current market metadata, with API price timestamps and USD scenario totals. No API key or RPC configuration is required for Pacifica. See [Pacifica integration](docs/PACIFICA.md).
- A live **inventory-only Jupiter Perps reader** for canonical SOL, ETH, and BTC position identities. It shows direction, USD position size, entry price, recorded collateral, reserved collateral-token amounts, and source accounts/read slots. Current prices and capped payoff remain unmodeled, so Jupiter never enters the linear scenario total. See [Jupiter verification](docs/JUPITER-VERIFICATION.md).
- An explicit legacy Drift provider for historical reads. Drift is paused and its balances do not migrate to Velocity; the app links to the official migration reference instead of silently mixing deployments.
- Precise JSON downloads, device-local saved reports with no account, and optional Supabase sign-in to save, download, and delete private historical reports.
- A PWA for supported mobile and desktop browsers, with original app icons and a clearly labeled offline sample.
- A shared cobalt Brand component across the landing header, app, demo, auth screen, and footer, plus continuous hero and install motion with small icon pause controls and `prefers-reduced-motion` support.
- A narrated product demo, a pitch, and a technical walkthrough, with captions and transcripts. The version-2 production package uses current interface captures and Higgsfield sandbox assembly; [video provenance](docs/VIDEO.md) distinguishes this from the historical generated opener.

The public site is hosted on Vercel. Fresh local reads verified modeled Velocity and Pacifica positions and Jupiter inventory; these are point-in-time observations, not fixed example balances. Every live load refetches its source and exposes the relevant API timestamps or account/read slots. [Provider coverage](docs/PROVIDER-COVERAGE.md) and [current verification](docs/REDESIGN-VERIFICATION.md) separate implemented behavior, live evidence, and remaining external requirements. **Public signup and password-recovery email actions remain disabled until production SMTP, Auth redirects, and server-side password policy are configured and verified.** The public explorer and device-local reports need no sign-in. See [deployment status](docs/DEPLOYMENT.md) for cloud configuration.

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
| `SOLANA_RPC_URL` | Server-only Solana mainnet RPC for Velocity, Jupiter inventory, and legacy Drift. Samples and Pacifica work without it. |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional dedicated Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Optional public Supabase key; never a service-role key. |
| `NEXT_PUBLIC_AUTH_EMAIL_READY` | Keep `false` until public confirmation and recovery email flows are verified. |
| `BUFFER_TEST_AUTHORITY` | Optional public authority for manual verification; not automatically loaded by the app. |

The RPC must support `getGenesisHash`, filtered `getProgramAccounts`, `getAccountInfo`, `getMultipleAccounts`, and `getSlot`. Do not expose its URL through a `NEXT_PUBLIC_` variable. Public Supabase settings are embedded at build time, so rebuild after changing them. No wallet private key, application AI key, or service-role key is needed. Setup-only credentials shown in `.env.example` are not read by the application.

## Use Buffer

1. Choose among **12 fixed scenarios** or the editable **Four-market portfolio**. For public reads, select **Velocity** (the default), **Pacifica**, or **Jupiter Perps**, use **Explore a live account** / enter a public wallet address, and select the discovered account. Jupiter is explicitly inventory-only; legacy Drift is marked paused. In samples, use **Add perps** to search all 76 configured sample identities and edit direction, quantity, and baseline price. Accounts are never combined.
2. Inspect the frozen baseline, positions, and inventory. Unavailable metrics explain missing or invalid coverage.
3. For modeled samples, Velocity, and Pacifica, move the slider, choose a preset, or use arrow keys in 1% steps. **Reset** returns to zero. A successful live **Refresh** reloads the snapshot and resets the shock; sample refresh preserves edited positions and resets only the shock. Jupiter inventory and paused Drift do not produce a modeled price effect.
4. Open **Method** for assumptions, exclusions, addresses, source, and RPC slots or API price timestamps. **Download report** saves precise JSON locally, including edited sample positions and prices.
5. Open **My reports** to save the current report on this device with no sign-up. With a confirmed cloud account, the same screen also saves, downloads, and deletes private cloud copies. Saved copies are historical records and never refresh with the market.

Public exploration does not upload a report. Device storage occurs only when a visitor selects **Save current scenario**; cloud storage occurs only when a signed-in user selects it. Supabase row-level security limits cloud records to their owner; report downloads and deterministic samples remain available without an account.

## Arithmetic and boundaries

For signed base quantity `q`, frozen external oracle price `p`, and shock fraction `s`:

```text
Incremental price P&L = q × p × s
Hypothetical price   = p × (1 + s)
Position notional    = abs(q × p)
```

The default editable portfolio starts with 100 SOL long at 150, −0.5 BTC at 100,000, 8 ETH long at 2,500, and 2,500 XRP long at 2. At −10%, the contributions are −1,500, +5,000, −2,000, and −500 USDC for a combined **+1,000 USDC**. The preserved Long + short fixture still demonstrates the smaller two-position arithmetic: −1,500 USDC plus +5,000 USDC equals **+3,500 USDC**. USDC, USDT, and USD in the sample builder are illustrative labels only; changing denomination preserves numeric inputs and performs no FX conversion. Live Velocity positions remain settled in verified USDT, while the SDK's net-value and funding-inclusive P&L baselines are converted and labeled USD. Pacifica API price effects are labeled USD and do not create invented USDC live pairs. Zero shock produces zero. Decimal strings preserve precision; rounding occurs only for presentation. Verified quote currencies retain separate totals.

The scenario holds sizes fixed and excludes collateral-price changes, future fills, funding, fees, borrowing interest, and liquidation effects. Spot deposits, debts, and order counts remain visible. Unsupported or nonlinear contracts, LP exposure, unknown flags, inactive markets, and invalid oracle prices receive explicit exclusions. This result is incremental perpetual price P&L, not hypothetical account equity, health, or a liquidation threshold.

Velocity perps use the SDK's applicable oracle validity helper plus Buffer's **150-slot maximum lag**. Spot valuation also checks protocol margin staleness, volatility, sufficient data, and a **1% confidence cap**. Pacifica uses its API's USD oracle prices, with a **120-second price-age limit** and explicit API provenance; these are not independently verified Solana oracle reads. USDC margin balances are distinct from USD scenario totals, with no assumed peg conversion. Live snapshots expire at most **120 seconds after retrieval**, or earlier when the source price expires. Reads are not atomic. SDK baseline valuation may use a separately validated MM oracle; cross-margin health is withheld for isolated positions.

The latest recorded local verification returned eligible Velocity and Pacifica positions and a Jupiter inventory row. Jupiter validates canonical position PDAs, ownership, pool membership, and collateral custody; `lockedAmount` keeps the collateral token's units and is not presented as a verified USD profit cap. Current Jupiter oracle prices and a faithful capped-payoff model remain outside the implementation. The legacy Drift path rejects stale or paused data rather than borrowing Velocity prices. See the [provider matrix](docs/PROVIDER-COVERAGE.md) and [Jupiter evidence](docs/JUPITER-VERIFICATION.md); older Velocity observations remain documented in [PROVIDER.md](docs/PROVIDER.md).

## Architecture

```text
Website / demo gallery                    Optional email/password sign-in
            │                                           │
            ▼                                           ▼
/app: public explorer                         Supabase Auth session
   ├─ deterministic samples                           │
   └─ /api/accounts → explicit subaccount              ▼
      /api/snapshot → Velocity (default),      saved_reports + owner RLS
                      Pacifica, legacy Drift  ▲  save / download / delete
                      Jupiter (inventory only)
                      │
              RPC or public API validation
                      ▼                              │
              decimal-string Snapshot               │
                      ▼                              │
              pure scenario calculation → JSON report

PWA service worker → public offline sample and icon allowlist only
```

| Area | Source |
| --- | --- |
| Website, explorer, account screen, videos | `src/app/{page,app/page,auth/page,demo/page}.tsx` |
| Interactive UI | `src/components/Landing.tsx`, `Dashboard.tsx`, `SampleBuilder.tsx`, `AccountPanel.tsx`, `AuthForm.tsx`, `Brand.tsx`, `TokenIcon.tsx` |
| Provider selection and query validation | `src/server/providers.ts`, `src/server/boundary.ts` |
| Velocity acquisition and cleanup | `src/server/velocity.ts` |
| Velocity coverage and normalization | `src/server/velocity-normalize.ts` |
| Pacifica public API acquisition and normalization | `src/server/pacifica.ts`, `src/server/pacifica-normalize.ts` |
| Jupiter inventory decoding, validation, and acquisition | `src/server/jupiter-decoder.ts`, `jupiter-normalize.ts`, `jupiter.ts`, `jupiter-provider.ts` |
| Legacy Drift compatibility | `src/server/drift.ts`, `src/server/normalize.ts` |
| Request validation and limits | `src/server/boundary.ts` |
| Types, scenario math, fixtures, editable sample portfolio, reports | `src/lib/`, especially `sample-builder.ts`, `report.ts`, and `device-reports.ts` |
| Private report schema and policies | `supabase/migrations/` |
| Installation and offline sample | `src/app/manifest.ts`, `src/components/PwaClient.tsx`, `public/sw.js`, `public/offline.html` |

The application uses Next.js **16.3.4**, React **19.3.0**, TypeScript **5.9.3**, Velocity SDK **0.23.1**, Velocity's web3.js **1.99.0** alias, legacy Drift SDK **2.161.0-beta.5**, spl-token **0.4.13**, decimal.js **10.6.0**, and Supabase JS **2.116.0**. Direct versions and the lockfile are pinned. Captured public State, perp, spot, and oracle buffers guard both the current Velocity decoder and the legacy Drift compatibility path.

RPC requests have an 18-second total abort deadline, an 8 MiB decoded response bound, and request-owned loaders without polling timers. Pacifica has its own 18-second/1 MiB fixed-origin boundary. Reads reject redirects and use no-store. The process cap is 60 reads/minute and four concurrent reads; a scaled service needs a shared ingress limit. Provider errors are sanitized and never silently replaced by samples. A failed refresh retains the old snapshot visibly as stale and disables calculations. Generation checks prevent late account, subaccount, or previous-user responses from replacing current state. Auth writes and SDK storage commits are bound to the initiating user and session; uncertain cloud writes require reloading the library before retry.

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

Vercel uses the explicit Next.js framework setting in `vercel.json`, Node route execution, and 30-second RPC function limits. The dedicated Supabase project, saved-report migrations, and owner-scoped alert tables are deployed; a protected worker and destination are still required before hosted delivery is enabled. The server RPC must be a Solana mainnet endpoint; use a dedicated endpoint for sustained production capacity. Follow [deployment](docs/DEPLOYMENT.md) for cloud configuration and email setup, [database verification](docs/DATABASE-VERIFICATION.md) for ownership checks, and [PWA documentation](docs/PWA.md) for installation limitations.

## Descriptions, design, and videos

- [Short and full Markdown descriptions](docs/DESCRIPTION.md)
- [Design references and MotionSites recommendations](docs/DESIGN.md)
- [Video files, transcripts, and Higgsfield provenance](docs/VIDEO.md)
- [Submission draft and sample demonstration](docs/SUBMISSION.md)

Buffer's ribbon B monogram, wordmark, favicon, transparent PNG, and monochrome variants live in `public/brand/`; install icons are in `public/icons/`. The primary browser icon is the blue install tile at `/icons/icon.svg?v=tile4`; `public/favicon.ico` retains the unchanged 192×192 PNG fallback. The shared `Brand` component uses the cobalt mark and Helvetica/Arial at weight 550 across the landing header, app, demo, auth screen, and footer. Verified token marks live in `public/tokens/`, including transparent Solana and USDT assets, and the shared `TokenIcon` component reuses those local originals for market rows and the sample builder. The UI and media distinguish product identity from descriptive protocol names and sample data.

The [official event page](https://hackathons.solana.com/hackathons/perps-and-prediction-markets), checked September 11, lists September 18–25, 2026. Perps-only eligibility and pre-event development eligibility remain unverified. No event submission or acceptance is claimed.
