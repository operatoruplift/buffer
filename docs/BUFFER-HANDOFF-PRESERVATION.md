# Buffer handoff preservation ledger

Prepared during the Meridial Light implementation. This ledger records the existing contract that the redesign must preserve.

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
| Risk context / alerts | Not yet enabled | Price-effect scenario is separate from account health; no durable alert worker is active. | Add only verified current metrics and a local, owner-scoped alert pipeline after inputs and worker boundaries are proven. | Requires SDK semantics, Supabase migrations/RLS and a scheduled worker; no external delivery assumed. | Blocked until model/worker evidence exists; never represent a row as delivered monitoring. |

## Evidence captured before the visual change

Baseline screenshots were captured locally at 1440×1000 and 390×844 for `/`, plus the 1440×1000 surfaces `/app`, `/auth`, and `/demo` under `work/evidence/before/`. The working tree was at commit `9851d3b` when this ledger was started. These files are local review evidence and are not a claim about the current production deployment.

## Media provenance

The active hero derivative is documented in `public/videos/design/README.md`. The original Meridial CDN URL, source hashes, decode dimensions and local derivative hashes are recorded there. The prior B3 `hero.mp4` remains available and is not overwritten.

## Release boundary

This handoff does not authorize production deployment, publication, funded transactions, account creation, email enablement, alert destination setup or external event submission. Those actions remain separate decisions after local evidence and review.
