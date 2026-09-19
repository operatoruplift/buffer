# Buffer handoff preservation ledger

Prepared 15 September 2026 against the current Buffer source. This ledger records the existing contract that the redesign and risk-context work must preserve. The original baseline observations below remain historical evidence.

| Feature / boundary | Source | Existing behavior | Intended change | Dependency / storage | Verification |
| --- | --- | --- | --- | --- | --- |
| Landing and navigation | `src/components/Landing.tsx`, `src/app/landing.css`, `src/components/MobileNavigation.tsx` | Public landing links to `/app`, `/auth`, `/demo`, Method, coverage, FAQ, install and privacy sections. | Meridial Light centered three-line hero; bounded film, floating real scenario/context cards, reversible board transition. | No storage; motion preference in `localStorage`. | `e2e/website.spec.ts`, `e2e/design-media.spec.ts`, visual captures at 1440/390. |
| Scenario preview | `src/components/Landing.tsx`, `src/lib/scenario.ts`, `src/lib/samples.ts` | Landing long-short fixture is −10% with SOL −1,500, BTC +5,000, total +3,500 USDC. | One controlled slider/preset state shared by overview and board; no invented wealth or recommendation. | Deterministic in-memory fixture. | Scenario unit tests and browser slider/preset checks. |
| App explorer | `src/components/Dashboard.tsx`, `src/components/SampleBuilder.tsx` | Guest sample, editable four-market sample, public account reads, explicit provider/subaccount selection, exports. | Keep route and semantics unchanged. | Local report storage; optional Supabase owner reports. | Dashboard, sample-builder, auth and report suites. |
| Provider read plane | `src/app/api/accounts`, `src/app/api/snapshot`, `src/server/*` | Velocity default, Pacifica modeled USD reads, Jupiter inventory-only, Drift paused; bounded/no-store reads and stale failures. | Preserve provider identities, quote labels, freshness and exclusions. | Fixed upstreams; no user-controlled fetch. | Provider, Pacifica, Jupiter and race tests. |
| Media | `src/components/DecorativeVideo.tsx`, `src/components/VideoFeatures.tsx`, `src/lib/design-media.ts` | B3/B4/B6 clips use same-origin posters, viewport pause, reduced-motion fallback; product films live under `/videos/buffer-*`. | Add `meridial-light.mp4` as the active hero while retaining `hero.mp4`; keep B4 and B6 sources and product film controls. | Public static media; no private cache. | Media playback, source-selection, refraction and demo suites. |
| Auth and accounts | `src/components/AuthForm.tsx`, `src/components/AccountPanel.tsx`, `src/lib/auth-flow.ts`, `src/lib/supabase.ts` | Optional Supabase auth with email readiness gate, recovery, session cleanup and owner-only reports. | Keep optional; no new wallet login or production email enablement. | Public Supabase URL/anon key only in browser; service keys server-only. | Mocked auth races, recovery and account isolation suites. |
| Reports | `src/lib/report.ts`, `src/lib/device-reports.ts`, `src/lib/cloud-reports.ts` | Versioned JSON reports, device library and explicit cloud saves/deletes. | Preserve v1 meaning and account-switch cleanup. | Browser storage and Supabase RLS. | Report compatibility, quota and RLS tests. |
| PWA | `src/app/manifest.ts`, `src/components/PwaClient.tsx`, `public/sw.js` | Installable app and offline deterministic sample with fixed public cache allowlist. | Keep API/auth/report/media responses out of the service-worker cache. | Browser cache only for listed public files. | PWA and offline tests. |
| Brand | `src/components/Brand.tsx`, `src/components/Icons.tsx`, `public/brand`, `public/icons` | Ribbon-B mark, wordmark, favicon and installed-app icons. | Preserve exact Buffer mark and shared typography. | Public static assets. | Brand-motion and favicon checks. |
| Current risk context / alerts | `src/server/velocity-normalize.ts`, `src/components/Dashboard.tsx`, `src/components/AlertsPanel.tsx`, `src/lib/alerts.ts` | Price-effect scenario is separate from account health; current Velocity health is provider-reported. | Preserve the SDK maintenance collateral, requirement, headroom, and current-status observation. Keep isolated scopes unavailable rather than combining them. The local alert capability supports owner-scoped maintenance-headroom rules, explicit browser checks, a separate durable SQLite worker, event/outbox creation, fenced lease claims, and mock delivery; external destinations remain gated. | Velocity SDK margin methods; localStorage for the reviewable local runtime; applied Supabase alert migrations/RLS for future hosted persistence; no external delivery assumed. | 394 unit tests, deterministic `npm run alert:worker -- --fixture`, real-process SQLite tests, and dashboard alert-state journeys. |

