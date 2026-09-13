# Buffer redesign preservation ledger

Local baseline: `6040f28`, captured before editing on September 12, 2026. Existing Next.js 16.3.4 / React 19.3.0 / TypeScript application; no framework migration. Production infrastructure and deployment are outside this task.

| Area | Baseline and preservation contract | Verification |
| --- | --- | --- |
| Routes and links | `/`, `/app`, `/auth`, `/demo`; Method, coverage, privacy, FAQ, install, real footer/source links | Baseline desktop/mobile captures; final route/keyboard tests |
| Brand | Current ribbon B, shared cobalt Helvetica wordmark, blue-tile favicon and PWA assets | Keep `Mark`, `Brand`, existing assets; typography regression |
| Samples | Four-market editable app default (+1000 USDC at −10%), 76-market builder and 12 original fixtures | Preserve editor and all arithmetic; selected hero uses original long/short fixture (+3500 USDC) as explicitly requested |
| Calculations | Exact decimal strings, separate quote totals, exclusions, fixed baseline quantities, 120-second maximum freshness and earlier source expiry | Existing financial/provider tests plus new normalization tests |
| Existing providers | Velocity default, public Pacifica REST, explicitly paused legacy Drift; no signing | Preserve provider identity, failures, race guards and provenance |
| Device/cloud state | Explicit device save; separate optional private Supabase library; no automatic upload | Persistence, account switching, storage isolation and RLS checks where authorized fixtures exist |
| Authentication | Sign-in/signup/forgot/recovery handlers; email readiness gate remains authoritative | Native form semantics; no fake OAuth; document externally unverified paths |
| Media | All three product films, posters, captions, audio, controls, seek and anchors | Decode/play/seek tests; original file hashes retained |
| Motion | Shader orbs/grid/signal paths/orbits, floating app mark and attached caption, pause and reduced motion | Preserve as subtler preview layers; integrate selected B3/B4/B6 choreography |
| Offline/PWA | Fixed public cache allowlist; no auth, reports, live HTML or provider data cached | Offline calculator/install/cache isolation tests |
| New Jupiter scope | Research canonical position economics before adapter; inventory-only is valid when payoff cannot be modeled | Coverage matrix distinguishes modeled, inventory-only, disabled and unverified |

Baseline screenshots and behavior: `screenshots/redesign/baseline-*.png` and `baseline.json`. Both 1440px and 375px had no horizontal overflow or page errors. The demo route contained all three films. Original source assets remain separate from decorative redesign clips.

Selected design: B3 left-aligned inline video hero, B4 three portrait video features, B6 real bounded video refraction behind native account forms. Essential content remains available without motion. Inter is locally embedded with its SIL OFL notice; Helvetica Now is replaced by the existing Helvetica Neue/Arial system stack because the supplied stylesheet does not establish a license grant.

Final local verification: lint, TypeScript and optimized build pass;367 unit tests pass;132 browser checks pass. Four email-gated signup cases also pass in the separate six-case enabled mock run; two real-auth cases remain unverified for lack of authorized nonproduction fixtures. Original9 product media files are byte-identical to baseline. Current Velocity/Pacifica reads remain modeled; Jupiter is verified inventory-only; legacy Drift stays paused. See `REDESIGN-VERIFICATION.md` and `PROVIDER-COVERAGE.md` for evidence and limits. No production changes or deployment were made.
