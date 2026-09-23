# Buffer / A clearer perspective

September 23, 2026 collection. The established ribbon B and cobalt `#315FE8`
remain the identity. This redesign replaces the old generic gradient artwork;
it does not change the website logo, favicon, installed-app icons, or app theme.

## Art direction

**Daylight:** monumental optical glass, cobalt edges, warm ivory, tactile light.
**After hours:** satin cobalt ribbon sculpture against deep midnight navy.
Typography uses the existing Helvetica Neue / Helvetica / Arial brand stack.
The exact monogram path is read from `public/brand/mark.svg`, never redrawn.
Copy describes exploration and perspective, without fabricated performance data.

The compositions are designed individually for profile crops, phone clocks,
desktop icons, social feeds, stories, and platform header safe areas. Header
dimensions are canvas targets; platforms can crop differently by device.
The YouTube identity is kept inside the centered 1546 × 423 region of its
2560 × 1440 canvas. Story content stays clear of the upper/lower interface areas.

Canvas sizes checked against [X's header guidance](https://help.x.com/en/managing-your-account/common-issues-when-uploading-profile-photo),
[LinkedIn's personal cover guidance](https://www.linkedin.com/help/linkedin/answer/a568217),
and [YouTube's banner guidance](https://support.google.com/youtube/answer/12950272?hl=en).
YouTube also documents [minimum safe-area dimensions and a 6 MB file limit](https://support.google.com/youtube/answer/10456525?hl=en-GB);
the supplied 2560 × 1440 export keeps essential content within the equivalent
center region and below that upload limit. Verified September 23, 2026.

## Source and rebuild

- `masters/daylight.png` and `masters/after-hours.png`: original generated
  background artwork, created with the built-in image-generation tool on
  September 23, 2026. No third-party logos or stock image references were used.
- `prompts.md`: the complete source prompts.
- `src/lib/brand-assets.ts`: names, usage, sizes, paths, and collection metadata.
- `scripts/generate-brand-kit.mjs`: local SVG composition, PNG export,
  lightweight WebP previews, checked manifest, and ZIP assembly.
- `public/brand-kit/manifest.json`: source hashes and exported PNG hashes/sizes.

From the repository on Node 24 with the locked dependencies installed:

```sh
node scripts/generate-brand-kit.mjs
```

The script uses Sharp already present in the locked Next.js dependency tree
and the system `zip` utility. Release exports were composed on macOS with
Helvetica Neue. Rebuilding on a host without that font uses the declared
fallback and may alter letter widths; visually review regenerated exports.
No image-generation API or credential is used during regeneration or build.

SVG layouts embed a compressed copy of the unchanged generated art. They are
not vector photographs. Profile and standalone logo SVGs remain vector.
PNG is the recommended share format and freezes the reviewed typography.
Legacy asset filenames remain available with the revised artwork. Desktop
wallpaper/background canvases have been upgraded to 3840 × 2160.

## Delivery

`/brand-kit` uses lightweight previews, a full-fit native preview dialog,
category filters, original PNG links, vector profile/logo downloads, and
`/brand-kit/buffer-brand-kit.zip`. The archive contains all 15 full-size PNGs,
both profile SVGs, a readme, and the manifest. Gallery previews are not cropped.
Native download may save to Files on a phone; opening the PNG enables the
browser's image-saving/share controls. No private data or account is required.

The core PWA cache allowlist is unchanged; brand downloads do not cache any
account data, reports, API responses, or monitoring configuration.