## Evidence captured before the visual change

Baseline screenshots were captured locally at 1440×1000 and 390×844 for `/`, plus the 1440×1000 surfaces `/app`, `/auth`, and `/demo` under `work/evidence/before/`. The working tree was at commit `9851d3b` when this ledger was started. These files are local review evidence and are not a claim about the current production deployment.

## Media provenance

The active hero derivative is documented in `public/videos/design/README.md`. The original Meridial CDN URL, source hashes, decode dimensions and local derivative hashes are recorded there. The prior B3 `hero.mp4` remains available and is not overwritten.

## Current risk-context boundary

The live Velocity normalizer now exposes a `risk` object when the installed SDK can compute it from a complete cross-margin scope. It records maintenance collateral, maintenance requirement, exact decimal headroom, the SDK's SDK-reported current maintenance comparison and separate account liquidation flags, and an explanation that the values are current observations. If required inputs are incomplete or isolated positions are present, the object is explicitly unavailable with null values; it is never converted to zero or a liquidation-price estimate. The report validator and JSON export preserve this optional context without changing report version 1 meaning.

## Release boundary

This handoff originally did not authorize production deployment. The current task separately authorizes deploying the reviewed source; funded transactions, account creation, email enablement, alert destination setup and external event submission remain out of scope.


## September 19 local completion pass

The earlier deployed evidence above remains historical. See [FINAL-VERIFICATION-2026-09-19.md](FINAL-VERIFICATION-2026-09-19.md) for this locally prepared revision, exact checks, new screenshots, and limits. The dashboard now preserves prior live scopes during account changes; risk labels match the installed SDK source; unavailable live alerts never use fixture values; the explicit fixture and manual checks are distinct. The standalone worker now uses SQLite with committed fenced claims and a transactional mock journal. The new database hardening migration is locally verified and **not applied to production**. The latest attached handoff reserves deployment, external delivery, and submission for a separate release decision.


## September 20 live-risk and hosted-monitoring extension

| Feature | Source | Prior behavior | Intended change | Dependency preserved | Verification |
| --- | --- | --- | --- | --- | --- |
| Public live lookup | Dashboard, live-link, app/page | Manual address/example discovery | Canonical deep link; sole eligible account auto-select; multiple remain deliberate | Public provider identities, fresh snapshots, no stored address | Link unit/browser cases; final release evidence |
| Current maintenance context | Dashboard, globals.css | Separate card farther down | Beside scenario on desktop, before it on mobile | Exact existing risk data; slider does not mutate current headroom | Slider independence/browser coverage |
| Alert rehearsal | AlertsPanel, alerts.ts | Browser-only local monitor | Explicit separate fixture namespace/export/entry point | Old namespace preserved; shared evaluator unchanged | Browser persistence/corruption/two-tab tests |
| Hosted monitoring | LiveMonitoringPanel, monitoring-client, server/monitoring, additive migration | No configured hosted runtime | Owner-bound rules, fresh read, leased worker, Discord receipt states | Reports/auth/private-cache boundaries; no automatic fixture migration | SQL/worker/provider/session tests and integration matrix |
| Product films | demo/page; public/videos | September 13 narrated films | Current-build text and live-risk link | Every MP4/poster/VTT/transcript/revision parameter unchanged | Caption/seek/download/browser tests |
| Meridial/B4/B6 and brand | Landing, design-media, DecorativeVideo, AuthForm | Selected delivered treatments | Add live-risk entry; preserve all motion/branding | Same assets, font/mark, motion preference and fallback | Matching before/after route screenshots and motion tests |

Before captures are in `work/evidence/real-alerts-2026-09-20/before`; final after captures and command logs share that evidence directory. No source film or historical report schema is reinterpreted by this extension.
