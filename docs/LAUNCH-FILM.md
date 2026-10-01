# Buffer launch film

The launch film appears at [/demo#launch](https://bufferonsolana.vercel.app/demo#launch), before the three narrated product films. The landing page links to it from the product essentials strip. Playback is optional, with native controls, inline mobile playback, and no autoplay or video preload. The poster loads before a viewer starts the film.

The user supplied `buffer-reel-30s-master.mp4` on October 1, 2026. The original master remains unchanged. The hosted derivative preserves the 30-second duration, 1920 × 1080 picture, 60 fps motion, and original music and interface-sound mix. Public assets are `/videos/buffer-launch.mp4` and `/videos/buffer-launch-poster.jpg`, with the cache revision `20261001`.

The fast-start H.264/AAC derivative is 10,432,064 bytes, 78% smaller than the master. All 1,800 frames decoded successfully; the AAC payload is identical to the source. The source mix measures −14.1 LUFS integrated and −1.8 dB true peak. The 1600 × 900 poster is taken from the final Buffer scene.

| Asset | SHA-256 |
| --- | --- |
| Supplied master | `a31dbdc8938a4057ec9132a86a0043dbe32ffdcf0a8c9ce5ce1c95ab98b7b592` |
| Hosted film | `fd92e554285f7507ebbd98e33e504508e54071b5880eb4fcca53edcd1d440fc3` |
| Poster | `1b6946ec9b8e7a669223579876d4f2b2db0e178e855772ab4466a4b6f3fb9ba3` |

Source-project credits list “Vlog Music Promo (Love Language)” by BombinSound on Pixabay, Kenney CC0 sound packs, and synthesized interface effects. This integration preserves the supplied mix without adding voice or replacement music.

This is a motion-graphics introduction, with illustrative positions and fixed reference prices. It is not footage of transaction signing, trading, or settlement. Four positions show a combined +1,000 USDC price effect for a −10% move; the separate formula scene shows one position contributing −1,500 USDC. Funding, fees, collateral changes, and liquidations are outside the scenario model.

There is no spoken narration. The page provides a visible description and an expandable visual story, rather than an invented speech-caption track. The existing product, pitch, and technical films retain their English captions, transcripts, downloads, and September 30 capture context.

`e2e/demo.spec.ts` checks the landing link, initial paused state, native controls, actual video decode/playback/seek, duration and dimensions, ranged download, visual-story disclosure, and viewport fit on desktop and mobile. The three narrated films keep their separate caption and transcript checks.
