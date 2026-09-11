# Buffer — a clearer view of perpetual exposure

**Last updated:** September 12, 2026.

[Website](https://buffer-lovat.vercel.app) · [Interactive app](https://buffer-lovat.vercel.app/app) · [Demo and films](https://buffer-lovat.vercel.app/demo) · [Public GitHub repository](https://github.com/operatoruplift/buffer)

## Short description

Buffer is a read-only Solana / Drift explorer that turns a shared market move into clear, precise perpetual-position scenarios—with explicit coverage, exportable reports, and an installable mobile and desktop app.

## Submission description

Buffer answers one practical question: **“What would a market move do to these positions?”**

Paste a public Solana authority, select one Drift subaccount, and inspect its current account snapshot. A shared slider models incremental price P&L on eligible existing SOL, BTC, and ETH linear perpetual positions. Long and short contributions appear separately, unsupported exposure is clearly excluded, and collateral, debt, and open orders stay visible outside the model. Baseline account metrics stay separate from the hypothetical price effect.

A Method dialog explains assumptions, coverage, and provenance. A local JSON report preserves the selected shock, exact decimal contributions, snapshot observations, and exclusions. Confirmed cloud users can save, download, or delete private historical reports through Supabase, while public exploration and downloads require no sign-in.

The Solana integration reads Drift user accounts, market state, and oracles through the official server-side SDK. It verifies ownership, market identities, quote currencies, oracle validity, and complete baseline coverage. Seven captured public mainnet account buffers guard against incompatible SDK layouts. There is no signing, custody, transaction, or trading path.

Three labeled deterministic samples make the model immediately understandable. The responsive website includes an interactive preview and a gallery with a product demo, a Higgsfield-assisted pitch, and a technical walkthrough. The installable PWA works on supported mobile and desktop browsers and provides an explicitly labeled offline sample; its service worker does not cache private reports, authentication, or live data.

Built with Next.js, React, TypeScript, precise decimal arithmetic, and Supabase. An original open-gauge identity and restrained responsive interface keep the emphasis on understanding position effects. The source is public and the website is deployed on Vercel.

**Verification disclosure:** Real local and deployed mainnet authority/subaccount reads decoded a +1 SOL position. Its oracle was stale, so affected calculations were withheld correctly; a fresh-oracle live scenario remains unverified. Real Supabase login and private-report operations passed desktop/mobile testing with confirmed fixtures. Public signup and recovery are disabled until SMTP and Auth settings are verified. Production browser checks passed 42 cases. Both deployed account-discovery and snapshot endpoints returned HTTP 200; see [verification](VERIFICATION.md). No public email-delivery success or native store package is claimed.

## Demonstration assets

| Asset | Contents |
| --- | --- |
| [Interactive explorer](https://buffer-lovat.vercel.app/app) | Three repeatable samples, scenario slider, coverage, Method, JSON report. |
| [Product demo](https://buffer-lovat.vercel.app/demo#demo) | About 88 seconds of the actual working sample journey. |
| [Higgsfield pitch](https://buffer-lovat.vercel.app/demo#pitch) | About 62 seconds, combining real generated brand motion with authentic interface capture. |
| [Technical walkthrough](https://buffer-lovat.vercel.app/demo#technical) | About 124 seconds on provider boundaries, math, coverage, freshness, and reproducibility. |

[Video provenance, captions, transcripts, and source materials](VIDEO.md) identify the generation job and production checks. The films show deterministic fixtures; narration does not present them as live account results. [Full product descriptions](DESCRIPTION.md) provide reusable Markdown copy.

## 90-second live presentation using Sample

| Time | Action and narration |
| --- | --- |
| 0–15 seconds | Open `/app` and choose **Long + short**. “Perpetual positions can point in different directions. Buffer shows their incremental response to a shared market move. This is labeled Sample data.” |
| 15–35 seconds | Point to the subaccount and two positions. “This example has 100 SOL long and half a BTC short. One selected subaccount supplies one frozen snapshot. Current baseline metrics remain separate.” |
| 35–60 seconds | Select **−10%**. “At fixture prices of 150 and 100,000 USDC, SOL contributes −1,500, the BTC short contributes +5,000, and the combined price P&L change is +3,500 USDC.” Move one keyboard step, then restore −10%. |
| 60–75 seconds | Open **Method**. “Two positions are modeled. Sizes stay fixed. Collateral-price changes, future fills, funding, fees, interest, and liquidation effects are excluded.” Show coverage and provenance. |
| 75–90 seconds | Close Method and **Download report**. “The report preserves the precise contributions and assumptions. Buffer can read public Drift accounts; this repeatable demonstration uses clearly labeled fixtures.” Reset to zero. |

Retain visible source, subaccount, timestamp, and coverage disclosures in both Sample and Live demonstrations. A stale live oracle should be demonstrated as unavailable, never replaced with a plausible number.

## Event eligibility

The [official Perps and Prediction Markets page](https://hackathons.solana.com/hackathons/perps-and-prediction-markets), checked September 11, 2026, lists a September 18 launch and September 25 deadline. Detailed eligibility, judging, and submission rules were not available in the inspected page; its rules field was null.

**Perps-only analytics eligibility and permission for pre-event development remain unverified.** Development began before the listed launch. Confirm both against published rules before entering. The app and source have been published, but no event entry, acceptance, prize eligibility, or endorsement is claimed.
