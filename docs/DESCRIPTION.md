# Buffer

## Short description

Buffer makes perpetual positions easier to understand with read-only price scenarios, clear coverage, and transparent calculations—on any screen.

## Full description

**A little more perspective on your perpetual positions.**

Buffer is a read-only scenario explorer for people who want to understand how a price move could affect their perpetual positions. Start with an illustrative sample, or look up a public Drift account on Solana. Choose a price move and follow its effect through each supported position.

The result comes with its explanation: what was included, what was excluded, which prices were used, and what the calculation leaves out.

### Explore the what-if

- **One simple control.** Apply a whole-number price move from −20% to +20% to eligible SOL, BTC, and ETH linear perpetuals.
- **Long and short contributions.** See each position’s incremental price P&L and totals grouped by verified quote currency.
- **Coverage in context.** Review included and excluded positions, collateral, debt, and open orders. Unsupported exposure has a visible explanation.
- **Transparent method.** Inspect assumptions, source information, oracle observations, and snapshot freshness in the Method panel.
- **Portable reports.** Download a JSON report containing the snapshot, exact scenario values, coverage, and assumptions.
- **Useful without an account.** Explore deterministic samples without signing in or connecting a wallet. Optional accounts let you save scenarios.
- **A workspace that travels.** Use the responsive web app on mobile, tablet, and desktop, with installation through supported PWA browsers.

### Simple math, carefully scoped

For each eligible position:

```text
Price P&L change = signed base quantity × frozen baseline oracle price × shock fraction
```

For example, the fixed long-and-short sample contains 100 SOL at $150 and a 0.5 BTC short at $100,000. A −10% price move produces a −1,500 USDC SOL contribution and a +5,000 USDC BTC contribution: a modeled total change of **+3,500 USDC**.

These are sample values, not live market observations. The calculation is a perpetual price effect. It does not forecast account equity, margin health, or liquidation risk. Collateral-price changes, funding, fees, future fills, borrowing interest, and liquidation effects are outside the model.

### Read-only by design

Buffer does not require a seed phrase, private key, wallet connection, or trading approval. Live lookups read public account data through a configured Solana RPC provider. Optional sign-in and scenario storage do not grant authority over a wallet.

Live availability depends on the deployment’s provider configuration and RPC service. Live calculations expire after at most two minutes and require a refresh; sample accounts remain clearly labeled as fixtures. Internet access is needed for live reads and account synchronization.

### Built to be understood

Buffer pairs a calm, responsive interface with a precise decimal calculation engine. Its Next.js and TypeScript application separates protocol reads, normalized snapshots, scenario calculations, and presentation. Supabase supports optional authentication and saved scenarios, while the core sample experience works independently.

**Explore a sample. Change the move. Follow the math.**

[View the source on GitHub](https://github.com/operatoruplift/buffer)

---

Buffer provides scenario exploration, not trading recommendations or a liquidation forecast. Browser installation is a PWA feature, not a claim of a separately published native iOS, Android, Windows, or macOS binary.
