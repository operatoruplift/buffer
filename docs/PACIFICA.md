# Pacifica public account integration

Buffer reads Pacifica’s public mainnet HTTPS API at the fixed origin `https://api.pacifica.fi/api/v1`. It uses only GET requests; it requires no API key, Solana RPC configuration, signature, or transaction. A supplied canonical Solana wallet address selects one wallet account. Pacifica’s signed subaccount-list endpoint is outside this integration.

## Coverage and identity

On September 12, 2026, the official `/info` endpoint returned 77 instruments: **76 perpetual markets and one SOL-USDC spot market**. Buffer pins all 76 perpetual symbol/base-asset pairs in its shared market registry. Before modeling a position, the provider checks that its exact, case-sensitive symbol matches a pinned entry and current metadata still reports the same base asset and `instrument_type: perpetual`. Spot instruments and unknown or changed identities are excluded. Buffer’s numeric indices are stable internal identifiers; Pacifica does not expose these as numeric market IDs. Future additions must append new identifiers without reassigning existing ones.

The [contract specifications](https://docs.pacifica.fi/trading-on-pacifica/contract-specifications) describe linear contracts without an expiry. The [position API](https://docs.pacifica.fi/api-documentation/api/rest-api/account/get-positions) reports positive base-unit amounts and `bid` for long or `ask` for short. Buffer applies that sign directly. Scaled symbols such as `kBONK`, `kPEPE`, and `kSHIB` retain their market units: amounts are not multiplied or divided by 1,000.

The [price API](https://docs.pacifica.fi/api-documentation/api/rest-api/markets/get-prices) reports an `oracle` price in USD. Scenario contributions therefore use **USD** and remain separate from Velocity’s USDT and the USDC fixture scenarios. Pacifica uses USDC margin; this does not establish a conversion rate or a peg guarantee. Collateral prices, funding, fees, interest, future fills, and liquidation effects remain outside the scenario.

## Reads and provenance

The provider requests `/account`, `/positions`, `/info`, `/info/prices`, and `/account/loan`. Account existence is established through the documented public account response: a successful empty positions array alone does not establish that an account exists. A precise account-not-found response produces no discovered account; other HTTP or application failures remain errors.

Account equity, balance, and margin in use are shown as API-reported USD baseline metrics. Buffer does not reconstruct equity, derive health, or expose liquidation estimates. Spot balances, isolated margin, loan principal, accrued interest, and aggregate open/stop-order counts provide context outside the scenario. Order counts are explicitly account-wide; the provider does not claim a per-market order breakdown. Loan and cash rows may overlap and must not be summed.

These are separate, non-atomic API reads. Buffer checks that the account’s open-position count matches the returned position array and asks for a refresh if the count changed between reads. The API does not provide independently verified Solana slots, oracle confidence intervals, or individual oracle publication times. All slot fields remain null. Price timestamps identify the API price response. Markets referencing stocks, commodities, or foreign exchange can have a different underlying cash-market schedule; no continuously open underlying market is implied.

## Freshness and failure handling

- Price and account/loan timestamps must be under 120 seconds old and no more than 10 seconds ahead of server retrieval. A position’s `updated_at` is its last position change, not a price freshness signal.
- Snapshot expiry is the earliest of request start, account/loan timestamps, and modeled price timestamps, plus 120 seconds. Re-fetching an old price cannot grant it another full 120 seconds.
- Missing, nonpositive, malformed, stale, or implausibly future oracle values are excluded with a reason. Bad direction, negative/zero/invalid amounts, duplicate identities, inconsistent counts, or incomplete account inventory fail the read.
- The entire request has an 18-second deadline. Each response is bounded to 1 MiB, whether or not it declares a length; all relevant arrays and numeric strings have independent limits. Redirects are rejected. The address is the only query input; custom endpoints and credentials are never accepted.
- Responses are not cached, failures are sanitized, and live-read failures never become sample data.

## Verification evidence

The public fixture in `tests/fixtures/pacifica-public` was captured on September 12, 2026, from an account visible on Pacifica’s public leaderboard. It contains 22 positions across cryptocurrencies, commodities, metals, equities, indexes, and foreign exchange, with account-wide open-order counts. These are recorded test data, not permanent claims about that account’s current holdings.

The test suite covers the captured account, every pinned market, API-order independence, scaled-symbol long/short math, USD quote separation, excluded spot and unknown markets, invalid payloads, stale/future clocks, expiry without freshness extension, inventory accounting, missing-account versus upstream-error behavior, fixed public GET requests, response-size limits, malformed responses, and request aborts.

Official references: [market metadata](https://docs.pacifica.fi/api-documentation/api/rest-api/markets/get-market-info), [account information](https://docs.pacifica.fi/api-documentation/api/rest-api/account/get-account-info), [market specifications](https://docs.pacifica.fi/trading-on-pacifica/contract-specifications/market-specifications).
