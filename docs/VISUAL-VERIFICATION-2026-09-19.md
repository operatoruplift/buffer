# Buffer visual verification — September 19, 2026

This records a local production-build check on Node 24.16.0 at `http://127.0.0.1:3001`. It is not evidence of a public deployment. The build identifier, capture timestamps, viewport dimensions, media state, and screenshots are recorded in `work/evidence/final-2026-09-19/manifest.json`.

## Corrections made after inspection

- The desktop context card covered the denomination and part of the hero slider. It now sits beneath the result as a compact second surface, leaving all values and controls visible.
- The 320px heading and navigation wrapped awkwardly. Responsive type sizing and a non-wrapping navigation action restore the three-line headline and usable header.
- Scenario expansion now measures and animates the existing film stage and cards for 1000ms, with a 330ms copy fade, 500ms copy movement, and delayed left-to-right caption wipe. It retains one video and one set of controls. Returning restores keyboard focus; reduced motion and the shared pause preference disable the transition, and resizing cancels a pending transform.
- A failed decorative video could be reported as paused when a later pause event overwrote its failure. Failure state is retained while the poster and product controls stay usable.
- Landing-page coverage copy now explains paused Drift and Jupiter inventory-only support. `/demo` dates the current context September 19 and explicitly says the September 13 films predate the new landing page, risk context, and local monitor. The films, captions, transcripts, narration, and download links are preserved.

## Browser checks

All **32 tests passed** across desktop and mobile against the production build:

```sh
PATH=/Users/rvaclassic/.nvm/versions/node/v24.16.0/bin:$PATH \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 \
node node_modules/@playwright/test/cli.js test \
  e2e/meridial-light.spec.ts e2e/design-media.spec.ts \
  e2e/liquid-glass.spec.ts e2e/brand-motion.spec.ts \
  e2e/website.spec.ts e2e/demo.spec.ts \
  --project=desktop --project=mobile --workers=1 --reporter=list
```

Coverage includes real video progression and seeking, active captions, B4 responsive source selection and offscreen pause, B6 changing canvas pixels and failure fallbacks, retained motion preference, keyboard focus and navigation, 740×360 landscape, 720px CSS reflow equivalent to 200% zoom from a 1440px viewport, scenario arithmetic, resize/rapid interrupted transitions, and pointer access to the slider endpoint previously covered by the context card.

The full output is `work/evidence/final-2026-09-19/visual-tests.log`. A first parallel capture attempt timed out during an auth screenshot under system load; the bounded screenshot pass was resumed separately. No product failure was inferred from that timeout.

## Evidence

Before screenshots are preserved in `work/evidence/final-2026-09-19/baseline/`. The final capture script and manifest live in the parent evidence directory. Screenshots include `/`, `/app`, `/auth`, and `/demo` at 1440×1000, 390×844, and 320×844, with both viewport and full-page captures. Motion evidence includes the advancing hero, intermediate card travel, expanded board, caption wipe, B4 feature cards, live B6 refraction, and failed-video posters. The manifest records any page errors and checks both document overflow and clipped primary controls/headings.

The 200% check above is a CSS viewport reflow check, not an automated change to the browser's native zoom setting. Cloud email delivery and external alert delivery are outside this visual verification; their disabled/configuration states do not establish working delivery.

Final capture results: **12/12 route/viewport combinations** had no document overflow, clipped primary controls/headings, or page errors. The hero advanced from 0.165805s to 0.782431s; its DOM element remained the same and it did not reload during board travel. The −7,000 USDC scenario value survived opening, returning, and rapid repetition with one range control. All four visible B4 films advanced beyond 6.7s; the B6 canvas advanced from 17 to 32 frames. Blocked hero media retained its poster and reported unavailable. Blocked auth media retained a readable form/poster while refraction remained waiting for a decoded frame.

`hero-travel.webm` is a finalized 1440×1000, 49.56-second recording of the local journey. Its raw browser recording needed remuxing after the recorder failed to close promptly; the finalized file was checked with `ffprobe`. This capture-tool cleanup did not change product source or the passing browser tests. These visual assets were captured from Next build `eBOMDEeHdDmJ43Dhc1jNe`; later alert input validation changes require the separately recorded final production build.
