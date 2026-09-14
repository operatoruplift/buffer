# Meridial Light local verification

Prepared September 14, 2026 for the local Buffer redesign handoff. This document supplements the preservation ledger and records the reviewable local result. It does not describe a production deployment.

## Changed surface

- The landing hero now uses the supplied Meridial Light film in a bounded dark stage over a warm ivory interface.
- The copy is the three-line product statement: “Every position.” / “Every price move.” / “A clearer picture.”
- The stage shows the existing two-position long/short fixture and a derived coverage card. At −10%, the engine still reports SOL −1,500, BTC +5,000, and +3,500 USDC.
- “Explore the scenario” moves the same controlled preview into a wider board. “Back to overview” returns it without resetting the slider or starting another video.
- The app’s Perpetual positions panel is an explicit opaque white surface with a stable boundary and shadow. Visible fixture copy uses “Demo,” “Examples,” and “Preset” language; the underlying source mode and report schema remain unchanged.
- B4 feature clips, B6 auth refraction, the app explorer, optional auth, reports, PWA behavior, brand assets, and the three September 13 product films remain on their existing routes.

## Local evidence

Run from this repository with Node 24:

```sh
npm ci
npm run dev -- --port 3001
```

Review at `http://127.0.0.1:3001`. Captures are kept outside the repository under `work/evidence/`:

| Surface | Before | After |
| --- | --- | --- |
| Landing 1440×1000 | `work/evidence/before/landing-1440.png` | `work/evidence/after/landing-1440.png` |
| Landing 390×844 | `work/evidence/before/landing-390.png` | `work/evidence/after/landing-390.png` |
| App 1440×1000 | `work/evidence/before/app-1440.png` | `work/evidence/after/app-1440.png` |
| Auth 1440×1000 | `work/evidence/before/auth-1440.png` | `work/evidence/after/auth-1440.png` |
| Demo 1440×1000 | `work/evidence/before/demo-1440.png` | `work/evidence/after/demo-1440.png` |

The expanded board was also opened in the local browser and checked for a single range control, preserved total, a working Back to overview action, and no horizontal overflow.

## Validation

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `npm test` — 367 tests passed across 16 files.
- Focused browser coverage (`website`, `design-media`, `brand-motion`, `meridial-light`) — 18 desktop/mobile tests passed.
- Isolated rerun of the five mobile cases that timed out in the long serial sweep — three dashboard cases passed; the auth signup case was correctly skipped by the normal email-readiness gate; the stalled-auth case passed.
- `npm run build` — pass; routes include `/`, `/app`, `/auth`, `/demo`, `/brand-kit`, the three API routes, and the manifest.

The long 142-test serial browser sweep completed 132 cases before five legacy mobile cases timed out during the run and five were skipped. Those failures reproduced as passing or correctly gated when isolated, so they are recorded as environment/serial-run instability rather than attributed to the Meridial change. The focused redesign suite is green.

## API and model boundaries

| Capability | Status in this handoff |
| --- | --- |
| Velocity live read | Preserved as the default; current provider semantics and quote labels remain unchanged. |
| Pacifica live read | Preserved with USD provenance and freshness metadata. |
| Jupiter Perps | Preserved as inventory-only; no unverified price or capped-payoff total. |
| Legacy Drift | Preserved as explicitly paused. |
| Price-effect scenario | Deterministic, fixed-size arithmetic; funding, fees, collateral changes and liquidation are excluded. |
| Risk headroom / liquidation estimates | Not enabled until installed-SDK semantics and collateral/oracle coupling are verified. |
| Durable external alerts | Not enabled; no row is presented as a running worker or delivered notification. |

## Honest demo path

1. Open the landing page and point out the three-line statement, bounded film, SAMPLE label and context card.
2. Move the −10% slider to show the real +3,500 USDC long/short fixture.
3. Select **Explore the scenario**, show the board reveal and explain that the same state travels into the board.
4. Use **Back to overview**, then choose **Open Buffer** to continue into the editable four-market sample and exports.
5. In the app, mention that live reads are read-only, provider-specific, freshness-bounded and visibly scoped.

The source and derivative hashes for `public/videos/design/meridial-light.mp4` and its poster are recorded in `public/videos/design/README.md`. Production deployment, public publication, email enablement and external alert delivery remain separate decisions.
