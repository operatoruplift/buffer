# Buffer design direction and sources

Research and implementation date: September 12, 2026.

## Recommended MotionSites starting point

**[USD Halo](https://motionsites.ai/?prompt=halo-usd-landing) is the best starting point for Buffer’s landing page among the prompts inspected.** Its offwhite canvas, large editorial type, rounded product stage, and restrained calls to action fit a product that should feel calm and understandable. Buffer’s implementation is original: its established cobalt U-shaped gauge identity, interactive scenario preview, copy, section composition, and calculations replace Halo’s identity and content.

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

For actual code reuse, Buffer’s landing page adapts the `MediaQueryList` subscription and cleanup pattern from **[World IDKit’s useMedia hook](https://github.com/worldcoin/idkit-js/blob/main/packages/react/src/hooks/useMedia.ts)**. The upstream **[MIT license](https://github.com/worldcoin/idkit-js/blob/main/LICENSE)** was fetched and inspected before adaptation. The repository was archived as of the research date; Buffer uses only the small DOM subscription pattern, not an archived SDK dependency.

The adaptation in `src/components/Landing.tsx` listens to `prefers-reduced-motion` instead of a screen-width query, uses React’s `useSyncExternalStore` for consistent server rendering, and controls Buffer’s original decorative animations. A visible pause/play control also lets visitors stop motion. The subscription removes its event listener during cleanup.

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

- **Identity:** the original open U-shaped gauge mark; a short vertical needle suggests inspection without resembling a trading signal. Wordmarks and favicons use that same mark.
- **Palette:** cobalt `#315fe8`, offwhite `#f8f8f3`, dark ink `#18251e`, pale blue `#e8edff`, and quiet sage for coverage. Positive and negative sample contributions have text signs as well as color.
- **Type:** local system Helvetica/Arial stack; no externally hosted commercial fonts or unverified font downloads.
- **Composition:** a two-column introduction with a functioning preview; editorial feature rows; a coverage story; three method steps; browser-install guidance; privacy explanation; FAQ; a final action and oversized wordmark.
- **Motion:** original CSS orbit and app-mark movement; reduced-motion media query, a server-safe preference subscription, and manual pause support. No required timed splash screen.
- **Meaning:** the hero calculation uses the same `getSampleSnapshot`, `calculateScenario`, and `formatDecimal` functions as the app. All illustrative numbers are labeled as samples; live Velocity reads show their protocol, quote currency, current slots, and freshness.
- **Navigation:** real links to `/app`, `/auth`, installation guidance, method, FAQ, and the public source repository. Native disclosure elements support FAQ and mobile navigation. The live example is a direct call to action; no wallet connection is required.

## Token artwork provenance

Token marks are downloaded locally, not recreated with Unicode symbols or text approximations. The images below were retrieved from the public **[Trust Wallet assets repository](https://github.com/trustwallet/assets)** and visually checked on September 11, 2026. This is an established asset registry rather than a claim that Buffer obtained an endorsement or a direct brand partnership.

| Local asset | Registry source | Identity checked |
| --- | --- | --- |
| `public/tokens/sol.png` | [Solana native asset](https://github.com/trustwallet/assets/blob/master/blockchains/solana/info/logo.png) | Solana’s three gradient bars |
| `public/tokens/btc.png` | [Bitcoin native asset](https://github.com/trustwallet/assets/blob/master/blockchains/bitcoin/info/logo.png) | Orange Bitcoin mark |
| `public/tokens/eth.png` | [Ethereum native asset](https://github.com/trustwallet/assets/blob/master/blockchains/ethereum/info/logo.png) | Ethereum diamond |
| `public/tokens/usdc.png` | [Solana USDC mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v](https://github.com/trustwallet/assets/blob/master/blockchains/solana/assets/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png) | Blue USDC dollar mark |
| `public/tokens/usdt.png` | [Solana USDT mint Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB](https://github.com/trustwallet/assets/blob/master/blockchains/solana/assets/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png) | Green Tether mark |

Images are unmodified PNGs. Their original dimensions are 512×512, 128×128, 192×192, 181×181, and 300×300 respectively. Display them proportionally, keep token names beside them, and use an empty `alt` attribute when the adjacent text already names the asset. They identify underlying assets; they are not additional protocol integrations or partner logos.

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
