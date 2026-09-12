# Buffer design direction and sources

Research and implementation date: September 12, 2026.

## Recommended MotionSites starting point

**[USD Halo](https://motionsites.ai/?prompt=halo-usd-landing) remains the best starting point for Buffer’s landing page among the prompts inspected.** Its offwhite canvas, large editorial type, rounded product stage, and restrained calls to action fit a product that should feel calm and understandable. The hero now adds a native CSS/SVG shader layer inspired by the motion language of [Animated Shader Hero](https://motionsites.org/prompts/ravikatiyar162-animated-shader-hero), alongside Buffer’s ribbon B monogram and its own interactive scenario preview, copy, section composition, and calculations.

The MotionSites integration returned full prompt text for all the selections below. “Free” and “premium” reflect the catalog at research time; access may change. These are design prompts, not a guarantee of a production-ready application or working integrations.

| UI area | Exact catalog name and ID | Access | Recommendation for Buffer |
| --- | --- | --- | --- |
| Landing page | [USD Halo](https://motionsites.ai/?prompt=halo-usd-landing) · `halo-usd-landing` | Free | Best overall visual base. Borrow spacing, editorial hierarchy, and a strong hero object. The implemented hero uses the real sample calculation engine, not a decorative background video. |
| Features | [Nexora Features](https://motionsites.ai/?prompt=nexora-features) · `nexora-features` | Premium | Useful asymmetric storytelling reference. Buffer uses numbered feature rows and a coverage illustration so the explanation remains readable. No AI-search claims, stock video, or partner claims were carried over. |
| Sign in / sign up | [Solace sign-in](https://motionsites.ai/?prompt=solace-sign-in) · `solace-sign-in` | Premium | Reference for a single focused form and clear field hierarchy. Use Buffer’s opaque, high-contrast surfaces and real Supabase actions. Its supplied glass background, arbitrary delay sequence, social provider button, and placeholder form handler are not integration code. There was no verified separate signup template selected. |
| Footer | [Stark Minimal Footer](https://motionsites.ai/?prompt=stark-minimal-footer) · `stark-minimal-footer` | Free | Best footer structure: oversized wordmark, clear link groups, compact final line. Buffer adapts it to a warm light surface with only working links. Its aerospace identity and social links were not copied. |
| Loader | [Loader Animation](https://motionsites.ai/?prompt=18) · `18` | Premium | Inspected but not recommended as-is. Its counter runs on a fixed timer rather than load progress. Buffer should keep real loading status, allow early completion, and avoid making people wait for a decorative countdown. |
| In-app layout | [Modern HR Dashboard](https://motionsites.ai/?prompt=modern-hr-dashboard) · `modern-hr-dashboard` | Premium | Best inspected responsive layout reference: clear heading, grouped metrics, and a reflow from desktop to mobile. Buffer keeps its purpose-built account/scenario layout and original financial meaning; HR cards, photos, charts, and counts do not transfer. |

Also inspected **[Dashboard UI](https://motionsites.ai/?prompt=dashboard)** (`dashboard`). Its conference-room interface, background videos, and translucent panels are a poorer fit for dense financial data, so it was not selected. The resulting in-app explorer keeps the recommended Modern HR Dashboard information hierarchy while placing the live Velocity scenario first on narrow screens: account source, explicit subaccount, baseline, then the move and contribution breakdown.

The MotionSites integration asks that its returned access message be shown verbatim:

Access ALL prompts for stunning animated websites in one click: https://motionsites.ai/unlimited

## World reference and legitimately reusable code

The requested `world.xyz` address could not be retrieved by the browser research tool. World’s accessible official website at **[world.org](https://world.org/)** and its **[open-source page](https://world.org/open-source)** were reviewed instead.

The broad references are a human-centered introduction, ample whitespace, a large focal object, product-focused sections, and a compact FAQ. Buffer uses its own brand, drawings, motion, typography choices, and content. No World logos, website bundles, product videos, photographs, or private fonts are included.

An earlier landing-page version adapted the `MediaQueryList` subscription and cleanup pattern from **[World IDKit’s useMedia hook](https://github.com/worldcoin/idkit-js/blob/main/packages/react/src/hooks/useMedia.ts)**. The upstream **[MIT license](https://github.com/worldcoin/idkit-js/blob/main/LICENSE)** was fetched and inspected before adaptation. The repository was archived as of the research date; Buffer uses only the small DOM subscription pattern, not an archived SDK dependency.

The visible pause/play strip has since been removed at the user’s request. Decorative animations now complete within 4.5 seconds and use a CSS `prefers-reduced-motion` rule. The old JavaScript preference subscription is no longer needed; its upstream notice remains here for historical attribution.

The World Mini Apps UI Kit was also checked. A root license could not be established from the inspected repository files, so its code was not copied. This avoids treating public availability as a license grant.

### World IDKit MIT notice

Copyright (c) 2022 Worldcoin Foundation

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Dribbble inspiration

- [Sleek Dashboard Design for Data Management — Mike Taylor](https://dribbble.com/shots/26873204-Sleek-Dashboard-Design-for-Data-Management): reference for restrained information hierarchy, data grouping, and quiet borders.
- [Blue — SaaS Admin Dashboard UI Kit — Ibnu SW](https://dribbble.com/shots/16167461-Blue-SaaS-Admin-Dashboard-UI-Kit): reference for the relationship between a blue primary accent and neutral application surfaces.

These are visual references only. No Dribbble artwork, layout source files, or paid kit code was downloaded or republished. No additional product features are claimed just because they appear in a reference screen.

## Buffer’s original system

- **Identity:** a ribbon B monogram following the user's preferred layered letterform reference. Two curved horizontal ribbons sit above a shorter base bar, with open left gaps and rounded right shoulders. The mark retains cobalt `#315FE8`, with a white reverse on blue app tiles. Runtime marks, wordmarks, favicons, offline UI, and install icons share the same vector geometry.
- **Palette:** cobalt `#315fe8`, offwhite `#f8f8f3`, dark ink `#18251e`, pale blue `#e8edff`, and quiet sage for coverage. Positive and negative sample contributions have text signs as well as color.
- **Type:** local system Helvetica/Arial stack; no externally hosted commercial fonts or unverified font downloads.
- **Composition:** a two-column introduction with a functioning preview; editorial feature rows; a coverage story; three method steps; browser-install guidance; privacy explanation; FAQ; a final action and oversized wordmark.
- **Motion:** original CSS orbit, shader grid, animated signal line, and app-mark movement; a reduced-motion media query and brief animations that settle within 4.5 seconds. The install section's “BUFFER, WITH YOU.” caption and icon share one animated wrapper: centered, angled together, with an 18px desktop / 15px mobile gap. No required timed splash screen.
- **Meaning:** the hero calculation uses the same `getSampleSnapshot`, `calculateScenario`, and `formatDecimal` functions as the app. All illustrative numbers are labeled as samples; live Velocity reads show their protocol, quote currency, current slots, and freshness.
- **Navigation:** real links to `/app`, `/auth`, installation guidance, method, FAQ, and the public source repository. Native disclosure elements support FAQ and mobile navigation. The live example is a direct call to action; no wallet connection is required.
- **Selectors:** compact cobalt controls open readable option lists with descriptions, selected checks, keyboard navigation, typeahead, touch scrolling, and viewport-aware placement. All twelve sample choices stay available on narrow screens.
- **Browser icon:** `public/brand/favicon-ribbon.svg` uses a fresh filename for the current mark; `public/favicon.ico` provides 16/32/48px fallbacks. Metadata explicitly points browsers to these assets instead of the older cached install icon URL.

## Token artwork provenance

Token marks are downloaded locally, not recreated with Unicode symbols or text approximations. BTC, ETH, USDC, and USDT came from the public **[Trust Wallet assets repository](https://github.com/trustwallet/assets)** and were visually checked on September 11, 2026. The transparent Solana SVG comes from **[Solana’s official brand assets](https://solana.com/branding)**. HYPE comes from the official Hyperliquid application's coin assets, checked on September 12. These sources identify assets and do not imply endorsement or a brand partnership.

| Local asset | Registry source | Identity checked |
| --- | --- | --- |
| `public/tokens/sol.svg`, `public/tokens/sol.png` | [Solana official mark](https://solana.com/src/img/branding/solanaLogoMark.svg) | Transparent three gradient bars |
| `public/tokens/btc.png` | [Bitcoin native asset](https://github.com/trustwallet/assets/blob/master/blockchains/bitcoin/info/logo.png) | Orange Bitcoin mark |
| `public/tokens/eth.png` | [Ethereum native asset](https://github.com/trustwallet/assets/blob/master/blockchains/ethereum/info/logo.png) | Ethereum diamond |
| `public/tokens/hype.svg` | [Official Hyperliquid HYPE asset](https://app.hyperliquid.xyz/coins/HYPE.svg) | Original mint mark on a dark UI circle |
| `public/tokens/usdc.png` | [Solana USDC mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v](https://github.com/trustwallet/assets/blob/master/blockchains/solana/assets/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png) | Blue USDC dollar mark |
| `public/tokens/usdt.png` | [Solana USDT mint Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB](https://github.com/trustwallet/assets/blob/master/blockchains/solana/assets/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png) | Green Tether mark |

The Trust Wallet PNG dimensions remain 128×128, 192×192, 181×181, and 300×300 for BTC, ETH, USDC, and USDT. Buffer renders the official Solana SVG in the interface and keeps a matching 512×512 transparent PNG fallback. The USDT PNG has its connected white canvas removed while preserving the green token circle; the other source artwork remains intact. Display marks proportionally, keep token names beside them, and use an empty `alt` attribute when adjacent text already names the asset. They identify underlying assets; they are not additional protocol integrations or partner logos.

The repository’s [MIT license](https://github.com/trustwallet/assets/blob/master/LICENSE) was inspected. Its notice is preserved below and in `public/tokens/LICENSE.txt`. Token trademarks remain their respective owners’ marks.

### Trust Wallet assets MIT notice

MIT License

Copyright (c) 2019-2023 Trust Wallet

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
