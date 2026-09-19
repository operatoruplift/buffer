# Buffer local completion — September 19, 2026

This record supersedes earlier statements that every handoff requirement was already applied. The checkout started clean on `main` at `130dcac` and preserves the subsequent performance, accessibility, and shared-rate-limit work. No production deployment, GitHub publication, hosted migration, event submission, transaction, paid generation, or external alert send was performed in this pass. The latest attached implementation handoff explicitly reserves those actions for a separate release decision.

## Delivered changes

- **Visible composition:** hero scenario/context surfaces no longer obscure the slider or denomination. Narrow header/headline wrapping is corrected. The single existing scenario/video animates into the board with measured travel, cancellation, focus restoration, reduced-motion behavior and the closing-line wipe. Film failure remains in a poster state instead of being overwritten by a pause event. Landing DEMO badges stay removed, the positions panel remains opaque, and the Buffer/transparent Solana assets remain intact.
- **Live state:** failed wallet/account/subaccount/provider changes preserve and label the previous live scope. Calculations, exports and monitoring remain disabled until a valid replacement arrives. No sample or zero-balance substitution is used.
- **Risk context:** the current maintenance comparison and account flags match installed SDK source. Equality is labeled “Meets maintenance”; stale observations are labeled stale. Exact BN/decimal values remain intact. See [the versioned model note](RISK-CONTEXT.md).
- **Monitoring:** fixture checks are explicit; unavailable live risk cannot acquire invented values. Manual browser checks finish in an idle state. Owner/session/scope changes invalidate waiting work, tabs coordinate mutations, corrupt browser state is preserved, and financial/expiry inputs are validated again before completion.
- **Durable runner:** a separate SQLite CLI persists claims before completion, fences expired workers, deduplicates breach episodes, supports hysteresis/cooldown and bounded retries, preserves unresolved events through outages, cancels edited/paused/deleted work, and commits mock receipts atomically.
- **Database preparation:** a forward migration adds verified mock destinations, owner-linked records, restricted client columns, protected worker functions, freshness gates, immutable observation payloads and explicit retention. It is tested locally and remains unapplied to hosted Supabase.
- **Demo honesty:** September 13 films, captions, narration and controls are preserved. `/demo` identifies earlier footage and describes the September 19 build. Landing coverage copy no longer implies active legacy Drift.

## Preserved contracts

[The preservation ledger](BUFFER-HANDOFF-PRESERVATION.md) remains the route/component inventory. `/`, `/app`, `/auth`, `/demo`, `/brand-kit`, `/api/config`, `/api/accounts`, `/api/snapshot` and the PWA manifest remain. The 12 fixtures, editable 76-market catalog, 2-position landing (+3,500 at −10%) and 4-market app (+1,000 at −10%) examples remain distinct. Supabase auth/reports retain their original RLS and version-1 semantics. Device reports, downloads, Method/coverage, footer links, keyboard controls and optional installation remain available.

Brand geometry, favicon and installed-app icons were not replaced. Original B3 provenance, the selected Meridial/B4/B6 clips, product-film MP4s/posters/captions/transcripts, and media source attribution remain. The service worker still allowlists public static assets and excludes API/auth/private/live content.

## Model and provider matrix

| Capability | Local implementation | Limit |
| --- | --- | --- |
| Price scenario | Pure Decimal linear fixed-size price effect | Excludes future funding, fees, fills, collateral changes and liquidation. |
| Velocity | Canonical SDK 0.23.1/mainnet identity, explicit account, current cross-margin maintenance context | USDT settlement differs from USD valuation; no full buffered liquidation-boundary guarantee. |
| Pacifica | Fixed REST origin, current timestamps, USD price effects | No synthetic Solana slots or USDC relabeling. |
| Jupiter | Canonical account/PDA/pool/custody inventory | Current collateral-dependent payoff and prices remain unmodeled. |
| Drift | Explicitly paused | Never substitutes for Velocity. |
| Browser monitoring | Device-local rules and explicit manual mock checks | A tab is not a scheduler; no background/external send claim. |
| CLI monitoring | SQLite durable worker with local snapshot file or explicit fixture | No provider polling, hosted scheduler, external destination, or browser synchronization. |
| Cloud accounts/reports | Existing optional Supabase implementation | Production email remains disabled pending actual delivery verification. |
| PWA | Responsive installable app and offline public calculator | No native store installers or physical-device installation claim. |

