# Buffer — a clearer view of perpetual exposure

**Last updated:** September 12, 2026.

[Website](https://bufferonsolana.vercel.app) · [Interactive app](https://bufferonsolana.vercel.app/app) · [Demo and films](https://bufferonsolana.vercel.app/demo) · [Public GitHub repository](https://github.com/operatoruplift/buffer)

## Short description

Buffer is a read-only Solana / Velocity explorer that turns a shared market move into clear, precise perpetual-position scenarios—with explicit coverage, verified oracle freshness, exportable reports, and an installable mobile and desktop app.

## Submission description

Buffer answers one practical question: **“What would a market move do to these positions?”**

Open the public live example or paste a Solana authority, select one **Velocity** subaccount, and inspect its current account snapshot. A shared slider models incremental price P&L on eligible existing SOL, BTC, and ETH linear perpetual positions. Long and short contributions appear separately, unsupported exposure is clearly excluded, and collateral, debt, open orders, quote identity, and oracle freshness stay visible outside the model. Current baseline metrics stay separate from the hypothetical price effect. The current Velocity quote asset is USDT; baseline USD metrics come from the SDK's validated quote valuation.

The protocol selector can inspect the paused legacy Drift deployment explicitly. Drift and Velocity use different programs, PDAs, and layouts; Buffer does not imply that Drift balances migrated. The app links to the [official migration guide](https://docs.velocity.exchange/developers/migrate-from-drift) and withholds paused or stale legacy calculations instead of showing invented current prices.

A Method dialog explains assumptions, fixed program identity, coverage, and provenance. A local JSON report preserves the selected shock, exact decimal contributions, snapshot observations, protocol metadata, and exclusions. Visitors can save historical reports on the device without an account. Confirmed cloud users can also save, download, or delete private historical reports through Supabase, while public exploration and downloads require no sign-in.

The Solana integration reads Velocity State, user accounts, markets, and Pyth Lazer oracles through the official server-side SDK **0.23.1**. It verifies program ownership, canonical PDAs, market identities, quote mint, oracle validity, and complete baseline coverage. The provider uses request-owned loaders, records separate read slots, and expires live snapshots after 120 seconds. There is no signing, custody, transaction, or trading path.

Three labeled deterministic samples make the model immediately understandable. The responsive website includes an interactive preview and a gallery with a product demo, a Higgsfield-assisted pitch, and a technical walkthrough. The installable PWA works on supported mobile and desktop browsers and provides an explicitly labeled offline sample; its service worker does not cache private reports, authentication, or live data.

Built with Next.js, React, TypeScript, precise decimal arithmetic, the official Velocity and legacy Drift SDKs, and Supabase. A cobalt ribbon B monogram and restrained responsive interface keep the emphasis on understanding position effects. The source is public and the website is deployed on Vercel.

**Verification disclosure:** The current Velocity provider decoded public mainnet State, SOL/BTC/ETH markets, USDT spot identity, and a public example with +0.05 BTC and +2 ETH on subaccount 0. A representative read at observed slot **446228680** had valid external oracles at one-slot lag, USDT collateral, net USD value `2105.213085`, funding-inclusive unrealized P&L `297.289922`, and health `89`; these values can change and are refetched by the UI. The earlier legacy Drift read had a stale oracle and correctly withheld affected values. Real Supabase password sign-in and private-report operations passed with confirmed test fixtures. Public signup and recovery remain disabled until SMTP, Auth redirects, and server-side password settings are verified. No public email-delivery success or native store package is claimed.

## Demonstration assets

| Asset | Contents |
| --- | --- |
| [Interactive explorer](https://bufferonsolana.vercel.app/app) | Live Velocity example, explicit subaccount choice, deterministic samples, scenario slider, coverage, Method, device save, and JSON export. |
| [Product demo](https://bufferonsolana.vercel.app/demo#demo) | About 88 seconds of the actual working sample journey. |
| [Higgsfield pitch](https://bufferonsolana.vercel.app/demo#pitch) | About 62 seconds, combining generated brand motion with authentic interface capture. |
| [Technical walkthrough](https://bufferonsolana.vercel.app/demo#technical) | About 124 seconds on provider boundaries, math, coverage, freshness, and reproducibility. |

[Video provenance, captions, transcripts, and source materials](VIDEO.md) identify the generation job and production checks. The films show deterministic fixtures; the live example is demonstrated in the interactive app. [Full product descriptions](DESCRIPTION.md) provide reusable Markdown copy.

## 90-second live presentation

| Time | Action and narration |
| --- | --- |
| 0–15 seconds | Open `/app` and choose **Explore a live account**. “Buffer reads one public Velocity account without a wallet. The protocol and current read state stay visible.” |
| 15–32 seconds | Select the discovered **Subaccount 0**. “This public example currently has a BTC long and an ETH long, with USDT collateral. Balances and prices are live observations and can change.” |
| 32–50 seconds | Set **−10%**. “The slider applies one move to eligible perpetual prices. Each contribution is shown in verified USDT; the account's USD baseline remains separate.” Point to the scenario total and the position rows. |
| 50–67 seconds | Open **Method**. “The program, quote mint, oracle slots, validity checks, and 120-second expiry explain exactly what this read means. Account and oracle reads are not an atomic same-slot snapshot.” |
| 67–80 seconds | Open **My reports**, save the scenario on the device, and close the dialog. “No sign-up is needed for a dated local copy. A confirmed cloud account can store a private copy through Supabase.” |
| 80–90 seconds | Choose **Long + short**, select **−10%**, and show the deterministic sample arithmetic: −1,500 USDC plus +5,000 USDC equals +3,500 USDC. “Samples are labeled fixtures; live Velocity values keep their USDT denomination.” |

Retain visible source, protocol, subaccount, timestamp, quote currency, and coverage disclosures in both live and sample demonstrations. If a live oracle is stale or a refresh fails, show the unavailable state and retry path; never replace it with a plausible number. The legacy Drift selector should be used only to explain the paused migration boundary.

## Event eligibility

The [official Perps and Prediction Markets page](https://hackathons.solana.com/hackathons/perps-and-prediction-markets), checked September 11, 2026, lists a September 18 launch and September 25 deadline. Detailed eligibility, judging, and submission rules were not available in the inspected page; its rules field was null.

**Perps-only analytics eligibility and permission for pre-event development remain unverified.** Development began before the listed launch. Confirm both against published rules before entering. The app and source have been published, but no event entry, acceptance, prize eligibility, or endorsement is claimed.
