# Buffer Technical

Synthetic narration: macOS Samantha. Recorded September 13, 2026. Actual redesigned UI, deterministic sample data and provider selection; no live balances or email success are staged.

## 00:00:00 — An inspectable read path.

Buffer separates the React interface, normalized snapshots, and decimal scenario engine. Fixed server endpoints handle public provider reads; wallet keys and transaction signatures are never requested.

## 00:00:13 — Separate providers. Explicit limits.

Velocity validates mainnet accounts, markets, and oracle identity. Pacifica checks its public API's market identities and price timestamps. Jupiter validates position PDAs, ownership, pool, and collateral custody, but remains inventory-only. Its current prices and capped payoff are not modeled. Legacy Drift remains paused.

## 00:00:35 — Signed quantity × price × move.

For eligible linear positions, incremental price effect equals signed quantity, times frozen price, times the shock. Quote currencies stay separate: Velocity uses verified USDT; Pacifica price effects use USD. Sample denominations are illustrative.

## 00:00:53 — The four-market app sample: +1,000 USDC.

At minus ten percent, the four-market app sample totals positive one thousand USDC. The landing page's two-position sample totals positive three thousand five hundred. Both use fixed fixtures.

## 00:01:06 — Freshness is a boundary.

Live snapshots expire within one hundred twenty seconds, sometimes sooner. Bounded reads, explicit errors, and request guards prevent stale calculations and late-account replacement.

## 00:01:18 — Private reports are optional.

JSON reports preserve exact inputs and exclusions. Device reports stay separate from optional owner-protected cloud storage. Signup and recovery email remain gated. Private data bypasses the offline cache.

## 00:01:32 — Verify the behavior. Keep the boundaries.

Automated tests cover arithmetic, providers, storage, and real SDK behavior with mocked transport. Point-in-time mainnet reads are separate evidence; email delivery and native store packages are not claimed.
