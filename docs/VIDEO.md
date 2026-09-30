# Buffer films

The September 30 refresh uses current app recordings and one continuous conversational Niki voice take for each film. The three films share the same visual language as the workspace: a light surface, cobalt identity, readable UI, concise chapters, and a desktop/mobile composition. The narration runs at its original pace; it is not time-stretched.

## The three journeys

| Film | Story |
| --- | --- |
| Product walkthrough | New navigation, editable portfolio, price scenario and contributions, a public Velocity mainnet observation, saved/downloaded reports, and mobile navigation |
| Pitch | The problem Buffer addresses, scenarios, current risk context, monitoring readiness, and the responsive workspace |
| Technical walkthrough | Provider validation and freshness, exact price-effect math, separate liquidation estimates, provider/network boundaries, hosted monitoring design, and portable reports |

Measured durations and codecs live in `videos/metadata.json`; the `/demo` page reads its runtime labels from those values. Every film has a matching poster, English WebVTT captions, Markdown transcript, and download link. The public media revision is `20260930`.

## Picture and data provenance

All product screens are actual browser recordings from the current Buffer application. Mainnet scenes read the public Velocity example through the deployed provider API; their network, authority and observation time are recorded in `videos/source-v3/capture-metadata.json`. When captured from the local production build, only the public accounts/snapshot GET requests pass through to the production origin. Query parameters and actual provider responses are preserved. No balance, account response, authentication success or notification receipt is fabricated.

Desktop footage is captured at 1600 × 900 and mobile footage at 390 × 844, then composed into the 1920 × 1080 films. The desktop frame leaves space below the interface for optional captions.

Chapter labels distinguish illustrative portfolios from public Solana mainnet observations. An observation is evidence of what that public account returned at capture time; it is not a promise that the account will retain the same balances. The walkthrough intentionally avoids narrating changing live amounts as permanent results.

The recorded portfolio editor and price controls use fixed illustrative inputs. The scenario calculates an incremental price effect for supported linear positions. Current maintenance headroom is a separate provider observation, and the liquidation estimate uses the separately versioned `cross-margin-hold-others-v1` model. It holds other prices fixed and is not the protocol's liquidation engine.

Velocity and Pacifica support eligible price scenarios. Jupiter remains inventory-only, and legacy Drift remains paused. Devnet observations retain a test-network identity and do not enter background monitoring. Private cloud features and recipient delivery are described with their actual setup boundaries; the films do not stage a signed-in account or a successful outbound message.

## Voice and assembly

The Niki preset is generated synthetic narration, chosen for conversational delivery. It does not clone or impersonate a real person. The accepted generation IDs, measured durations and file hashes are recorded in `videos/source-v3/narration-metadata.json`; expiring download URLs and credentials are excluded. There is no macOS Samantha fallback in this refresh.

The current films are composed with FFmpeg from real browser footage, with short transitions and continuous audio. They do not claim a new generated Higgsfield visual or native Higgsedit render. Existing background imagery retains its original provenance in `public/videos/design/README.md`.

Speech recognition supplies word timestamps from the accepted voice files. Captions preserve the authored script, aligned against that recording; scene timing follows the paragraph boundaries in the measured audio. Generated timestamps are checked for ordering, bounds and agreement before publication.

## Reproduction and verification

The preparation and rendering pipeline is in `videos/source-v3/README.md`. It preserves the prior source archive and separates new scripts from large generated recordings and voice files. Its checks cover:

- Complete MP4 video/audio decoding and browser-compatible 1920 × 1080 H.264/AAC output.
- Exact agreement among narration scripts, caption text and transcripts.
- Measured caption bounds, audio peaks, file hashes and runtime metadata.
- Actual desktop/mobile video playback, sequential seeking, caption activation, transcript links and responsive page layout through `e2e/demo.spec.ts`.
- Visual review of real UI captures, source labeling, current branding and readable framing.

Release-specific results are recorded in `videos/quality-checks.json` and the current release evidence directory. A passing synthetic test is not described as real recipient delivery or a real wallet-device test.

`videos/buffer-video-sources-v3.tar.gz` contains the reviewed scripts, all eleven public/illustrative recordings, accepted narration, word alignments, capture provenance, and the approved brand mark. Extract it at a project root to retain the renderer's expected paths. The archive excludes environment files, credentials, private sessions and expiring provider URLs.

## Historical versions

The [September 13 v2 source release](https://github.com/operatoruplift/buffer/releases/tag/media-source-v2) remains intact. It contains the earlier 1600 × 900 films, macOS Samantha narration, Higgsfield sandbox/native Higgsedit assembly, and the earlier UI. Its films lasted 81.961, 51.710 and 106.254 seconds. Those historical measurements and checks do not validate the current exports.

The [v1 source release](https://github.com/operatoruplift/buffer/releases/tag/media-source-v1) preserves the original September 11 films and old U identity. The old generated Seedance opener belongs to that historical film and is not presented as a new B-brand generation.
