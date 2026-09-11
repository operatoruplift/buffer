# Drift provider

**Last updated:** September 12, 2026.

Buffer uses the official `@drift-labs/sdk` **2.161.0-beta.5**, with Anchor **0.29**, web3.js **1.98.0**, and spl-token **0.4.13**. Local Node is **24.16.0**; hosting uses Node **24.x**. The installed source and typings are authoritative for this pinned implementation.

## Mainnet evidence and SDK compatibility

The deployed `/api/accounts` and `/api/snapshot` endpoints both returned **HTTP 200** for public authority `7WigdYd1qdbPofUKhzbvtVPYdo8wAUEZMWBZp8MtyAb`. Discovery returned **Main Account**, subaccount `0`, with User account `9P7Y41yQPacZtcsyKzBBT2FZmQe6RDxn7AQBMxZXoYz7`. The snapshot retrieved at **2026-09-11T17:39:43.278Z** decoded **+1 SOL-PERP**, **31.732475 USDC debt**, and **0.855627563 SOL collateral**. Account read slot was **446215843** and observed RPC slot was **446215844**. The external oracle publication slot was **410366404**, outside Buffer's freshness limit; price, affected scenario values, and baseline metrics were correctly withheld.

An earlier local SDK read of the same authority/subaccount also succeeded at account/observed slot **446213278**. The deployed check independently verifies the hosted provider and its server dependencies.

This verifies actual mainnet acquisition, decoding, identity checks, and stale-data handling. It does not verify a fresh-oracle live scenario or imply that the account remains unchanged. The public account was read only; no owner credentials or transaction permissions were used.

Seven raw public State, SpotMarket, and PerpMarket buffers captured at observed slot **446212035** are preserved in [the decoder fixtures](../tests/fixtures/drift-mainnet/README.md). One compatibility test decodes all seven. They are layout fixtures, not live price evidence. The selected SDK also decoded the actual User account during the live check.

SDK `2.163.0-beta.13` was unsuitable for canonical Drift: its bundled Velocity IDL could not decode the 776-byte SpotMarket layout. The application therefore pins `2.161.0-beta.5`. Future upgrades must pass the binary-layout fixtures and repeat an actual mainnet read; a newer version number alone is not sufficient validation.

## Acquisition flow

1. Validate the canonical authority, explicit unsigned 16-bit subaccount ID, and allowed query parameters.
2. Verify the configured endpoint's full mainnet-beta genesis hash: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`.
3. Derive the canonical Drift User PDA and verify account owner, decoded authority, and subaccount ID.
4. Collect all active perp, spot, and order references, including zero-base residual perp state. Load each perp's quote-market reference.
5. Read protocol state, required markets, and oracles through a request-owned manual loader, then reread the selected account.
6. Gate baseline metrics on complete final coverage and normalize values into decimal strings. New or changed market references cause unavailable metrics instead of partially valued baselines.

`src/server/drift.ts` owns acquisition and cleanup; `src/server/normalize.ts` owns coverage and values; `src/server/boundary.ts` owns request validation and limits. Node API routes are `/api/accounts`, `/api/snapshot`, and `/api/config`.

The integration uses `getUserAccountsForAuthority`, `createUser`, market/oracle accessors, `fetchAccounts`, and `getUserAccountAndSlot` from the installed SDK. `SnapshotAccountLoader` extends `BulkAccountLoader` with manual `getMultipleAccountsInfoAndContext` reads. It propagates transport errors, verifies program ownership, and updates read slots even when bytes are unchanged. Polling frequency is zero; there is no recurring timer or persistent websocket. Clients, users, listeners, and loader maps are disposed in `finally`.

## Baseline metrics

| Metric | SDK meaning and Buffer handling |
| --- | --- |
| Account net USD value | `getNetUsdValue()`: net spot USD value, unrealized perp P&L including accrued funding, and isolated-position deposits. |
| Unrealized perp P&L | `getUnrealizedPNL(true)`: current perp P&L including accrued funding, converted through the quote spot oracle into USD. |
| Health | `getHealth()`: maintenance cross-margin health from 0 to 100. Withheld when isolated positions exist. |

