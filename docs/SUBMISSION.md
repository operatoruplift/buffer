# Buffer — a clearer view of perpetual exposure

**Updated:** September 13, 2026.

[Website](https://bufferonsolana.vercel.app) · [Interactive app](https://bufferonsolana.vercel.app/app) · [Demo and films](https://bufferonsolana.vercel.app/demo) · [Public GitHub repository](https://github.com/operatoruplift/buffer)

## Short description

Buffer makes Solana perpetual positions easier to understand with read-only price scenarios, explicit coverage, an editable sample portfolio, and dated reports on mobile and desktop.

## Submission description

Buffer answers one practical question: **“What would a market move do to these positions?”**

Start with the editable four-market sample or one of twelve preserved fixtures. For public accounts, paste a Solana authority, choose a provider and account, and inspect its current source data without connecting a wallet. **Velocity is the default live provider**; eligible SOL, BTC, ETH, and HYPE linear perps support a shared −20% to +20% price move. Long and short contributions stay visible, and verified USDT price effects remain separate from the account's baseline USD valuation.

**Pacifica** adds 76 configured perpetual identities across crypto, equities, commodities, indexes, and FX. Its fixed public API needs no key or RPC configuration. The adapter checks exact market identity and API price timestamps; price effects use USD, while USDC margin remains separate. The app does not invent Solana observation slots for API data.

**Jupiter Perps** provides live **inventory-only** coverage. Canonical position/PDA, owner, pool, and collateral-custody checks support inspection of SOL, ETH, and BTC positions. Rows show direction, USD size, entry price, recorded collateral, reserved collateral-token amounts, and source/read metadata. Current oracle prices and a faithful collateral-dependent capped payoff remain unmodeled; Jupiter rows never enter the existing linear shock totals. Legacy **Drift remains paused**, with its deployment and migration boundary kept explicit.

The sample builder starts with 100 SOL long at 150, 0.5 BTC short at 100,000, 8 ETH long at 2,500, and 2,500 XRP long at 2. **Add perps** searches all 76 configured sample identities. Visitors can edit direction, quantity, and baseline price, remove positions, and choose illustrative USDC, USDT, or USD labels without FX conversion. Edits flow into precise JSON exports and device reports; live snapshots remain read only.

At −10%, this four-market app sample contributes −1,500 + 5,000 − 2,000 − 500 for **+1,000 USDC**. The separate two-position landing example and preserved Long + short fixture total **+3,500 USDC**. Both use fixed illustrative prices. The result is incremental price P&L, with sizes held fixed. It does not forecast account equity, margin health, or liquidation. Funding, fees, fills, borrowing interest, collateral-price changes, and liquidation effects remain outside the calculation.

The Method dialog exposes assumptions, coverage, source identity, freshness, and separate RPC slots or API timestamps. Modeled live snapshots expire within 120 seconds, or earlier when their source price expires. Failed refreshes disable calculations and retain the old snapshot visibly as stale; late requests cannot replace a newly selected account. RPC and REST reads have fixed endpoints, request deadlines, response limits, sanitized errors, and no-store behavior.

A JSON report preserves exact decimal strings, selected shock, contributions, exclusions, and provenance. **My reports** saves historical copies on the device without an account. Optional confirmed cloud accounts have a separate owner-protected Supabase library; guest data is never uploaded automatically. Session-bound auth and SDK storage commits protect against delayed requests replacing a newer login. Public signup and password-recovery sending remain disabled until email delivery and related production settings are verified.

The responsive website includes an interactive preview, supplied animated media, three explanatory feature cards, and an optional account screen with actual bounded video refraction. The installable PWA supports appropriate mobile and desktop browsers and provides a clearly labeled public offline calculator. Private reports, auth/session data, and live API responses stay outside its service-worker cache. No native store package, wallet signing, custody, transaction, or trading path is claimed.

Built with Next.js, React, TypeScript, exact decimal arithmetic, separate provider adapters, and Supabase. The public source and current application are available through the links above.

## Verification disclosure

The current local verification recorded successful Velocity and Pacifica modeled reads and Jupiter inventory reads. These are point-in-time observations; example accounts can change. The source audit and automated suites cover canonical decoding, malformed/stale inputs, exact units, source isolation, report privacy, auth session races, responsive layouts, media, and offline behavior. See [the current verification record](REDESIGN-VERIFICATION.md), [provider matrix](PROVIDER-COVERAGE.md), and [Jupiter evidence](JUPITER-VERIFICATION.md).

The latest auth journeys exercised the installed SDK with intercepted transport; no production users or report records were created for the redesign. Real nonproduction auth/report mutation checks and production confirmation/recovery email delivery remain unverified. Earlier successful real-auth checks and old Velocity balances in historical documentation are not a fresh verification claim for this release.

## Demonstration assets

| Asset | Contents |
| --- | --- |
| [Interactive explorer](https://bufferonsolana.vercel.app/app) | Four-market sample, 76-market builder, 12 preserved fixtures, modeled Velocity/Pacifica reads, Jupiter inventory, coverage, Method, device save, and JSON export |
| [Product demo](https://bufferonsolana.vercel.app/demo#demo) | Current sample journey, editor, provider selector, reports, and mobile app |
| [Pitch](https://bufferonsolana.vercel.app/demo#pitch) | Current product story with authentic redesigned UI, assembled in the Higgsfield sandbox |
| [Technical walkthrough](https://bufferonsolana.vercel.app/demo#technical) | Provider boundaries, quote identity, precise arithmetic, freshness, report privacy, and verification limits |

Measured runtimes come from the encoded exports. [Video documentation](VIDEO.md) and the [version-2 source archive and storyboard](https://github.com/operatoruplift/buffer/releases/tag/media-source-v2) describe source footage, narration, captions, transcripts, and provenance. [Media-source-v1](https://github.com/operatoruplift/buffer/releases/tag/media-source-v1) remains a historical archive.

The films use sample footage and the real provider selector. They do not stage live account values or production authentication success. The refreshed production does not claim a new Seedance generation.

## 90-second presentation

| Time | Action and narration |
| --- | --- |
| 0–15 seconds | Open `/app` on **Four-market portfolio**. “Buffer turns a market what-if into an explanation. This sample starts with SOL, BTC, ETH, and XRP.”|
| 15–30 seconds | Apply **−10%** and inspect contributions. “The SOL long contributes −1,500, the BTC short +5,000, ETH −2,000, and XRP −500: **+1,000 USDC**. These prices are fixed samples.”|
| 30–45 seconds | Open **Add perps**, search a market, and inspect editable quantity/price controls. “Choose from 76 configured sample markets. Sample denominations do not convert currencies or create trades.”|
| 45–60 seconds | Open the provider selector. “Velocity and Pacifica support price scenarios. Jupiter adds inventory with an explicit modeling boundary. Drift stays paused.”|
| 60–77 seconds | Open **Method**, then **My reports** and save on the device. “The inputs, exclusions, and source remain inspectable. A historical copy needs no sign-up.”|
| 77–90 seconds | Show JSON export and the mobile layout. “Carry the explanation with you. Supported browsers can install Buffer, and the public sample calculator works offline.”|

If adding a separate live read, retain its provider, account, timestamp, units, and coverage. Show unavailable or stale results honestly and use the retry path; never replace them with plausible numbers. Public balances should not be memorized into the script.

## Event eligibility

The [official Perps and Prediction Markets page](https://hackathons.solana.com/hackathons/perps-and-prediction-markets), checked September 11, 2026, listed a September 18 launch and September 25 deadline. Detailed eligibility, judging, and submission rules were not available in that inspected page; its rules field was null.

**Perps-only analytics eligibility and permission for pre-event development remain unverified.** Development began before the listed launch. Confirm both against published rules before entering. No event entry, acceptance, prize eligibility, or endorsement is claimed.
