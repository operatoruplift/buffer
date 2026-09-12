# Buffer videos

**Last updated:** September 12, 2026.

Three finished films accompany the app: a product demo, a pitch made with Higgsfield, and a technical walkthrough. All interface footage is captured from the working Buffer application using deterministic sample accounts. The current app also has a live Velocity example at `/app`; the films keep deterministic fixtures so every narrated number remains reproducible.

| Film | Runtime | Content |
| --- | --- | --- |
| Product demo | About 88 seconds | Sample selection, shared price move, contributions, exclusions, Method, JSON export, responsive mobile interface |
| Higgsfield pitch | About 62 seconds | Generated brand motion combined with authentic product footage and a concise product story |
| Technical walkthrough | About 124 seconds | Data boundaries, provider validation, precise scenario formula, coverage, freshness, reproducible exports, integration limits |

[Download the films, captions, transcripts, and source archive](https://github.com/operatoruplift/buffer/releases/tag/media-source-v1). Videos are H.264 MP4, 1600×900, 24 fps, with AAC stereo audio, burned-in English captions, and separate WebVTT caption files. Markdown transcripts provide an accessible text alternative.

## Data and claims

- Every demonstrated account, oracle price, inventory row, and baseline metric is a deterministic fixture. The videos carry a persistent sample label.
- In the long-and-short sample, a shared −10% shock gives `100 × 150 × −0.10 = −1,500 USDC` for SOL and `−0.5 × 100,000 × −0.10 = +5,000 USDC` for BTC. The modeled total is `+3,500 USDC`.
- The result is incremental perpetual price P&L. It excludes collateral-price changes, fills, funding, fees, borrowing interest, and liquidation effects. It is not hypothetical account equity, health, or a liquidation prediction.
- Narration does not present the fixture footage as a live account or claim successful production authentication. The technical film explains provider boundaries and verification requirements. Current live Velocity reads are documented separately in [PROVIDER.md](PROVIDER.md) and [VERIFICATION.md](VERIFICATION.md).
- Footage documents the explorer core captured on September 11, 2026. The surrounding landing page, live Velocity provider, and optional account screens can evolve independently.

## Higgsfield provenance

The pitch uses an actual generated eight-second opening shot, followed by captured Buffer interface footage. It is not a wholly generated imitation of the application.

- Provider: Higgsfield.
- Model: `seedance_2_5` / Seedance 2.5 by ByteDance.
- Generation job: `5f1dbdb3-e9dd-4b54-915d-892b2bdbcb81`.
- Parameters: 8 seconds, 16:9, 720p, one output, generated audio disabled.
- Credit preflight: 52 credits from the existing connected balance. No purchase, upgrade, or trial activation.
- Visual brief: a cobalt translucent U form in a white architectural space, slow camera motion, no invented app UI, numbers, text, or people.
- [Original generated motion clip](https://d8j0ntlcm91z4.cloudfront.net/user_316WRAwjtWmpOAHb5tUQ2Grs4QP/hf_20260911_163125_5f1dbdb3-e9dd-4b54-915d-892b2bdbcb81.mp4).

## Production and sources

The films retain Buffer's previous U mark from their September 11 capture; the website and app now use the cobalt B monogram. The recorded mark, interface, diagrams, captions, and scripts are original project assets. The abstract generated object is a visual motif; the precise logo is drawn separately. Solana, Velocity, and legacy Drift names describe the implemented integrations and do not imply endorsement.

Narration is synthetic speech using the installed macOS Samantha voice, at 158 words per minute for demo/pitch and 180 for the technical film. No person's voice was cloned. No stock soundtrack or unlicensed music is used.

Playwright recorded the real sample journey. Native speech files and recordings were transferred as a public source archive in the authorized GitHub repository release. Higgsfield's remote sandbox performed FFmpeg/Pillow assembly, caption rendering, and export. The source archive contains the captured clips, narration text/audio, scene manifest, capture script, and renderer; it contains no environment files, credentials, private wallet data, or production account records.

The renderer holds the last captured frame when narration exceeds the action clip. This is an editorial pause on a real interface state. It does not invent interactions or data.

## Verification

Final files are decoded end to end with FFmpeg, metadata is inspected with ffprobe, and a nine-frame contact sheet samples the three films. The delivery includes the resulting metadata and contact sheet. All three hosted MP4s play and seek in Chromium with no media errors. The actual pitch audio was transcribed using faster-whisper tiny.en and checked against the narration. Mean levels are approximately −18.8 dB and peaks remain below −3.9 dB, with no clipping. Full-size opener and end-card frames were also reviewed. See `videos/browser-playback.json` and `videos/quality-checks.json` for recorded checks.
