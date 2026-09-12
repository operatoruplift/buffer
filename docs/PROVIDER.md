# Live protocol providers

**Last updated:** September 12, 2026.

Buffer reads the current **Velocity** deployment by default. The provider is read-only, server-side, and bound to a fixed Solana mainnet program ID. A protocol selector exposes the old Drift deployment as an explicit legacy path; Buffer never combines accounts, prices, or balances from the two programs.

| Protocol | Program | Package | Status | Current quote asset |
| --- | --- | --- | --- | --- |
| Velocity | `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P` | `@velocity-exchange/sdk` **0.23.1** | Default, current deployment | USDT |
| Drift | `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` | `@drift-labs/sdk` **2.161.0-beta.5** | Legacy, paused | Historical account quote identity |

The [official migration guide](https://docs.velocity.exchange/developers/migrate-from-drift) explains why this is a provider migration: Velocity is a new program, its PDAs and account layouts differ, and Drift balances do not carry over. Selecting Drift is useful for a historical read or stale-data demonstration; it is not a route to current Velocity balances.

## Verified Velocity deployment

The pinned SDK decoded public mainnet buffers and the provider checked each account's owner, PDA, index, name, oracle address, and oracle source. The following identities were observed at slot **446228253**:

| Account | Address | Bytes / identity |
| --- | --- | --- |
| State | `2etx5NvPNxeMZ7EfHE6GjJfW2imRYEUANehNS1WB4CVW` | 1752 bytes; State seed `velocity_state` |
| SOL perpetual, index 0 | `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY` | 1560 bytes |
| BTC perpetual, index 1 | `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t` | 1560 bytes |
| ETH perpetual, index 2 | `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg` | 1560 bytes |
| USDT spot, index 0 | `2QpHj5vzgCdWaGM2KSoGtYJWeSkx24cMyzUDHDrucvRc` | 1064 bytes |

The USDT mint is `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`, and the spot oracle source is `pythLazerStableCoin`. The SDK's account coder names for this exact package are lower camel case (`state`, `perpMarket`, `spotMarket`, and `user`); the source code uses those installed names rather than assuming an older IDL.

## Public live example

The **Explore a live account** control uses public authority `DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2`, Velocity subaccount `0`, and User account `DXN7aHSRosnuyv4eTctBwUJ8tJQ97eGeTEox9iVpnSoe`. A bounded read observed +0.05 BTC, +2 ETH, USDT collateral, no open orders, and valid BTC/ETH oracle observations at lag one slot. One read recorded net USD value `2105.213085`, funding-inclusive unrealized P&L `297.289922`, and health `89`.

Those numbers are observations, not fixtures: the page refetches the account and current slots on each use, and balances can change. The baseline labels are USD because the SDK converts quote P&L and net spot value through its validated USDT quote oracle. Scenario contributions retain their verified quote denomination, **USDT**.

## Acquisition flow

1. Validate the canonical base58 authority, explicit unsigned 16-bit subaccount ID, selected protocol, and allowed query parameters.
2. Verify the configured endpoint's full Solana mainnet-beta genesis hash: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`.
3. Resolve only the fixed provider selected by `protocol=velocity` or `protocol=drift`. An omitted protocol resolves to Velocity.
4. Discover user PDAs for the authority, then require the selected account's owner, decoded authority, subaccount ID, and canonical PDA to agree.
5. Collect every required perp, spot, and open-order reference, including zero-base residual perp state and each perp's quote market.
6. Read protocol state, markets, account bytes, and external oracles through a request-owned loader. Reread the selected account before normalization and retain each read slot.
7. Gate baseline metrics on complete final coverage. Missing, changed, inactive, unsupported, or invalid inputs become explicit unavailable values or exclusions rather than partial numbers.

`src/server/providers.ts` resolves the fixed provider. `src/server/velocity.ts` and `src/server/drift.ts` own acquisition and cleanup. `src/server/velocity-normalize.ts` and `src/server/normalize.ts` own coverage and decimal-string values. `src/server/boundary.ts` validates protocol, authority, subaccount, query controls, concurrency, and the per-process read window. The API routes are `/api/accounts`, `/api/snapshot`, and `/api/config`.

## Velocity SDK integration

The current provider uses `VelocityClient`, `PollingVelocityClientAccountSubscriber`, `VELOCITY_PROGRAM_ID`, `getUserAccountsForAuthority`, `createUser`, market/oracle accessors, `fetchAccounts`, and `getUserAccountAndSlot` from the installed package. It verifies that the client, subscriber, and program remain bound to the fixed Velocity ID. `SnapshotAccountLoader` extends `BulkAccountLoader` with manual `getMultipleAccountsInfoAndContext` reads, propagates transport failures, records slots even when bytes are unchanged, and runs with no polling interval. Clients, users, listeners, and loader maps are disposed in `finally`.

Velocity's relaunch layout differs from Drift's. Perp oracle fields are on the market root, the MM and historical oracle data are inside market stats, and `getMMOracleDataForPerpMarket(index, observedSlot)` receives the actual observed slot. Spot margin validity uses the SDK's `getSpotOracleValidity` and `isOracleValidForMarginCalc` helpers with a zero extra staleness buffer; Buffer adds its own 150-slot cap and confidence checks.

## Baseline metrics and scenario boundaries

| Metric | SDK meaning and Buffer handling |
| --- | --- |
| Account net USD value | `getNetUsdValue()`: net spot value, funding-inclusive unrealized perp P&L, and isolated deposits, converted through validated quote valuation. |
| Unrealized perp P&L | `getUnrealizedPNL(true)`: current perp P&L including accrued funding, converted to USD by the quote oracle. |
| Cross-margin health | `getHealth()`, shown from 0 to 100 for cross-margin accounts and withheld when isolated positions make that meaning unsuitable. |

These are current baseline values, never hypothetical scenario results. The scenario uses the frozen external oracle price and computes `signed base size × price × shock`. It models only verified active SOL, BTC, ETH, and HYPE linear perpetuals. It holds sizes fixed and excludes collateral-price changes, future fills, funding, fees, borrowing interest, liquidation effects, LP exposure, and nonlinear contracts. Spot deposits, debts, and open orders remain visible. Separate verified quote totals are never silently added across currencies.

## Oracle and snapshot policy

- Reject missing, nonpositive, insufficient-data, future, or older-than-150-slot external oracle observations.
- Apply the SDK's `isOracleValid` AMM validity helper to eligible perps using the current State and observed slot.
- Apply the SDK spot margin-validity and protocol volatility checks, plus Buffer's 1% confidence cap. The fixed USDT stablecoin oracle is handled according to its decoded source and validated quote identity.
- Validate the SDK MM valuation oracle separately before using baseline methods.
- Expire live snapshots after 120 seconds, or at an earlier provider expiry. A failed refresh retains a visibly stale snapshot and disables a new scenario calculation.

These are conservative application read rules, not liquidation criteria. Account, market, oracle, and current-slot reads are not atomic; user read slot, observed RPC slot, and oracle publication/read slots remain separate in the normalized snapshot and exported report.

## Market coverage

The September 12, 2026 enumeration at observed slot **446394107** verified all **four** markets in Velocity state: SOL-PERP (0), BTC-PERP (1), ETH-PERP (2), and HYPE-PERP (3). State reported four markets and an active exchange. Every decoded market was Active/Perpetual, matched its pinned SDK oracle address/source, and used quote spot index 0 (USDT). SDK **0.23.1** was the latest published version at verification. This is a dated deployment observation, not a promise of future listing counts.

The app no longer has a three-ticker cap. Both providers verify configured identities, active linear contracts, quote currencies, and current usable oracles before modeling a position. The browser uses a small SDK-derived identity registry; it does not bundle the protocol SDKs. SDK-listed legacy Drift contracts are not advertised as current tradable markets, and the paused deployment remains unavailable for live calculations.

The **12 sample scenarios** cover all four asset identities with fixed illustrative prices. The original three USDC fixtures remain reproducible; new individual and basket fixtures use USDT. Sample values do not come from an oracle or imply that the illustrative positions exist on-chain.

See the official [Velocity market discovery guide](https://docs.velocity.exchange/developers/velocity-sdk/markets).

## Legacy Drift behavior

The legacy provider remains available only when selected explicitly. It uses the fixed Drift program and pinned Drift SDK, preserves the original canonical-layout fixtures, and displays a migration notice. Because Drift is paused and its state did not migrate to Velocity, the provider forces affected metrics and price scenarios unavailable rather than presenting frozen Drift oracle values as current. The UI links to the [Velocity migration documentation](https://docs.velocity.exchange/developers/migrate-from-drift).

The earlier production Drift check is retained as historical evidence: authority `7WigdYd1qdbPofUKhzbvtVPYdo8wAUEZMWBZp8MtyAb`, User `9P7Y41yQPacZtcsyKzBBT2FZmQe6RDxn7AQBMxZXoYz7`, +1 SOL-PERP, and 31.732475 USDC debt were decoded at observed slot 446215844. Its external oracle was older than the 150-slot limit, so the affected price and baseline values were withheld. It is not used as the current live example.

## Transport, limits, and deployment

Only server-side `SOLANA_RPC_URL` configures the RPC. The browser cannot supply an endpoint or program override. The endpoint must support `getGenesisHash`, filtered `getProgramAccounts`, `getAccountInfo`, `getMultipleAccounts`, and `getSlot`. Requests abort after 18 seconds; Vercel routes allow 30 seconds of function execution. Each process permits 60 reads per minute and four concurrent reads. Provider URLs and raw exceptions are not returned to the browser, and errors never fall back to samples.

The initial production RPC is Solana's shared mainnet endpoint and has no application-specific capacity guarantee. Use a dedicated endpoint for sustained traffic, and add a shared ingress limit when deploying more than one instance. All wallet-signing methods throw; there is no transaction, custody, trading, or wallet-connection path.

## Tests and references

`tests/provider.test.ts` covers the legacy boundary and normalization behavior. The Velocity compatibility suite covers current State, perp, spot, and oracle layout assumptions from captured public buffers; both fixture sets live under `tests/fixtures/`. Run `npm test`, `npm run typecheck`, and `npm run lint` before changing either provider, then repeat a real mainnet read. A new SDK version number alone is not validation.

- [Velocity migration from Drift](https://docs.velocity.exchange/developers/migrate-from-drift)
- [Velocity SDK setup](https://docs.velocity.exchange/developers/velocity-sdk/setup)
- [Velocity SDK markets](https://docs.velocity.exchange/developers/velocity-sdk/markets)
- [Velocity SDK P&L and risk](https://docs.velocity.exchange/developers/velocity-sdk/pnl-risk)
- [Pinned Velocity SDK package](https://www.npmjs.com/package/@velocity-exchange/sdk/v/0.23.1)
- [Pinned legacy Drift SDK package](https://www.npmjs.com/package/@drift-labs/sdk/v/2.161.0-beta.5)
- [Solana genesis-hash RPC reference](https://solana.com/docs/rpc/http/getgenesishash)

Documentation and master-branch references can change. The installed package, fixed program identities, and captured compatibility fixtures define this release's tested behavior.
