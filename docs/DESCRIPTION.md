# Buffer

## Short description

Buffer makes Solana perpetual positions easier to understand with read-only price scenarios, transparent coverage, editable samples, and dated reports on any screen.

## Full description

**A little more perspective on your perpetual positions.**

Buffer is a read-only scenario explorer for people who want to understand how a price move could affect perpetual positions. Start with one of 12 preserved deterministic fixtures or the editable four-market portfolio, use a public example, or look up a **Velocity or Pacifica** account with a Solana wallet address. Velocity is the default live provider. Explore 76 configured Pacifica perpetual markets and all four configured Velocity markets, then follow a price move through each supported position. **Jupiter Perps** adds a separate inventory-only reader with explicit modeling limits. Legacy Drift remains clearly paused.

The result comes with its explanation: what was included, what was excluded, which oracle prices and quote identity were used, and what the calculation leaves out.

### Explore the what-if

- **One simple control.** Apply a whole-number price move from −20% to +20% to eligible linear perpetuals across crypto, equities, commodities, FX, and indexes. Search the market list for each provider.
- **Long and short contributions.** See each position’s incremental price P&L and totals grouped by quote currency. Velocity uses verified USDT settlement; Pacifica's API price effects are labeled USD, separate from USDC margin balances.
- **Coverage in context.** Review included and excluded positions, collateral, debt, open orders, oracle validity, and read slots. Unsupported exposure has a visible explanation.
- **Jupiter position inventory.** Inspect canonical SOL, ETH, and BTC positions, including direction, USD size, entry price, recorded collateral, reserved collateral-token amounts, and source accounts. Jupiter's current prices and capped payoff are not modeled, so these rows remain outside scenario totals.
- **A portfolio you can shape.** The sample-only builder starts with 100 SOL long at 150, 0.5 BTC short at 100,000, 8 ETH long at 2,500, and 2,500 XRP long at 2. Add from a searchable catalog of all 76 configured sample perps, choose long or short, edit quantity and baseline price, or remove a position. USDC, USDT, and USD are illustrative sample denominations; switching the label keeps numeric inputs unchanged and performs no FX conversion. Custom edits survive a sample refresh.
- **Transparent method.** Inspect assumptions, fixed program or API identity, source information, oracle observations, and snapshot freshness in the Method panel. Pacifica uses API timestamps; Velocity exposes Solana read slots.
- **Current risk context.** When a fresh Velocity read includes complete cross-margin observations, Buffer shows maintenance collateral, maintenance requirement, exact headroom, and the provider's current status separately from price-effect math. It does not invent a liquidation price.
- **A reviewable threshold monitor.** Configure a device-local headroom rule, check a fresh Velocity observation or explicitly run a labeled fixture, and inspect its mock-delivery state. A separate local SQLite worker proves concurrent processing, restart recovery, retries, and cancellation. Browser checks are manual; hosted scheduling and external delivery are not enabled.
- **Portable reports.** Download a JSON report containing the snapshot, exact scenario values, coverage, protocol metadata, and assumptions.
- **Useful without an account.** Explore deterministic samples, read public accounts, and save historical reports on this device without signing in or connecting a wallet. Optional cloud accounts keep a separate private library.
- **A workspace that travels.** Use the responsive web app on mobile, tablet, and desktop, with installation through supported PWA browsers.

### Simple math, carefully scoped

For each eligible position:

```text
Price P&L change = signed base quantity × frozen baseline oracle price × shock fraction
```

The default editable portfolio contains 100 SOL long at 150, a 0.5 BTC short at 100,000, 8 ETH long at 2,500, and 2,500 XRP long at 2. A −10% price move produces −1,500, +5,000, −2,000, and −500 USDC contributions: a modeled total change of **+1,000 USDC**. The preserved Long + short fixture keeps the useful two-position example: −1,500 USDC plus +5,000 USDC equals **+3,500 USDC**. Sample denominations are labels for the same illustrative numbers; they do not imply venue settlement or trigger currency conversion. Live Velocity reports keep their verified USDT denomination, while live Pacifica price effects are labeled USD and remain separate from USDC margin balances.

Sample values are fixtures, not live market observations. The calculation is a perpetual price effect. It does not forecast account equity, margin health, or liquidation risk. Collateral-price changes, funding, fees, future fills, borrowing interest, and liquidation effects are outside the model.

### Read-only by design

Buffer does not require a seed phrase, private key, wallet connection, or trading approval. Live lookups read Pacifica's public API or use a configured server-side Solana RPC for Velocity and Jupiter inventory. Velocity uses its pinned official SDK; Jupiter uses a separate canonical account decoder. Pacifica requires no API key. Optional sign-in and scenario storage do not grant authority over a wallet.

Live availability depends on the deployment's provider configuration and RPC service. Modeled live calculations expire after at most two minutes, or earlier when their source price expires, and require a refresh. Live balances and oracle prices can change between reads. Jupiter has no current-price scenario until its oracle and collateral-dependent capped payoff are verified together. Legacy Drift is labeled paused and its balances are not treated as migrated Velocity state. Internet access is needed for live reads and account synchronization.

### Built to be understood

Buffer pairs a responsive video-led website with a precise decimal calculation engine. Its Next.js and TypeScript application separates protocol reads, normalized snapshots, scenario calculations, and presentation. Supabase supports optional authentication and owner-protected historical reports, while device-local reports and the core sample experience work independently. Guest reports never upload automatically. The 12 labeled fixtures remain available beside the editable portfolio builder, whose edits flow into JSON exports and device reports. Session-bound writes protect against late authentication responses replacing a newer login. Public signup and recovery email actions stay disabled until production SMTP, Auth redirects, and server-side password policy are configured and verified.

**Explore a sample. Open a live account. Change the move. Follow the math.**

[View the source on GitHub](https://github.com/operatoruplift/buffer)

---

Buffer provides scenario exploration, not trading recommendations or a liquidation forecast. Browser installation is a PWA feature, not a claim of a separately published native iOS, Android, Windows, or macOS binary.