## Review and verification

The code/security review covered provider risk semantics, auth/scope races, browser persistence, SQLite leases/journal, SQL ownership/freshness, and hero/media lifecycle. All material findings were corrected; final reviewer verdict was **APPROVE**. The separate SQL check uses local PostgreSQL/WASM roles, not hosted mutation tests or concurrent hosted PostgreSQL proof.

Use Node **24.16.0**, npm and the checked-in `package-lock.json` (the handoff's pnpm examples do not justify replacing the repository lockfile):

```sh
npm ci
npm run typecheck
npm run lint
npm test -- --reporter=dot
npm run build
npm run start -- --port 3001
# In a second terminal:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:e2e -- --workers=1
npm run alert:worker -- --fixture
```

The actual scoped results and fresh API outcomes are listed in the completion table below. Auth requests in mock suites are intercepted; no test sends a production recovery email or changes a real user's private reports. Local SQL setup/run commands are in [ALERTS.md](ALERTS.md).

## Evidence locations

Evidence is intentionally ignored under `work/evidence/final-2026-09-19/`. Baseline captures are retained in `baseline/`. The capture script records `/`, `/app`, `/auth`, `/demo` at 1440×1000, 390×844 and 320×844. Separate browser tests cover 375px, landscape, 200% CSS reflow, reduced motion and keyboard access. The capture additionally records film progression, travel/state restoration, B4/B6 and blocked media. Its manifest records actual results rather than assuming every capture passed. `live-reads.json` records timestamp, public authority/subaccount, slots, expiry, units and current provider status without credentials. `core-report/` and `core-results/` hold scoped browser results.

## Honest 90-second demonstration

| Time | Action / narration |
| --- | --- |
| 0–15s | Open `/`. “Buffer explains the price effect on perpetual positions.” Show the light cinematic hero and two-position +3,500 USDC fixture at −10%. |
| 15–25s | Select **Explore the scenario**, adjust its one slider and return. Explain that the same scenario state travels into the board. |
| 25–45s | Open `/app`, use the four-market preset and −10%. Show SOL −1,500, BTC +5,000, ETH −2,000, XRP −500: +1,000 USDC. Open Add perps and Method. |
| 45–60s | Select a fresh public Velocity example and explicit subaccount if available. Show timestamp, quote identity and current maintenance context. A failed read stays unavailable; do not narrate a memorized balance. |
| 60–75s | Return to an example, configure the local rule and press **Run fixture check**. “This explicitly labeled fixture proves the manual mock-delivery path. The separate SQLite worker handles durable local processing; external messages are not enabled.” |
| 75–90s | Save/download a dated report, show phone layout/install guidance, then `/demo` for captioned films and clear recording dates. |

## Remaining external gates

There is no missing secret required for deterministic scenarios, device reports, the local mock worker or the PWA. Production provider capacity remains external. Public email readiness requires configured/tested SMTP, redirects and policy. Hosted alert activation still needs application of the forward migration, an implemented provider-polling scheduler/evaluator and an authorized verified delivery integration; these are not merely environment flags. Exact liquidation estimates need separately verified protocol math. No event eligibility or submission is asserted here.

## Completion evidence

| Check | Observed result |
| --- | --- |
| Full unit suite | **394 passed in 18 files** on the final source, using `npm test -- --reporter=dot --maxWorkers=2 --testTimeout=15000`. |
| Type checking and lint | `npm run typecheck` and `npm run lint` passed on Node 24.16.0. |
| Final production build | `npm run build` passed. Build ID `mP-MKHg5knF1duFC-heTx`; running locally at `http://127.0.0.1:3001`. The earlier visual capture used build `eBOMDEeHdDmJ43Dhc1jNe`; final changes since that build tightened alert input validation without changing the visual components. |
| Financial/provider/auth/report selected unit tests | 172 passed before the final review corrections. |
| Final compiled-build smoke | **7 passed**: all desktop alert cases plus landing arithmetic/navigation and the optional-account public path, against build `mP-MKHg5knF1duFC-heTx`. Command: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npx playwright test e2e/alerts.spec.ts e2e/website.spec.ts --project=desktop --workers=1`. |
| Final alert engine and real-process SQLite tests | 17 passed, including precise large-value recovery and earlier provider expiry. |
| Database migration verification | 40 local PostgreSQL assertions passed. Owner reads/writes, protected worker permissions, version invalidation, finite numbers, fenced retry, mid-claim stale recovery, deletion history and retention were exercised. |
| Desktop/mobile design and films | 32 passed: hero travel, rapid reversal, resize/keyboard, real playback, responsive B4 source selection, B6 refraction/fallback, paused/reduced motion, blocked films, branding and captions. |
| Captured visual evidence | 12 route/viewport pairs with no document overflow, clipped primary controls/headings or page errors. Hero time advanced 0.165805→0.782431 seconds; travel retained the same video with zero reloads and one slider. B4 videos advanced past 6.7 seconds; B6 canvas advanced from 17 to 32 frames. The 49.56-second `hero-travel.webm` records the transition. |
| Desktop/mobile app scope changes | 6 passed for wallet/provider/subaccount switches, retained prior data, disabled outputs and successful retry. |
| Core browser flows | All 24 unique scoped cases passed across the run and targeted correction reruns. Initial run: 21 pass, 3 failures in two test fixtures; the unavailable-risk fixture lacked required oracle slots, and a page-scoped network mock missed service-worker requests. Corrected fixture metadata and context-scoped interception; all 4 desktop/mobile affected cases passed. No application cache rule was weakened. |
| Live Velocity | HTTP 200 at `2026-09-19T08:57:28.727Z`, public subaccount 0, slots 448360065/448360067, two modeled positions, USDT quote, current USD risk context. |
| Live Pacifica | HTTP 200 at `2026-09-19T08:57:30.143Z`, USD price effects and API timestamps, 22 positions in the chosen public account. |
| Live Jupiter | HTTP 200, `inventoryAvailable:false`, zero inventory rows for the chosen public account; no price/scenario invented. This is an honest limited response, not proof of a populated inventory. |
| Live input to durable worker | A second fresh public Velocity observation created one event and one local mock receipt at `2026-09-19T09:04:12.660Z`; restart retained exactly one receipt. Threshold was selected above that observed headroom for this read-only test. No external message was sent. |
| Negative API paths | Invalid address and protocol both returned sanitized HTTP 400 errors. API cache-control was `no-store`. |
| Hosted metadata, read-only | Original alert_rules/events/outbox still have RLS enabled; the shared rate-limit RPC exists. New destination/claim/completion migration was not applied. |

The screenshots cover all four requested routes at 1440×1000, 390×844 and 320px, with zero horizontal overflow in the captured layouts. An earlier full run passed 392 tests before two added precision/expiry cases. A later 394-case run recorded one existing market-normalization test exceeding its five-second budget under heavy concurrent browser load; the final rerun passed all 394 tests with a 15-second per-test budget and two workers, without changing assertions. The runtime-budget change was a command-line option only; test assertions and repository defaults are unchanged.

## Exact changed files

- `.env.example`
- `docs/ALERTS.md`
- `docs/BUFFER-AUDIT-AND-FIX.md`
- `docs/BUFFER-HANDOFF-PRESERVATION.md`
- `docs/DEPLOYMENT.md`
- `docs/DESCRIPTION.md`
- `docs/FINAL-VERIFICATION-2026-09-19.md`
- `docs/MERIDIAL-LIGHT-VERIFICATION.md`
- `docs/RISK-CONTEXT.md`
- `docs/SUBMISSION.md`
- `docs/VIDEO.md`
- `docs/VISUAL-VERIFICATION-2026-09-19.md`
- `e2e/alerts.spec.ts`
- `e2e/dashboard.spec.ts`
- `e2e/design-media.spec.ts`
- `e2e/meridial-light.spec.ts`
- `e2e/pwa.spec.ts`
- `scripts/alert-worker.mjs`
- `scripts/lib/alert-store.mjs`
- `scripts/verify-alert-schema.mjs`
- `src/app/demo/page.tsx`
- `src/app/landing.css`
- `src/components/AlertsPanel.module.css`
- `src/components/AlertsPanel.tsx`
- `src/components/Dashboard.tsx`
- `src/components/DecorativeVideo.tsx`
- `src/components/Landing.tsx`
- `src/lib/alerts.ts`
- `src/server/velocity-normalize.ts`
- `supabase/migrations/20260919090000_harden_alert_pipeline.sql`
- `tests/alert-worker.test.ts`
- `tests/alerts.test.ts`
- `tests/velocity.test.ts`
- `tsconfig.json`
