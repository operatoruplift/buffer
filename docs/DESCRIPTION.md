# Buffer

## Short description

Buffer makes perpetual positions easier to understand with read-only price scenarios, clear coverage, and transparent calculations on Solana—on any screen.

## Full description

**A little more perspective on your perpetual positions.**

Buffer is a read-only scenario explorer for people who want to understand how a price move could affect perpetual positions. Start with an illustrative sample, use a public live example, or look up a **Pacifica or Velocity** account with a Solana wallet address. Explore 76 configured Pacifica perpetual markets and all four current Velocity markets. Choose a price move and follow its effect through each supported position. An explicit selector keeps legacy, paused Drift reads separate when historical inspection is useful.

The result comes with its explanation: what was included, what was excluded, which oracle prices and quote identity were used, and what the calculation leaves out.

### Explore the what-if

- **One simple control.** Apply a whole-number price move from −20% to +20% to eligible linear perpetuals across crypto, equities, commodities, FX, and indexes. Search the market list for each provider.
- **Long and short contributions.** See each position’s incremental price P&L and totals grouped by quote currency. Velocity uses verified USDT settlement; Pacifica's API price effects are labeled USD, separate from USDC margin balances.
- **Coverage in context.** Review included and excluded positions, collateral, debt, open orders, oracle validity, and read slots. Unsupported exposure has a visible explanation.
- **Transparent method.** Inspect assumptions, fixed program or API identity, source information, oracle observations, and snapshot freshness in the Method panel. Pacifica uses API timestamps; Velocity exposes Solana read slots.
- **Portable reports.** Download a JSON report containing the snapshot, exact scenario values, coverage, protocol metadata, and assumptions.
- **Useful without an account.** Explore deterministic samples, read public accounts, and save historical reports on this device without signing in or connecting a wallet. Optional cloud accounts keep a separate private library.
- **A workspace that travels.** Use the responsive web app on mobile, tablet, and desktop, with installation through supported PWA browsers.

### Simple math, carefully scoped

For each eligible position:

```text
Price P&L change = signed base quantity × frozen baseline oracle price × shock fraction
```

The fixed long-and-short sample contains 100 SOL at $150 and a 0.5 BTC short at $100,000. A −10% price move produces a −1,500 USDC SOL contribution and a +5,000 USDC BTC contribution: a modeled total change of **+3,500 USDC**. Live Velocity reports keep their verified USDT denomination instead of reusing the sample's USDC label.

Sample values are fixtures, not live market observations. The calculation is a perpetual price effect. It does not forecast account equity, margin health, or liquidation risk. Collateral-price changes, funding, fees, future fills, borrowing interest, and liquidation effects are outside the model.

### Read-only by design

Buffer does not require a seed phrase, private key, wallet connection, or trading approval. Live lookups read Pacifica's public API or use a configured server-side Solana RPC with the pinned official Velocity SDK. Pacifica requires no API key. Optional sign-in and scenario storage do not grant authority over a wallet.

Live availability depends on the deployment's provider configuration and RPC service. Live calculations expire after at most two minutes and require a refresh; live account balances and oracle prices can change between reads. Legacy Drift is labeled paused and its balances are not treated as migrated Velocity state. Internet access is needed for live reads and account synchronization.

### Built to be understood

Buffer pairs a calm, responsive interface with a precise decimal calculation engine. Its Next.js and TypeScript application separates protocol reads, normalized snapshots, scenario calculations, and presentation. Supabase supports optional authentication and saved cloud scenarios, while device-local reports and the core sample experience work independently. Public signup and recovery email actions stay disabled until production SMTP, Auth redirects, and server-side password policy are configured and verified.

**Explore a sample. Open a live account. Change the move. Follow the math.**

[View the source on GitHub](https://github.com/operatoruplift/buffer)

---

Buffer provides scenario exploration, not trading recommendations or a liquidation forecast. Browser installation is a PWA feature, not a claim of a separately published native iOS, Android, Windows, or macOS binary.
