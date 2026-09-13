# Provider coverage

Verified locally on September 12, 2026. This describes the current implementation; it does not claim that these changes have been deployed.

| Source | Current state | Data and limits | Verification |
| --- | --- | --- | --- |
| Samples | **Modeled** | Twelve original fixtures plus the editable 76-market catalog. Landing long/short preview: +3,500 USDC at −10%; app four-market default: +1,000 USDC. Quotes remain separate. | Exact arithmetic, exclusions, registry validation, editing, reports, and offline tests. |
| Velocity | **Modeled, default live provider** | Fixed mainnet program and SDK; canonical accounts/markets/oracles. Fixed-size linear price effects only. Up to 120-second snapshot lifetime. | Fresh local API read returned 2 eligible positions, HTTP 200, observed slots and no-store. |
| Pacifica | **Modeled** | Fixed public API, exact market identity and USD accounting. Provider price timestamps; no asserted chain observation slot. Earlier price expiry can shorten the 120-second limit. | Fresh local API read returned 22 eligible positions, HTTP 200, timestamp-derived expiry and no-store. |
| Drift legacy | **Scenario disabled / paused** | Read boundary retained for legacy deployment. Existing paused-provider restrictions remain authoritative. | Canonical SDK/normalization regression tests; no new live success claim. |
| Jupiter Perps | **Live inventory only** | Canonical position/PDA/custody reads for SOL, ETH, BTC. USD size, entry price, recorded collateral, reserved collateral tokens, source accounts and read slots. Current prices and capped payoff remain unmodeled. | Fresh local API read returned 1 inventory position, HTTP 200 and no-store. Separate confirmed long and SOL/USDC short accounts verified from mainnet bytes. |
| Optional cloud accounts | **Configured; live authentication/email paths unverified** | Existing owner-only Supabase report policies preserved. Signup/recovery remain gated by email readiness. Explicit guest/device storage stays separate. | Read-only schema/RLS audit, default mocked real-SDK flows and isolated email-enabled mock flows. No production users or report records were created. |

Live API verification at approximately **2026-09-12 15:42 UTC** is recorded in `screenshots/redesign/live-read-verification.json`. Those are point-in-time reads, not a promise that example accounts will retain the same positions.

## Jupiter semantics

Jupiter rows cannot enter the linear calculation, even if a malformed payload mistakenly marks one modeled. `size` is an internal zero placeholder; the Jupiter UI shows explicit **USD position size**, direction, and **entry price**, never that placeholder as a base quantity. Current oracle price remains null. No USD-to-USDC conversion or `sizeUsd / currentPrice` inference occurs.

`lockedAmount` uses **collateral custody** units: the captured SOL/USDC short holds `5354639992` atomic units, displayed as `5354.639992` USDC. This is the reserved token amount, not an implemented USD payoff cap. Position, pool, and custody slots are recorded separately; no wallet account read slot is fabricated.

The live pool includes six custodies, including JupUSD. The older official position table lists nine long/short combinations; Buffer does not turn that older table into a claim of current venue-wide market coverage. Unknown token identities, changed position layouts, invalid PDAs, and unverifiable units fail closed. Full evidence and the remaining price/payoff requirements are in [JUPITER-VERIFICATION.md](JUPITER-VERIFICATION.md).

## Transport and privacy

RPC adapters share an 18-second total request deadline and an 8 MiB decoded response limit; SDK rate-limit retries are disabled. Pacifica retains its 18-second/1 MiB fixed-origin REST boundary. Requests reject redirects and use no-store. The existing 60 reads/minute and four-concurrent-read protections are **per process**, not distributed quotas. Provider failures are never replaced by sample data or interpreted as zero holdings.

Private auth/session/report/API responses remain outside the service-worker cache. Public-address lookup does not connect a wallet, sign a transaction, or grant trading permission.
