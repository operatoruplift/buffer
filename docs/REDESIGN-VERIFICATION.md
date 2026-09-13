# Local implementation and verification

This record describes the September 12, 2026 local verification against baseline commit `6040f28`. No production changes were made during that checkpoint. The user authorized publication and refreshed films on September 13; see [the release record](RELEASE-2026-09-13.md) for subsequent deployment and media evidence.

## Delivered

- **B3:** selected inline left-aligned video hero, exact heading/copy/CTAs, shared interactive long/short calculator (+3,500 USDC at −10%), native mobile navigation, preserved shader/orbit layers and shared motion preference.
- **B4:** supplied responsive stage and three portrait video cards; real sample position, coverage and calculation graphics; staged entrances, lazy playback, offscreen pause and still fallbacks.
- **B6:** actual bounded pixel refraction of the supplied video through a rounded glass surface. Object-cover coordinates, non-square geometry, reused pixel buffers, decoded-frame scheduling, 24 fps/120,000-pixel budgets, visibility/reduced-motion handling, and native HTML controls above the canvas.
- **Reliability:** fixed-endpoint bounded RPC, structured successful-response validation, precise freshness checks, cloud report validation/deadlines/retries, explicit uncertain-write handling, recovery continuity, and session-bound auth/SDK storage commits. Guest reports remain separate.
- **Jupiter:** selectable live inventory reader with canonical account decoding and source metadata; no unverified price or capped-payoff contribution enters scenario totals.

At the September 12 checkpoint, the current mark, shared cobalt wordmark, tile favicon, PWA assets, four-position app default, 76-market editor, original product films and captions were preserved. The original product films were subsequently replaced by the authorized version-2 refresh. Inter is embedded under SIL OFL; the existing Helvetica Neue/Arial stack substitutes for the unverified commercial font license. Decorative clip sources, hashes, and optimization details are documented in `public/videos/design/README.md`.

## Results

| Check | Result |
| --- | --- |
| ESLint | Pass |
| TypeScript | Pass |
| Optimized Next production build | Pass, normal email-readiness gate restored |
| Unit/integration suite | **367 passed**, 16 files |
| Full desktop/mobile Playwright suite against the production build | **132 passed, 6 skipped**, 138 cases total |
| Isolated email-ready mock build | **6 passed**, including the four signup cases gated in the normal build |
| Real Supabase auth/report mutation journeys | **2 skipped**: authorized nonproduction account fixtures unavailable |
| Existing live providers | Fresh HTTP 200 Velocity (2 eligible positions) and Pacifica (22 eligible positions) reads; no-store |
| Jupiter live inventory | Confirmed long and short mainnet reads; integrated route returned 1 inventory position and no modeled contribution |
| Design/layout | 1440/375 desktop/mobile; 740×360 short landscape; 720 CSS-pixel reflow at DPR 2 (200% desktop reflow equivalent); no overflow or page errors observed |
| Media | Selected clips decode and advance; responsive stage loads only applicable source; actual refraction pixels/frame counters change; pause/reduced-motion/canvas failure checks pass |
| Original demo media | All three films decode, play and seek; captions and controls preserved; all 9 original video/poster/caption files byte-identical to baseline |
| Offline/privacy | Offline calculator arithmetic, install behavior, fixed cache allowlist, and private-response exclusion pass |
| Reviews | Final code and security review: no unresolved material findings |

The six skips in the normal full suite are transparent: four conditional signup cases passed in the isolated enabled run; the remaining two require real nonproduction account fixtures. The enabled run used intercepted Supabase requests only, verified redirect construction, and did not send real mail or change the project. Its process-only flag was removed before the final build; `.env.local` was not edited.

Auth tests use the installed SDK with intercepted transport, including delayed/cancelled requests, storage changes arriving before auth events, same-user replacement sessions, token rotation, recovery reloads, SDK commit windows, and already-revoked logout responses. These verify application behavior; they do not replace server-side owner-isolation or email-delivery tests.

## Artifacts

- `screenshots/redesign/landing-1440.png`, `landing-still-375.png`
- `screenshots/redesign/features-{1440,375}.png`
- `screenshots/redesign/auth-{1440,375,812,320}.png`
- `screenshots/redesign/app-{1440,375}.png`
- `screenshots/redesign/jupiter-live-{1440,375}.png`
- `screenshots/redesign/redesign-motion.mp4` — 26.64-second actual browser capture, not generated mockup footage
- `screenshots/redesign/{baseline,final-layout,landscape-reflow,live-read-verification,original-media-preservation}.json`
- `playwright-report/index.html` — full local browser report

See [PRESERVATION-LEDGER.md](PRESERVATION-LEDGER.md), [PROVIDER-COVERAGE.md](PROVIDER-COVERAGE.md), [JUPITER-VERIFICATION.md](JUPITER-VERIFICATION.md), and [RELIABILITY-AUDIT.md](RELIABILITY-AUDIT.md).

## Launch locally

Use Node 24 and the existing npm lockfile. From this repository:

```sh
npm ci
npm run dev -- --port 3177
```

For the verified optimized build:

```sh
npm run build
npm run start -- --port 3177
```

Open `http://127.0.0.1:3177`. Use the commands above to start a local preview. The existing local RPC and public Supabase configuration were used without printing or altering credential values. Signup/recovery sending stays unavailable while email readiness is false; confirmed-account sign-in and guest/device workflows remain supported.

## Exact external requirements still missing

To finish **real** authentication/email verification, provide an authorized **nonproduction** Supabase project with the same migrations/RLS, two confirmed disposable test accounts through the existing private `BUFFER_AUTH_FIXTURES` file mechanism, working SMTP for confirmation/recovery, and verified Site URL/redirect allowlist/password settings. Include the intended local `/auth` destination and any authorized preview destination. Do not use production users or reports for these write/delete tests.

Jupiter price-effect modeling additionally needs a verified current oracle decoder/freshness contract and a correct incremental capped-payoff model incorporating collateral-price dependencies. Current inventory coverage is complete within the stated boundary; those unverified economics remain excluded.
