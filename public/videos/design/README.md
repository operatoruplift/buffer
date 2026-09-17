# Selected B3 / B4 / B6 media

The user supplied these exact original clips/posters. Local files are same-source optimizations, not generated replacement art. Source videos are H.264, 24fps, 10.041667 seconds. Derivatives keep H.264/24fps, strip decorative audio, preserve aspect ratios and use CRF24 with faststart; max widths: hero1600, wide-stage/auth1280, portrait640. Hero/auth posters are frames from the originals at1s; supplied B4 posters are byte-for-byte original copies (the local FFmpeg build lacks a WebP encoder, so no poster re-encoding was used). The original product films were preserved during the September 12 redesign checkpoint. The user-authorized September 13 refresh replaces them with current recordings; see the repository’s docs/VIDEO.md.

The CDN HEAD responses did not advertise cross-origin canvas access. Local same-origin assets avoid a media proxy and allow verified canvas sampling. No remote source is fetched through a user-controlled endpoint.

## Meridial Light source audit

The Meridial Light hero is a new same-origin derivative. The original source is retained in the handoff work area and is never used as a runtime dependency. The source decoded as H.264, 1080×1916, 24fps, 10.041667 seconds, silent. The local derivative is H.264, 720×1280, 24fps, 10.041667 seconds, silent, CRF26 with faststart. The poster is a 720×1280 WebP frame generated from the supplied source poster.

| File | Source URL | Source SHA256 | Local SHA256 |
| --- | --- | --- | --- |
| meridial-light.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260827_142319_f711d024-2a01-47c3-93d9-1224b1496276.mp4 | e859409bf0f7e2cbe86a8bd1ed36f75eb8cc63e35db6ef352f249f456099ae83 | 7f6e70e6e0bccf6f4a41d8c562d7350348a4d922712f2537884571e9e211a6b9 |
| meridial-light-poster.webp | https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/9df0fbe6-c369-4a24-b0cc-25d538dbb30b.png | 6b4163988ff9f8ee9d6b2a044294ef525cd4fd706a0529641e01386f77fdc26f | 4ec926b4149142fcb7866bdf95ea953827d31d27d0bb79cd725f6b05f053a470 |

| Source file | Original URL | Original SHA256 |
| --- | --- | --- |
| hero.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260518_003132_8b7edcb6-c64d-4a52-a9ca-879942e122ad.mp4 | c104c22dbc475487128e642ea5c651bcf88578810ae5142e570626c395cd4fe3 |
| stage-wide.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_125226_45cb4f38-aa7e-47e1-885d-ae0b69745369.mp4 | ebb876afc74aee0fb0333a9e284f679457ade14004c77287e14ae01ac555f8ce |
| stage-wide-poster.webp | https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/5c3ec08f-2dbf-4c0a-8588-f6106a789443.webp | 6e803a4a2e6fdb072dad241c9e8cbec430db2ddc68869a4c8de1af044468bf70 |
| stage-narrow.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_125242_daae1570-386d-4bd5-8896-80499e2371e0.mp4 | ec9f3673481a49893fa0ad854fdbdc3e1a9a28b32338da1c50f2ea76b5305fd3 |
| stage-narrow-poster.webp | https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0f4926a4-e660-4df2-9195-2bfb3e341bdd.webp | 9fd5600413b943640fe77037f8f4819efc600fa9c4297baa1faa565479e19651 |
| positions.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_130045_1a612b69-4854-4b34-8043-ccb91f2c60af.mp4 | fe0987f234ba1b8833186acbeb018fd8d14b3e6d2b28227c9e248ee06d1451e1 |
| positions-poster.png | https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/167977c6-8539-46b1-9a15-8dba566f50b8.png | 0d2ada24f1e69dab36828fd2423fe5ea74a1dc7ace253a949ba3fefcba08a342 |
| coverage.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_130054_dd005674-d693-4d81-80a5-357f7f10b3a3.mp4 | e773f366286787ca61d15518f7ba9be4f9602c6d2fe865acbc40eb54dedb5bd3 |
| coverage-poster.png | https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0446d1d5-e65e-4db5-8090-3e30d09afc43.png | f13ca87952393ec617dae02653a650748d4ee2a0b32dc56b4c42276aaac7b5fe |
| math.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_130103_7550f407-f14b-40a6-9616-7a26d7a8bd9f.mp4 | bf4b28044ea1997c23a42eb7d1dc3d759b8adcb603d86853ed17310b5479b6d5 |
| math-poster.png | https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/da8d0242-4dee-4f6d-813f-a5887e86ad77.png | 3b9a089afffea0dbaa7b5c48f047362a53ab460527eeac48c8513788235f753e |
| auth.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260606_135315_5f9e8a4c-09bc-4a97-9f75-8a387d4258ee.mp4 | 4dde87d1aa2ba0bbb7b8245c223bbbe46021704b5310148c4ea0f28d3412be5a |

| Local derivative | Bytes | SHA256 |
| --- | ---: | --- |
| auth-poster.jpg | 204727 | 118bbc7a7cb6ee18388628cf901049d7576d560c859a0ad227b22b038a5d0f75 |
| auth.mp4 | 2633755 | 0920ecb4f6cd13473464fbf4164f2eed24c2f0e23fe0a9fca148f63cff5cfe4b |
| coverage-poster.png | 1744078 | f13ca87952393ec617dae02653a650748d4ee2a0b32dc56b4c42276aaac7b5fe |
| coverage.mp4 | 447829 | bf8ddeb0b79b3e5c7e11e2455353432016f5c7bbcfd6168b1b5a0d0888a603a4 |
| hero-poster.jpg | 44674 | 7ea8b0df0cb839238b9677334e78daa14ea04226e869380e623052a5beb3952b |
| hero.mp4 | 1219337 | ae73176fdafaf51e1a52253a8b95fd60bbe247f4b1c20ac1f528960bf7578df2 |
| math-poster.png | 1108649 | 3b9a089afffea0dbaa7b5c48f047362a53ab460527eeac48c8513788235f753e |
| math.mp4 | 480774 | 94f2297768ef2241d3cec6e84274b1e6326c29e28d2e489f760a392ec8ec9b67 |
| positions-poster.png | 1815813 | 0d2ada24f1e69dab36828fd2423fe5ea74a1dc7ace253a949ba3fefcba08a342 |
| positions.mp4 | 330641 | 2cbb2686466480f35d71de0adb89ef6ba4b35c3df29a31b701ec16daa4538b89 |
| stage-narrow-poster.webp | 84436 | 9fd5600413b943640fe77037f8f4819efc600fa9c4297baa1faa565479e19651 |
| stage-narrow.mp4 | 319983 | d1ebf82b82de38288123c8ed29ca9ad642f562932066ef305d4c6de95ca01ce8 |
| stage-wide-poster.webp | 121670 | 6e803a4a2e6fdb072dad241c9e8cbec430db2ddc68869a4c8de1af044468bf70 |
| stage-wide.mp4 | 627107 | 15010a44ea642aa2a27063af778e3541182d516ce446e6645ec6c44712414428 |

## Shipped poster derivatives

`positions-poster.webp`, `coverage-poster.webp` and `math-poster.webp` are 720×1280 WebP (quality 82) derivatives of the PNG originals hashed above; the 1.0–1.7 MB PNGs are no longer shipped because they were the landing page's largest contentful paint. Regenerate with Pillow: `Image.open(png).convert('RGB').resize((720, 1280), Image.LANCZOS).save(webp, 'WEBP', quality=82, method=6)`.