These are current baseline values, never hypothetical scenario results. Returned quote amounts normalize with `QUOTE_PRECISION`. LP exposure, nondefault pools, unknown/nonlinear/inactive markets, missing quote identity, missing required state, and invalid valuation oracles withhold baseline metrics. Spot amounts use `getTokenAmount` and market decimals. Isolated quote collateral receives its own labeled inventory row, including residual state with zero base size.

## Scenario identity and precision

SOL, BTC, and ETH eligibility comes from pinned `MainnetPerpMarkets` plus decoded market index/PDA/name, oracle public key, and oracle source. Quote identity follows `quoteSpotMarketIndex` and matches the pinned spot name and mint. Supported current ordinary markets can contribute to baseline coverage while remaining excluded from the restricted scenario.

Raw sizes and prices normalize through exported `BASE_PRECISION` and `PRICE_PRECISION`. BN integers are converted directly to decimal strings, never first to floating-point numbers. The decimal calculation retains sufficient precision for multiplication; display formatting alone rounds values. Different verified quote currencies are never added into an unlabeled mixed total.

## Oracle and snapshot policy

- Reject missing, nonpositive, insufficient-data, future, or older-than-150-slot external oracle observations.
- Apply the SDK's `isOracleValid` AMM validity helper to perps as a conservative read check.
- Apply protocol margin staleness and volatility checks to spot valuation, plus Buffer's 1% confidence cap. The fixed `quoteAsset` oracle explicitly uses slot zero and is exempt from lag checks.
- Validate the SDK's MM valuation oracle separately before using baseline methods.
- Expire live snapshots 120 seconds after retrieval, or at an earlier explicit expiry. A stale or failed-refresh snapshot cannot produce a new scenario total.

These are application read/freshness rules, not liquidation criteria. Separate account, market, and oracle reads are not an atomic same-slot snapshot. User read slot, observed RPC slot, and oracle publication/read slots remain separate in the normalized data and exported report.

## Transport and deployment

Only server-side `SOLANA_RPC_URL` configures the RPC. The browser cannot supply an endpoint or program override. Discovery needs filtered `getProgramAccounts`; other methods are listed in [deployment documentation](DEPLOYMENT.md).

Requests abort after 18 seconds; RPC routes allow 30 seconds of function execution. Each process permits 60 reads/minute and four concurrent reads. No wallet-address cache is retained. Provider URLs and raw exceptions are not returned to the browser. Errors are structured and never cause a fallback to sample data. All wallet signing methods throw; there is no transaction path.

The deployed initial RPC is Solana's shared mainnet endpoint, which does not provide application-specific capacity. The deployed account and snapshot endpoints have passed actual mainnet reads. A dedicated endpoint is the remaining capacity improvement before sustained traffic. Process-local limits also need a shared hosting/ingress limit when scaled across instances.

## Tests and references

`tests/provider.test.ts` covers address/u16 boundaries, unsupported query controls, missing accounts, ownership and subaccount mismatch, redacted failures, coverage, collateral/debt/orders, zero-base and isolated cases, oracle validity, market identity, BN normalization, loader propagation/cleanup/read slots, and the seven canonical account buffers. See [verification](VERIFICATION.md) for executed results.

- [Pinned SDK package](https://www.npmjs.com/package/@drift-labs/sdk/v/2.161.0-beta.5)
- [Official Drift client source](https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/driftClient.ts)
- [Official User metric source](https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/user.ts)
- [Official account-loader source](https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/accounts/bulkAccountLoader.ts)
- [Official oracle helpers](https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/math/oracles.ts)
- [Official precision constants](https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/constants/numericConstants.ts)
- [Solana genesis-hash RPC reference](https://solana.com/docs/rpc/http/getgenesishash)

Master-branch references can change. They explain the integration, while the installed pinned package and captured compatibility fixtures define this release's tested behavior.
