# Buffer media source v3

September 30, 2026 refresh. The exact narration is in `storyboard.json` and the three `buffer-*-narration.txt` files. Actual new app footage is captured after the UI build settles; the earlier v2 archives remain unchanged.

## Production sequence

1. Generate one continuous Niki voice take for each film at its natural rate. Accepted job IDs, durations and hashes belong in `narration-metadata.json`. Store the completed MP3 as `buffer-demo.mp3`, `buffer-pitch.mp3`, and `buffer-technical.mp3`. Never substitute the old Samantha voice, clone a person, or time-stretch the narration.
2. Run `transcribe.py INPUT OUTPUT` with faster-whisper in an isolated environment to produce `buffer-*-alignment.json`. This is speech recognition over the accepted file, not another voice-generation call.
3. Run the production app without the development overlay and with its intended public-read configuration, so the visible setup guidance matches production. `BUFFER_CAPTURE_URL=http://127.0.0.1:3001 node videos/source-v3/capture.mjs` records the current real interface. `BUFFER_CAPTURE_ONLY=live,risk` permits a bounded recapture. When the deployed provider endpoints are the verified read source, `BUFFER_CAPTURE_READ_ORIGIN=https://bufferonsolana.vercel.app` transparently obtains only GET `/api/accounts` and `/api/snapshot` from that origin. Query parameters and actual responses remain unchanged; the capture manifest records that provenance. No response is fabricated. The recorder rejects a start/end frame that exposes a local-only missing-RPC warning.
4. Run `render.py` with Pillow/FFmpeg available. This composes actual desktop/mobile recordings at 1920 × 1080, follows measured narration word timestamps, produces captions/transcripts, and measures runtime. Chapter labels distinguish public mainnet observations from illustrative portfolios. There are no staged account sessions or recipient receipts.
5. Run `quality.py`, inspect the contact sheets and listen to complete voice tracks. `render.py --publish` copies accepted exports into `public/videos` and their `videos` mirrors; use it only after review. The demo page reads measured runtime from `videos/metadata.json`.

Binary recordings/audio and render outputs are ignored in this source directory. Publish a source archive separately after checking that it contains only public footage, brand assets, scripts and narration. Never include credentials, environment files, private reports or expiring provider URLs.

The unchanged v2 source archive preserves the earlier Higgsedit pipeline. Its scripts were inspected during preparation; this directory contains only the active v3 pipeline.

Current assembly is an FFmpeg composition of actual app recordings; it does not claim a new generated Higgsfield visual or native Higgsedit render. Captured background assets retain their existing provenance.
