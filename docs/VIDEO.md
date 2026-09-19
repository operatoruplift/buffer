# Buffer videos

**Updated:** September 20, 2026 (current implementation and historical film context).

The version-2 films cover the core Buffer website and app: the cobalt B identity, animated landing page, four-market sample, 76-market sample builder, provider coverage, reports, and responsive mobile interface. The [source archive and production storyboard](https://github.com/operatoruplift/buffer/releases/tag/media-source-v2) contain the scene titles, narration, captures, and audio sources.

## Current build update

The films were recorded on September 13, 2026 and remain intact. The current `/demo` introduction opens **Explore live risk** in the actual updated app: fresh public Velocity account, adjacent maintenance context and an independent price scenario. A sole eligible account selects automatically; multiple accounts require deliberate selection.

Current monitoring has separate local example and hosted modes. Live rules use authenticated owner-scoped APIs and a durable worker. Discord acceptance and a matching channel receipt are separate statuses. Actual outbound verification still requires a configured destination and authorized test send; neither an intercepted browser test nor a mock journal is presented as delivery. See [integration status](BUFFER-INTEGRATION-STATUS.md). The films predate these changes and their narration is not relabeled as new footage.

| Film | Story | Timing |
| --- | --- | --- |
| Product demo | Four-market sample, −10% move, Add perps, provider selector, Method, device save/JSON export, mobile | **1:22** (81.961 s) |
| Pitch | Why Buffer exists, editable samples, explicit provider coverage, inspectable results, mobile | **0:52** (51.710 s) |
| Technical walkthrough | Provider boundaries, exact arithmetic, quote identity, freshness, reports, auth and verification limits | **1:46** (106.254 s) |

The current films and production package are available in [media-source-v2](https://github.com/operatoruplift/buffer/releases/tag/media-source-v2). The [version-1 archive](https://github.com/operatoruplift/buffer/releases/tag/media-source-v1) is historical and contains the old U identity and September 11 explorer footage.

## What the current footage represents

All account, position, and price footage is **sample data**. The provider selector demonstrates available choices and their stated boundaries; it does not stage a successful live lookup. The auth scene shows the actual optional account interface and disabled public email actions. It does not stage production sign-in, recovery delivery, or private report access.

The two sample examples are deliberately distinct:

- **App four-market sample:** 100 SOL long at 150, 0.5 BTC short at 100,000, 8 ETH long at 2,500, and 2,500 XRP long at 2. A −10% move contributes −1,500, +5,000, −2,000, and −500 USDC, totaling **+1,000 USDC**.
- **Landing two-position sample:** the SOL long and BTC short contribute −1,500 and +5,000 USDC, totaling **+3,500 USDC** at −10%.

These are fixed illustrative prices, not current market observations. Sample USDC, USDT, and USD denominations preserve the same numeric inputs and perform no FX conversion. The model holds position sizes fixed and excludes funding, fees, future fills, borrowing interest, collateral-price changes, and liquidation effects. A price effect is not account equity, margin health, or a liquidation forecast.

The films describe provider coverage as follows:

| Provider | Film claim |
| --- | --- |
| Velocity | Default live provider; eligible linear price scenarios, with verified USDT quote identity |
| Pacifica | Eligible price scenarios across configured markets; API price effects use USD and API price timestamps |
| Jupiter Perps | Canonical position inventory only; current prices and collateral-dependent capped payoff remain unmodeled |
| Legacy Drift | Paused; no current price scenario advertised |

[Provider coverage](PROVIDER-COVERAGE.md) contains the separate point-in-time mainnet evidence. No changing public balance or live P&L is narrated as a fixed demonstration result.

## Higgsfield and production provenance

Version 2 uses **actual captures of the redesigned Buffer application, assembled on a native Higgsedit timeline in the Higgsfield sandbox**. FFmpeg and Pillow prepare scenes, diagrams, captions, and end cards. Interface screens, logos, positions, and numbers come from the application. This refresh uses no newly generated Seedance clip.

The version-1 pitch used a generated eight-second opening shot from Higgsfield Seedance 2.5, job `5f1dbdb3-e9dd-4b54-915d-892b2bdbcb81`. That historical job and its 52-credit preflight do not describe a new generation or new credit expenditure. Its cobalt U motif belongs to the old film and is not presented as the current B logo.

The source package contains public sample captures, scripts, narration audio, scene data, and rendering inputs. It excludes environment files, credentials, private wallet data, and production account records. Narration uses the installed macOS Samantha synthetic voice at 155 words per minute for the demo and pitch, and 168 words per minute for the technical walkthrough. No person's voice is cloned and no stock soundtrack is used. Encoding, dimensions, measured durations, and audio measurements are recorded for the version-2 exports.

## Captions, transcripts, and verification

Each MP4 has a matching poster, English WebVTT captions, and a Markdown transcript. Caption timing follows the current narration and render. Public assets and mirrored caption/transcript files describe the same version-2 scenes and speech.

The release verification record covers:

- End-to-end decode and measured duration/codec metadata for all three films.
- Contact-sheet review of the current B mark, readable app captures, correct sample numbers, and provider labels.
- Browser playback and seeking with working controls, caption tracks, and no media errors.
- Audio review for intelligibility, clipping, and synchronization.
- Matching `/demo` runtime labels, posters, captions, transcripts, and source-release links.

Public exploration and device reports need no sign-in. Optional cloud behavior is covered by SDK tests with mocked transport and the existing owner-only schema/RLS audit. Current production email delivery and real nonproduction auth/report mutation journeys remain unverified; signup and recovery sending stay gated. The public offline calculator and supported-browser PWA installation are included, without claiming native store binaries.

## September 13 measured exports

All three final Higgsedit exports are H.264, 1600 × 900, nominal 24 fps, with AAC stereo at 48 kHz and faststart. The complete output files pass FFmpeg decode without errors. Mean audio levels are −20.6, −20.8 and −20.7 dBFS; peaks are −5.4, −5.0 and −5.9 dBFS respectively. All 50 caption cues match the narration text, stay in time order, and end within their films. The contact sheet was visually reviewed for current branding, sample arithmetic, source boundaries, and framing. See `videos/metadata.json` and `videos/quality-checks.json` for measured values and hashes.

The 78-file source archive has SHA256 `8069264a9219ed1d24ebb4165f2de00370740fcd596077444921af9c1ab12ca9` and records the captured application source commit `f612c22`. It contains no environment files or credentials. The original films remain preserved in the version-1 release.

The published films pass desktop/mobile playback with native English captions selected: cues load and activate after seeking. All transcript links return current content. Production MP4 hashes match the verified exports and support HTTP 206 seeking; `videos/production-verification.json` records the check.

The September 19 local pass preserves the September 13 films and their narration, captions, audio, download, and seek controls. The demo-page introduction explicitly identifies them as earlier recordings. No new film generation, narration claim, upload, or media release was performed. The current 90-second script is in the final verification record.


Final playback polish: all three native English caption tracks prepare without displaying captions, so they are ready before sequential playback. A viewer/browser preference that already enables captions is preserved. The native play, seek, audio, fullscreen, download and caption controls remain. Final evidence includes actual sequential playback and a separate 23-second recording of hero travel, B4 animation and B6 refraction under `work/evidence/real-alerts-2026-09-20/production/`.
