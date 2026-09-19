# Current risk context and model limits

Source inspection: September 19, 2026. This note describes the checked-in adapter and installed `@velocity-exchange/sdk` **0.23.1**, not a new live-provider observation or production deployment. SDK source references below resolve under `node_modules/@velocity-exchange/sdk/lib/node/` after installing the lockfile.

## What Buffer calculates

The scenario engine (`src/lib/scenario.ts`) calculates the incremental fixed-size linear price effect: signed base quantity × frozen oracle price × selected shock. It groups contributions by their verified quote currency and retains exclusions. It does not calculate future account equity, future margin health, liquidation distance, or a liquidation price.

Velocity's separate current risk card (`src/server/velocity-normalize.ts`) uses this contract:

| Display | Installed SDK call / normalization | Meaning |
| --- | --- | --- |
| Maintenance collateral | `getTotalCollateral('Maintenance')` | Current cross-margin weighted collateral and P&L, with default open-order handling; not wallet balance or withdrawable equity. |
| Maintenance requirement | `getMaintenanceMarginRequirement()` | Current unbuffered maintenance requirement; default open-order worst-case impact remains included. |
| Maintenance headroom | collateral minus requirement | Exact decimal difference in SDK USD valuation units; negative means a maintenance deficit. No clamping to zero. |
| Current comparison | `getLiquidationStatuses().get('cross').canBeLiquidated` | The installed SDK's comparison result, retained separately from the account status flag. Missing status is `null` / unavailable. |
| Liquidation flag | `isCrossMarginBeingLiquidated()` | True for either account-level `BEING_LIQUIDATED` or `BANKRUPT`. It can remain set after a comparison recovers. |
| Cross-margin health | `getHealth()` | Integer score clamped to 0–100 and rounded by the SDK. It is not an exact financial amount or a safety guarantee. |

Financial BN values stay integers until division by the pinned precision into decimal strings. Buffer's 80-digit local Decimal context preserves all relevant integer precision; display rounding never modifies report values. Velocity's scenario settlement quote is **USDT**, while the SDK values collateral through quote/spot oracles in **USD**. A quote label is never currency conversion.

Current context requires all baseline coverage checks to pass. Missing state/markets, stale or invalid valuation oracles, unsupported account pools/contracts, or SDK errors produce unavailable values with an explanation. Any active isolated position withholds the general cross-scope risk card, including isolated market index `0`; Buffer does not add independent collateral accounts together. A missing SDK implementation cannot become zero collateral or a healthy flag.

The snapshot is bounded to 120 seconds, with earlier provider expiry respected by scenario/monitoring gates. Oracle lag is bounded in **slots**, not translated to elapsed seconds. Reads are separate confirmed observations, not an atomic same-slot portfolio. On an account/provider switch, prior live values remain visibly stale with their original authority, account and time until a verified replacement arrives; scenario output, exports and monitoring remain unavailable.

## Pinned SDK caveats

- `user.js` `getLiquidationStatuses` constructs a calculation with the scope buffer map, but its final cross comparison reads `totalCollateral` and `marginRequirement`. `marginCalculation.js` stores `totalCollateralBuffer` and `marginRequirementPlusBuffer` separately. Therefore Buffer does **not** claim this return value establishes the full buffered on-chain liquidation boundary. A characterization regression demonstrates a margin calculation whose plain comparison passes while the explicit buffered comparison fails.
- `user.js` `getHealth` returns 100 for zero requirement with nonnegative collateral; nonpositive collateral otherwise yields 0. Positive-value calculation uses BN `toNumber()` and integer rounding, so sufficiently large amounts can throw rather than produce a safe score. Buffer catches that case and retains the other precise metrics. Its isolated flag checks also use truthiness for `perpMarketIndex`, which treats market index zero differently; Buffer calls only the cross-scope method and suppresses general health for isolated scopes.
- `getTotalCollateral` defaults to **Initial** margin when no category is supplied. Buffer explicitly supplies **Maintenance**. Buffer does not use the optional buffered-collateral overload, whose return field requires separate semantic review before adoption.
- `getMaintenanceMarginRequirement` and health are distinct from initial margin, the account flag, oracle guards, and hypothetical scenario P&L. Equality meets the SDK's plain maintenance comparison; the UI says “Meets maintenance,” not “Above maintenance.”

These limits are verified against installed source and deterministic characterization, not an assertion that the SDK matches every deployed program condition.

## Why liquidation estimates stay unavailable

The installed SDK's `liquidationPrice` is explicitly a **linear extrapolation** from current free collateral and price sensitivity. It optionally includes shared spot-oracle sensitivity, defaults `includeOpenOrders` to false, and has a separate isolated path. It returns `BN(-1)` for no isolated calculation, zero sensitivity, or a negative computed price; that sentinel is not a price. Its free-collateral clamp, order handling, settlement state, confidence rules and collateral/oracle coupling require a narrow, separately versioned model before any estimate can be exposed.

Buffer does not call this function or show a derived liquidation price/distance. Funding already accrued may enter SDK baseline P&L; future funding needs explicit time/rate assumptions and remains excluded. Jupiter remains inventory-only because current collateral-dependent capped payoff, oracle observations and fee/funding effects are not verified. Neither a spot quote nor a generic signed-size formula fills that gap.

## Source capability matrix

| Source | Scenario | Current baseline / risk | Scope and explicit limit |
| --- | --- | --- | --- |
| Presets / editable catalog | Deterministic linear price effect | Fixture context | Local input only, no provider observation. Landing two-position −10% total is +3,500 USDC; four-market app default is +1,000 USDC. |
| Velocity, SDK 0.23.1 | Verified active linear perps, USDT | SDK baseline USD, cross maintenance context above | Fixed canonical mainnet program/account/market/oracle identities; explicit subaccount; no exact liquidation estimate. |
| Pacifica public REST | Pinned perpetual identities, USD | Provider-reported equity/balance/margin in USD | Wallet account only; timestamp freshness; no independent Solana slot or confidence claim; no maintenance estimate. |
| Jupiter Perps | Unavailable | Canonical inventory only | Position/PDA/pool/custody checks; raw collateral-token locked amounts preserved; no linear conversion of USD position size. |
| Legacy Drift | Paused | Compatibility read path | Separate deployment, never reused as Velocity or merged with current collateral. |
| Device/cloud reports | Dated JSON record | Optional additive `riskContext` | Version 1 remains historical; no background recalculation. Cloud owner isolation is separate from public wallet authority. |

Relevant deterministic verification: `tests/velocity.test.ts`, `tests/scenario.test.ts`, `tests/live-response.test.ts`, `tests/device-reports.test.ts`, provider fixtures, and `e2e/dashboard.spec.ts`. Production-provider and credential-dependent outcomes must be recorded separately from these synthetic tests.
