# Jupiter Perps read verification

**Updated:** 2026-09-12

Buffer’s Jupiter Phase 3 adapter is a server-only, read-only inventory reader. It identifies Jupiter Perpetuals accounts and preserves their protocol fields for inspection. Jupiter positions are excluded from Buffer’s existing linear price-shock totals until the current oracle contract, collateral dependencies, and maximum-profit cap are modeled together.

## Canonical contract

- Program: `PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu`.
- JLP Pool: `5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq`.
- Position PDA seeds: `position`, owner wallet, pool, custody, collateral custody, and the one-byte `Side` enum (`1` long, `2` short). The implementation checks the derived PDA against every discovered position account.
- Position discovery uses one bounded `getProgramAccounts` request with the owner at byte offset `8` and the Anchor `Position` discriminator at offset `0`. It deliberately does not pre-filter by account size: the decoder must see a future allocation with the same discriminator and fail closed rather than silently reporting an empty wallet. The verified current allocation is 216 bytes. Closed accounts remain on-chain with `sizeUsd = 0` and are counted then excluded.
- Each wallet is represented as one read-only grouping with account id `0`; Jupiter has no subaccount enumeration in this adapter.

Primary references are the [official Position Account documentation](https://developers.jup.ag/docs/perps/position-account), [Custody Account documentation](https://developers.jup.ag/docs/perps/custody-account), [Pool Account documentation](https://developers.jup.ag/docs/perps/pool-account), and the [official-doc-linked Anchor discovery example](https://raw.githubusercontent.com/julianfssen/jupiter-perps-anchor-idl-parsing/main/src/examples/get-open-positions-for-wallet.ts). The linked repository is an example implementation, not a Jupiter-controlled SDK.

## Decoded values and units

The decoder follows the published Position IDL fields: owner, pool, custody, collateral custody, open/update times, side, entry `price`, `sizeUsd`, `collateralUsd`, realized PnL, cumulative interest snapshot, `lockedAmount`, and bump. USD values are six-decimal atomic integers; for example, `16755624` is `$16.755624`.

`lockedAmount` is kept as both its raw integer and a decimal token amount with the **collateral custody** address and collateral custody decimals. Jupiter documents SOL/wETH/wBTC locked for longs and USDC/USDT locked for shorts, and explicitly says the amount is locked in collateral custody. A real short SOL/USDC fixture demonstrates why position-custody decimals would be wrong: the position custody is SOL (9 decimals), while `lockedAmount = 5354639992` is normalized as `5354.639992` USDC (6 decimals). It is not converted to a USD cap. The adapter does not infer a base quantity from `sizeUsd / currentPrice`, does not equate USD accounting with USDC settlement, and does not claim that entry PnL is the selected price shock.

Custody reads verify the pool, mint, token account, token decimals, stable flag, oracle account, oracle type, oracle buffer, and `maxPriceAgeSec`. Pool membership is read from the live Pool account, so the six-custody pool currently includes the JupUSD address even though the older Position Account table describes only USDC/USDT short collateral. That documentation difference is retained as an explicit compatibility boundary.

The adapter intentionally leaves `currentPriceUsd` and its read slot null. It records the custody oracle identity and confirmed custody read slot, but does not decode a live Pyth/Doves oracle account. Pool, custody, and position reads are separate and are not an atomic same-slot snapshot.

## Captured mainnet evidence

`tests/fixtures/jupiter-mainnet/accounts.json` contains read-only confirmed responses captured from `https://api.mainnet-beta.solana.com` on 2026-09-12, including the Pool account, SOL/USDC/JupUSD Custody accounts, a live SOL/SOL Position account, and a closed Position account. `custodies.json` adds the ETH, BTC, and USDT custodial bytes listed by that Pool. `short-position.json` contains a separate confirmed live short SOL/USDC Position account. The captured active long position has:

| Field | Value |
| --- | --- |
| Position account | `11PjsYs6sXX5wpw1CkBegKao6ccNJTztcYXC5NgCncN` |
| Owner | `AhUvhrHHZXh7Huu8AtCfEkTvgUdTw4ZwL1j1c6Fu5dfq` |
| Direction | Long |
| Entry price | `143.486464` USD |
| Size | `16.755624` USD |
| Collateral | `15.224968` USD |
| Locked amount | `0.116774944` SOL (`116774944` raw units) |
| Read slot | `446436963` at capture |

The captured short fixture is `13pmELWTxfCxLnKSSeNUH1eevMQVHTZr8vqDEiSDBT5`, owned by `8vXZp5DRsAKGv6QwfqKjZ2MQgMT6arfYYpoCqAN2b9aw`, with SOL position custody, USDC collateral custody, short direction, `sizeUsd = 5353.838028`, and `lockedAmount = 5354.639992` USDC. Its confirmed read slot is recorded in the fixture.

The fixture tests verify discriminator, account size, IDL offsets, PDA derivation, owner/pool identity, custody sources, six-decimal conversion, native locked-token units, closed-account handling, malformed bytes, bounded account counts, missing configuration, wrong network, and sanitized RPC failures. Fixtures are regression evidence only; they do not make a deployment live.

## Modeling boundary

The inventory row carries direction, USD atomic values, entry price, collateral, locked amount, custody identities, oracle metadata, timestamps, and confirmed read slots. It is marked `modeled: false` and carries an explicit inventory-only reason. Current scenario totals therefore remain unchanged.

Faithful payoff support requires a verified current oracle observation and freshness rule, custody-specific token decimals/prices, the `lockedAmount` maximum-profit cap, and the protocol’s applicable borrow/funding/fee/collateral rules. Until those dependencies are proven from the current on-chain contract, Jupiter must remain inventory-only or be excluded with its reason shown to the user.
