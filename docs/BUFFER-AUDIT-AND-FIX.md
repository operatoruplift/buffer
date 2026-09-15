# Buffer implementation audit and fix

**Audit date:** 2026-09-16 (Asia/Ho_Chi_Minh)
**Audited repository:** `/Users/rvaclassic/Documents/Codex/2026-09-11/files-pasted-by-the-user-build/outputs/buffer`  
**Audited production baseline revision:** `9a4fbcc721536a8016c356b69dca70faec2c1d9c` (`main`)  
**Current source revision:** `origin/main` (deployed release)  
**Remote:** `https://github.com/operatoruplift/buffer.git`  
**Package manager:** npm with `package-lock.json`  
**Runtime:** Node 24.x; Next 16.3.4; React 19.3.0; TypeScript 5.9.3; Playwright 1.63.0; Vitest 5.0.0

This report is the current implementation record for the selected Meridial Light design and the authorized Buffer product flows. It reconciles the current source with rendered local and public behavior. Older handoff and verification documents remain historical records; their dates and claims are not treated as current deployment proof.

## Build and deployment identity

- Local development URL: `http://127.0.0.1:3001` (`npm run dev -- --port 3001`).
- Production alias: [bufferonsolana.vercel.app](https://bufferonsolana.vercel.app).
- Production deployment inspected: `https://buffer-efaoij8l3-operatoruplift.vercel.app`.
- Vercel inspection record: [deployment HhWEMMXpcRz6mZR4wuRtwMngk8sG](https://vercel.com/operatoruplift/buffer/HhWEMMXpcRz6mZR4wuRtwMngk8sG).
- The inspected production deployment was ready and aliased to `https://bufferonsolana.vercel.app`. The alias and API checks below were made against a fresh public browser/fetch context; future documentation updates should repeat the route and API checks after the next deploy.
- The audited worktree was clean at capture time. `next-env.d.ts` was restored after dev-server generation; `work/` is ignored evidence output and is intentionally not part of the application source commit.
- Production deployment was completed after local review; no environment values were changed. The current alias points to the reviewed release.

## Evidence identity

| Evidence | Capture details |
| --- | --- |
| Local baseline | Chromium/Playwright at 1440×1000 and 390×844 for `/`, `/app`, `/auth`, `/demo`; captured before the latest audit repairs. |
| Local after renders | Chromium/Playwright at 1440×1000 and matched 390×844 viewport captures for the same routes. The original `landing-1440.png` and `landing-390.png` are full-page captures; `landing-390-viewport.png` is the matched viewport capture. |
| Public parity | Fresh Chromium/Playwright contexts against `https://bufferonsolana.vercel.app` at 1440×1000 and 390×844 for `/`, `/app`, `/auth`, `/demo`; public HTML and accessible names were inspected. |
| Motion capture | Chromium/Playwright, normal motion, `2026-09-15T07:33:17.659Z`; hero time advanced, board transition was measured, pause/resume was exercised, B4 cards were scrolled into view, and B6 refraction was sampled. |
| Responsive/reduced motion | Chromium/Playwright at 320×800, 375×812, 720×450 and reduced motion; `2026-09-15T07:25:35.495Z`. Every route had `scrollWidth === viewport width` and focused controls remained visible. |
| Live API capture | Fresh fetches to the production alias, `2026-09-15T07:38:56.722Z`, with public example authorities only. No credentials were printed or stored. |
| Local risk-context capture | Fresh local Velocity read, `2026-09-15T08:14:01.363Z`, with public authority `DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2`; collateral, maintenance requirement, headroom and current SDK status were returned. |
| Local alert pipeline | Deterministic fixture run, `2026-09-15T09:38:56Z`; one rule crossed, one event/outbox item was claimed, and one mock delivery was recorded. |
| Post-deploy risk context | Fresh production Velocity read, `2026-09-15T10:00:26.541Z`; risk context returned `clear` with collateral `1908.644378`, requirement `225.402134`, and headroom `1683.242244`. |

Evidence files are local, ignored artifacts under `work/evidence/`; they are available in the working directory for review and are referenced below.

## Requirement ledger

| ID / selected reference | Expected visible behavior and source | Status, discrepancy, and fix | Functional evidence | Visual evidence | External prerequisite |
| --- | --- | --- | --- | --- | --- |
| **R1 — Meridial Light hero** | Predominantly light ivory/ice opening, white surfaces, ink/cobalt type, centered heading, 1440px composition, approximately 64.5/35.5 copy/media split, bounded cinematic film. | **Verified locally; verified live.** `Landing.tsx` and `landing.css` use the selected copy, light palette, shared `Brand`, local film/poster, and `1.29fr / .71fr` desktop split. The earlier dark B3 hero is retained only as historical provenance. | `/` loaded directly and on refresh; heading and `Open Buffer` route observed locally and on production. | `before/landing-1440.png`, `after/landing-1440.png`, `public-baseline/landing-1440.png`. | None for the committed design. |
| **R2 — Real scenario state** | The opening calculator must be real, editable, and preserve the fixture meaning: landing −10% SOL long −1,500 plus BTC short +5,000 = **+3,500 USDC**; separate four-market app preset = **+1,000**. | **Verified locally; verified live.** `calculateScenario(getSampleSnapshot('long-short'), shock)` drives the landing card; `/app` uses the four-market fixture. User-facing copy uses `DEMO`, `Examples`, `Preset`, and `Reference`; internal `sample` mode/schema identifiers remain for compatibility and are not visible labels. | Slider keyboard input, reset, scenario travel/return, app edits, exclusions, save/download paths, and focused regression tests passed. | Hero and app after captures; `motion.json` records board state. | Live calculations additionally require a fresh provider snapshot (maximum 120 seconds). |
| **R3 — Explorer and editors** | `/app` must expose source mode, provider/account scope, freshness, primary task, editable shock, contributions, exclusions, and feedback. | **Verified locally; production route/API verified.** The dashboard keeps sample/live mode explicit, separates providers and subaccounts, preserves prior data on failed refresh, and disables stale calculations. Primary actions are bound to handlers. | Focused browser journeys cover preset use, all supported sample fields, valid/invalid public address, provider/subaccount choice, retry, reset, report save/download, and delete of disposable records. | `before/after/app-1440.png`, matched `after/app-390-viewport.png`, public app captures. | Public provider uptime and configured RPC/API capacity. |
| **R4 — Media and motion (Meridial, B4, B6)** | Local Meridial film must decode/advance/loop with poster fallback. B4 must map the responsive stage and three portrait clips. B6 must use video-driven refraction where supported. | **Verified locally.** `DecorativeVideo` lazy-loads only visible, eligible media and pauses/removes sources offscreen, hidden, or reduced-motion. B4 uses the supplied rose/violet/coral media mapping; B6 `LiquidGlass` samples the live video into a canvas with a fallback state. | `motion.json`: hero `0.503900 → 1.932234s`, board transition measured as `1s cubic-bezier(0.33,0,0.2,1)`, pause then resume returned to playing, B4 positions/coverage/math each decoded and advanced, B6 `framesBefore 0 → framesAfter 0.741768`, `data-refraction="active"`. | `after` route captures plus local feature scroll state. | Browser canvas/video support affects B6; poster and readable native controls remain available. |
| **R5 — Navigation, FAQ, footer, brand** | Open Buffer, scenario travel/back, Method, Demo, optional sign-in, privacy, FAQ, install, Brand kit, GitHub, and footer links must be reachable; wordmark/icon styling must stay shared. | **Verified locally; verified live.** Shared `Brand`, `Mark`, `TokenIcon`, manifest icons, and route/hash links are used. Audited primary buttons have handlers or real destinations; no placeholder `#` primary action was found. | Route, refresh, back/forward, menu navigation, FAQ disclosure, demo controls, and footer links were exercised; production routes `/`, `/app`, `/auth`, `/demo` returned 200. | Landing and public-baseline captures; accessible tree inspection. | GitHub and optional cloud auth are external destinations/configuration. |
| **R6 — Calculation, quote, freshness** | Exact signed arithmetic: base quantity × frozen baseline price × shock, quote currencies preserved, no silent conversion, 120-second app freshness and provider expiry respected. | **Verified locally; verified by live responses.** `scenario.ts` uses Decimal arithmetic and explicit exclusions; quote totals remain separate. Stale/invalid inputs disable calculation instead of becoming zero/sample data. | Vitest scenario/normalization/report suites and API snapshot checks passed. Live Velocity/Pacifica snapshots returned source and freshness metadata; invalid address/protocol returned sanitized 400 errors. | App method and exclusion surfaces in after captures. | Provider clocks/oracles and RPC/API capacity remain external. |
| **R7 — Provider contracts** | Velocity default, Pacifica public reads, legacy Drift boundary, and Jupiter Perps inventory-only behavior must be explicit and safe. | **Verified live for Velocity, Pacifica, Jupiter; Drift explicitly paused.** Velocity enforces SDK oracle checks and 150-slot lag; Pacifica keeps USD conventions and separate non-atomic reads; Jupiter validates canonical ownership/PDA/pool/custody and exposes inventory without inventing a price/payoff; at the capture it returned one inventory row with `inventoryAvailable:false`; Drift is retained for historical reads only. | Production `/api/accounts` and `/api/snapshot` returned 200 for public Velocity, Pacifica, and Jupiter examples (subaccount 0). Jupiter returned `inventoryAvailable:false` with unknown current price rather than a fabricated zero-risk result (the live inventory row count can change between reads). | App provider selector and source/freshness cards. | Provider APIs/SDKs can change; revalidate installed SDKs before integration changes. |
| **R8 — Auth and reports** | Guest/device reports work immediately; private cloud reports are owner-isolated; auth must not be implied by a public wallet address. | **Implemented but production configuration-blocked for confirmed email delivery.** Device storage, JSON export, cloud report queries, abort/uncertain-write handling, Supabase owner-only RLS migrations, and auth callback routes are present. Deployment has `NEXT_PUBLIC_AUTH_EMAIL_READY=false`, so the UI honestly explains that cloud sign-in is being configured. | Mock auth/report tests pass; save/load/delete paths preserve identity and abort tickets. `/auth` direct load and guest path work. | Auth after/public captures; auth copy and fallback states visible. | Configure Supabase Auth site URL/redirects, SMTP/email provider, confirmation and recovery policies, and set the readiness flag only after delivery is tested. |
| **R9 — PWA/offline/responsive** | Manifest/icons, standalone install guidance, service-worker update path, offline sample arithmetic, no private/live data in public cache, and readable 320px/landscape/zoom behavior. | **Verified locally; native packages explicitly deferred.** PWA manifest/icons, install guidance, offline route, update handling, and sample arithmetic are implemented. The service worker does not cache auth, reports, API responses, or provider data. Responsive checks found no horizontal overflow and visible focus at 320/375/390/720 widths. | `responsive-motion.json`; PWA tests and offline sample journey passed. | Matched mobile before/after captures and public mobile captures. | Browser install UX varies; native iOS/Android/desktop packages require a separate product scope. |
| **R10 — Risk context** | Show current provider health/maintenance observations with method/scope/limits; never present an invented exact liquidation forecast. | **Verified locally; exact liquidation estimate explicitly deferred.** Velocity now exposes SDK maintenance collateral, maintenance requirement, exact headroom, and the current buffer-aware liquidation-status flag as a separate risk context. Values are labeled observations, not forecasts; isolated positions remain unavailable rather than combined. Jupiter inventory and Pacifica limitations are surfaced. | Normalizer tests cover exact headroom, status flags, health/oracle confidence/lag, and exclusion reasons; UI displays the risk context and method text lists collateral, funding, fees, borrowing, future fills, and liquidation exclusions. | App risk-context card, Method drawer, and exclusion surfaces. | A verified collateral/oracle/liquidation contract for every supported venue is required before an exact model can be implemented. |
| **R11 — Durable alerts** | If advertised, prove rule → fresh evaluation → outbox/event → worker → delivery, including owner isolation, leases, idempotency, cooldown, retries, pause/delete, and stale suppression. | **Implemented locally for the narrow verified wedge; hosted delivery remains configuration-blocked.** One maintenance-headroom rule is owner-scoped, persisted in a bounded store, evaluated only from fresh Velocity risk context, deduplicated by rule/version/cadence, claimed with a lease, and delivered to a local mock sink. Supabase alert tables/RLS are additive and ready for a protected worker role. | `src/lib/alerts.ts`, `AlertsPanel.tsx`, migration, and `scripts/alert-worker.mjs`; no arbitrary webhook or external message is claimed. | Dashboard local threshold-monitor panel and deterministic worker evidence. | Configure a protected hosted worker and verified destination before enabling external delivery. |
| **R12 — Brand/assets/legal copy** | Correct blue Buffer mark/wordmark, transparent token icons, favicon/manifest identity, local licensed font, and clear financial/privacy limits. | **Verified locally; verified in production render.** Shared ribbon-B mark and wordmark are used across landing/app/auth/footer; token logos are local; Inter is bundled with fallback; legal copy states public read-only intent, no keys/trading permissions, and no liquidation forecast. | Asset/build checks and route browser checks passed; production HTML references the same brand identity. | Landing/app/auth/demo/brand-kit captures. | Third-party brand/API assets remain subject to their own terms; re-check before adding providers. |
| **R13 — Release** | Reproducible checks, production parity, and a clear release identity. | **Verified live for the current release.** The final Vercel deployment is ready, the production alias is healthy, and post-deploy route, browser, and Velocity risk-context checks passed. | Typecheck, lint, unit, focused browser, build, route, and live API results below. | Public-baseline captures and post-deploy route/risk records. | Future releases should repeat this evidence against the new commit and Vercel deployment. |

## Corrections shipped in the audited source

- `0ca09e3` implements the selected Meridial Light landing treatment: light cinematic split, local film/poster pair, real scenario travel, B4 feature media, B6 auth media, shared motion preference, and the selected copy.
- `9851d3b` makes the social/brand exports full bleed and keeps the asset kit consistent with the shared mark.
- `9a4fbcc` clarifies portfolio surfaces and public copy. It makes the **Perpetual positions** panel explicitly opaque, removes user-visible “SAMPLE” and “READ-ONLY SCENARIO” wording in favor of `DEMO`, `Examples`, `Preset`, and `Reference`, and preserves the internal report/source schema identifiers required by compatibility.
- `596e729` adds an optional, schema-validated SDK observation for live Velocity accounts: maintenance collateral, maintenance requirement, exact headroom, and the SDK’s current liquidation-status flag. It is preserved in JSON reports and is unavailable with an explanation when inputs are incomplete or isolated.
- The source retains the original B3 footage and provenance files for history, but renders one selected hero rather than a competing legacy hero.

## Functional and browser evidence

The following artifacts were captured during this audit:

- Before local screenshots: `work/evidence/before/landing-1440.png`, `landing-390.png`, `app-1440.png`, `app-390.png`, `auth-1440.png`, `auth-390.png`, `demo-1440.png`, `demo-390.png`.
- After local screenshots: `work/evidence/after/landing-1440.png`, `landing-390.png` (full-page), matched `landing-390-viewport.png`, `app-1440.png`, `app-390-viewport.png`, `auth-1440.png`, `auth-390-viewport.png`, `demo-1440.png`, `demo-390-viewport.png`.
- Fresh production screenshots: `work/evidence/public-baseline/` with the same four routes at 1440×1000 and 390×844.
- Motion proof: `work/evidence/audit-2026-09-15/motion.json`.
- Responsive/reduced-motion proof: `work/evidence/audit-2026-09-15/responsive-motion.json`.
- Live API proof: `work/evidence/audit-2026-09-15/api.json`.
- Local risk-context proof: `work/evidence/audit-2026-09-15/risk-context.json`.
- Local alert pipeline proof: `work/evidence/audit-2026-09-15/alert-pipeline.json`.
- Post-deploy risk proof: `work/evidence/audit-2026-09-15/post-deploy-risk-context.json`.

The screenshots and JSON are ignored by the repository’s `work/` rule so evidence does not inflate the deploy artifact. They remain available in the workspace for review.

## Validation results

Commands run from the repository root:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass. |
| `npm run lint` | Pass. |
| `npm test` | **374 tests passed**, 18 files. |
| Focused browser journeys | **18 passed** locally in the deterministic desktop focus run, covering scenarios, app/auth/demo, reports, PWA, failure paths, and local alert persistence/mock delivery. A separate production smoke run passed 3 journeys for alerts, landing, and auth public path. |
| `npx playwright test --project=desktop --workers=2` | 64 passed, 3 skipped, 4 timing flakes under parallel load. Each failed case was rerun in isolation with one worker and passed: uncertain report write, invalid address, hosted-video playback, and guide hide. These are disclosed as parallel timing flakes, not silently omitted. |
| `npm run build` | Pass on the audited revision; Vercel production build also completed successfully. |
| Production route fetch | `/`, `/app`, `/auth`, `/demo`, and `/api/config` returned HTTP 200. |
| Production API negative paths | Invalid address and invalid protocol returned sanitized HTTP 400 responses (`INVALID_ADDRESS`, `INVALID_PROTOCOL`). |
| Production provider reads | Post-deploy Velocity snapshot returned 200 with 2 positions and current risk context (`clear`, collateral `1908.644378`, requirement `225.402134`, headroom `1683.242244`). Earlier Pacifica/Jupiter captures remain valid read evidence; inventory row counts are live and can change between reads. |

## Capability matrix and limits

| Capability | Current status |
| --- | --- |
| Meridial Light landing, scenario travel, shared brand | Verified locally and live. |
| B4 responsive feature media and B6 video refraction | Verified locally with motion evidence; posters/fallbacks cover unsupported media. |
| Sample calculator, exact Decimal arithmetic, quote separation | Verified locally and by tests. |
| Velocity and Pacifica live reads | Verified live with public examples. |
| Velocity current maintenance risk context | Implemented, verified against the installed SDK, and verified in the current production snapshot. |
| Jupiter Perps inventory boundary | Verified live; current price/collateral payoff remains unknown by design. |
| Legacy Drift | Implemented as a paused/historical boundary, not claimed as current live coverage. |
| Device reports and JSON export | Verified locally. |
| Supabase cloud reports/auth | Implemented but production configuration-blocked until Auth email/redirect/SMTP readiness is proven. RLS migrations are present and owner-scoped. |
| PWA/offline sample mode | Verified locally; private/live data is excluded from public caches. |
| Durable alerts | Implemented locally for one verified Velocity headroom metric with a mock sink; hosted worker and external destinations remain configuration-blocked. |
| Exact liquidation forecast | Explicitly deferred until venue collateral/oracle semantics are verified. |
| Native iOS/Android/desktop installers | Explicitly deferred; the committed product is a responsive installable PWA. |

## Remaining prerequisites

1. **Cloud sign-in:** configure the Supabase Auth site URL and redirect URLs for `https://bufferonsolana.vercel.app`, configure SMTP/confirmation/recovery delivery, test sign-up/sign-in/recovery/session expiry, then change `NEXT_PUBLIC_AUTH_EMAIL_READY` only after the end-to-end check passes.
2. **Hosted alerts:** the local event/outbox/lease/mock-sink path is implemented and tested. Before external delivery, apply the additive Supabase migration, run a protected scheduled worker with service-role-only writes, configure an authorized provider destination/secret, and repeat the lease, retry, idempotency, cooldown/hysteresis, deletion, and stale-input checks in the hosted runtime.
3. **Liquidation modeling (if authorized later):** obtain venue-specific collateral, oracle, maintenance, funding, and fee semantics with a versioned test fixture. Until then the product intentionally reports price effect and current observations only.
4. **Native shells (if required later):** define the iOS/Android/desktop packaging, update/install channels, and platform-specific permission model separately from the PWA.
5. **Provider capacity:** production live reads depend on the configured `SOLANA_RPC_URL` and provider API rate limits. The server enforces bounded request size, timeouts, concurrency, and sanitized errors; it cannot guarantee third-party uptime.

## Verified demo path

1. Open [bufferonsolana.vercel.app](https://bufferonsolana.vercel.app/) and move the landing slider from −10% to another value; the per-position rows and total update from the real fixture.
2. Select **Explore the scenario**; the card travels into the wider light board. Select **Back to overview** and confirm the state returns without a reload.
3. Select **Open Buffer**; the four-market preset starts at the documented +1,000 result. Edit the shock, inspect modeled/excluded positions, open **Method**, and download a JSON report.
4. In the provider selector, use a public Velocity or Pacifica authority from `work/evidence/audit-2026-09-15/api.json`; inspect source, freshness, quote, and provider warnings. Jupiter remains visibly inventory-only where price/collateral inputs are unknown.
5. Open **Demo** for the current-build update card, narrated product films, captions, and transcripts. Follow its **Try the current monitor** link to configure the local threshold path in `/app`.
6. Use **Brand kit** for the profile mark, wallpapers, headers, and ad/background exports. Install/offline mode can be exercised from the PWA install guidance; live reads and cloud reports correctly require a connection.

The audited product is working for the committed read-only scenario, provider-read, report, media, PWA, privacy, and local alert-pipeline flows. The matrix above keeps email delivery, hosted alert delivery, exact liquidation forecasts, and native packages in their correct configuration-blocked or deferred states rather than presenting them as finished capabilities.
