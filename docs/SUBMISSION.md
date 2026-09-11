# Buffer — a clearer view of perpetual exposure

## Submission draft

Buffer answers one practical question: **“What would a market move do to these positions?”**

Paste a public Solana authority, select one Drift subaccount, and inspect its current account snapshot. A shared slider models incremental price P&L on eligible existing SOL, BTC, and ETH linear perpetual positions. Long and short contributions are visible separately, unsupported exposure is clearly excluded, and spot collateral, debt, and open orders stay visible outside the model. A Method drawer explains the assumptions and provenance; a local JSON report preserves the snapshot, exclusions, precise contributions and selected shock.

The Solana integration reads Drift user accounts, market state and oracles through a server-side official SDK provider. It verifies ownership, market identities, quote currencies, oracle validity and baseline coverage. There is no transaction, signing, custody or trading path. The application also ships three clearly labeled deterministic samples that work without configuration.

Built with Next.js, React, TypeScript and decimal arithmetic. An original open-gauge logo and quiet, responsive dashboard keep the emphasis on understanding the position effect.

**Verification disclosure:** Live verification incomplete. No configured mainnet RPC or suitable public Drift test authority was supplied. Demonstrate Sample until an actual successful live read is verified. UI tests with mocked API responses do not constitute live Solana verification.

## Event check — September 11, 2026

The [official Perps and Prediction Markets page](https://hackathons.solana.com/hackathons/perps-and-prediction-markets) states a September 18 launch and September 25 deadline, with a perpetuals and prediction-markets theme. The public page currently provides no detailed eligibility, judging, or submission rules. Its supplied rules field was null when inspected.

No date mismatch was found. **Eligibility of a perps-only analytics application remains an assumption.** Development began before the listed launch; whether pre-event work is allowed also remains unverified. Confirm both when rules are published before entering. This draft makes no claim of acceptance, prize eligibility, endorsement, or a completed mainnet test. No site was published and no entry was submitted.

## 90-second Sample demo

| Time | Action and narration |
| --- | --- |
| 0–15 seconds | Open Buffer with **Long + short** selected. “Perpetual positions can point in different directions. Buffer shows their incremental response to a shared market move. This is labeled Sample data.” Point to the source indicator. |
| 15–35 seconds | Point to subaccount #0 and the two positions. “This example has 100 SOL long and half a BTC short. One selected subaccount supplies one frozen snapshot. Baseline account metrics stay separate.” |
| 35–60 seconds | Select **−10%**. “At fixture prices of 150 and 100,000 USDC, the SOL contribution is −1,500, the BTC short contributes +5,000, and their combined price P&L change is +3,500 USDC.” Move the slider by one keyboard step, then restore −10%. |
| 60–75 seconds | Open **Method**. “Two of two positions are modeled here. Sizes stay fixed. Collateral changes, future fills, funding, fees, interest and liquidation effects are excluded.” Briefly show coverage and provenance. |
| 75–90 seconds | Close Method and **Download report**. “This local report keeps the assumptions and contributions. Buffer’s live provider uses Solana Drift account, market and oracle reads; this demonstration uses fixtures because live verification is incomplete.” Reset to zero. |

Only replace Sample narration with Live after an actual account read is verified. Retain visible source, subaccount, timestamp and coverage disclosures in either mode.
