# Buffer

A read-only Solana / Drift position explorer. Paste a public authority, choose one subaccount, inspect its baseline and exposure inventory, then apply a shared −20% to +20% price move to eligible SOL, BTC, and ETH perpetuals. A complete deterministic Sample experience opens without configuration.

## Run locally

```sh
nvm install
nvm use
npm ci
cp .env.example .env.local
npm run dev -- --port 3001
```

Open http://127.0.0.1:3001. Use Node **24.16.0**, pinned in `.nvmrc` and `package.json`. No RPC credentials are needed for Sample. For live reads, set server-only `SOLANA_RPC_URL` to a Solana **mainnet** endpoint supporting `getProgramAccounts`, `getAccountInfo`, `getMultipleAccounts`, and `getSlot`, then restart the server. Never prefix this variable with `NEXT_PUBLIC_`. `BUFFER_TEST_AUTHORITY` documents the optional public authority for a manual live check; the app does not use it automatically.

Verified installed versions: Next.js **16.3.4**, React **19.3.0**, `@drift-labs/sdk` **2.163.0-beta.13**, `@solana/web3.js` **1.98.0**, `@solana/spl-token` **0.4.13**, decimal.js **10.6.0**. The npm SDK manifest requires Node `^24.0.0`. Its Anchor dependency changed from the master manifest referenced in the brief; implementation uses the installed package's source and typings. Dependencies are exact at the application boundary and the npm lockfile fixes the resolved tree. The initial install used a shell-selected Node 22; installation was rerun and checks were executed with the explicit Node 24 path.

## Use

- Select **SOL long**, **Long + short**, or **Partial coverage** for repeatable examples. Their fixed date, prices, baseline metrics, and inventory are labeled fixtures. They have no invented public addresses or slots.
- A live authority read discovers sorted subaccounts. Select one explicitly; separate subaccounts are never combined.
- The three baseline metrics come from official SDK methods only when complete required state can be valued. Unavailable metrics explain the missing coverage. Cross-margin health is withheld when isolated positions are present.
- Move the slider, select a preset, or use arrow keys in 1% steps. **Reset** returns the shock to zero. **Refresh** reads all inputs together and resets the shock after success; Sample refresh restores the same fixture.
- **Method** shows the formula, exclusions, addresses, source and slot observations. **Download report** produces a local JSON file with precise numeric strings and complete coverage/provenance. Nothing is uploaded.

## Arithmetic and limits

For signed base quantity `q`, frozen external oracle price `p`, and shock fraction `s`, incremental price P&L is `q × p × s`; hypothetical price is `p × (1+s)`. Notional is `abs(q × p)`. Calculations use decimal strings with locally sufficient precision; SDK BNs normalize using exported precision constants. Only presentation is rounded. Quotes are verified through their quote market and mint, and different currencies retain separate totals.

At −10%, 100 SOL at 150 USDC produces −1,500 USDC; −0.5 BTC at 100,000 produces +5,000 USDC; the combined change is **+3,500 USDC**. Zero shock produces zero.

The model holds sizes fixed and excludes collateral-price changes, future fills, funding, fees, borrowing interest, and liquidation effects. Spot deposits, debts, and market order counts remain visible. Unsupported markets, nonlinear/unknown contracts, LP exposure, undecodable flags, inactive markets, and invalid/missing oracle prices are explicitly excluded. Zero-base residual protocol state remains part of baseline coverage. This is not hypothetical account equity, health, a liquidation threshold, or a trading recommendation.

Live external oracle data must pass the SDK's applicable validity helper and an additional **150-slot maximum lag**. Spot valuation also checks margin staleness, volatility, data-point sufficiency, and a conservative **1% confidence cap**. Live calculations expire **120 seconds after retrieval**, or earlier when explicitly expired. These are app freshness rules, not liquidation rules. Oracle publication slots, oracle read slots, user account slots and the observed RPC slot are preserved separately; the reads are **not atomic**. SDK baseline calculations may use their separately validated MM valuation oracle.

## Small architecture

```text
Address + explicit subaccount
  → Node route validation / process rate cap
  → request-owned Drift client + manual RPC snapshot loader
  → account / markets / oracle coverage checks
  → normalized Snapshot of decimal strings
  → dashboard + pure scenario calculation
  → local JSON report

Deterministic sample provider → the same Snapshot type
```

`src/server/drift.ts` owns read-only SDK acquisition and cleanup. `normalize.ts` gates metrics and normalizes account state. `boundary.ts` validates public keys, bounded unsigned subaccount IDs, and permitted query keys. `src/lib` contains types, samples, scenario math, formatting and report generation. `Dashboard.tsx` owns the single screen and native accessible Method dialog.

No signing keys, wallet connection, transactions, trading, program deployment, database, authentication, paid AI, or background monitoring are used. SDK dependencies and RPC credentials stay on the Node server. Read-only wallet methods throw if invoked. Requests use an 18-second abort deadline; loaders have no polling timer and are disposed with clients/listeners. Structured errors exclude raw provider messages and credentials. Per-process caps allow 60 requests/minute and 4 concurrent reads; no wallet-address cache is retained. A scaled deployment should enforce its own shared ingress limit because process-local limits are per instance.

Errors never fall back to fixtures. A failed refresh retains the original snapshot with a prominent stale state and disables scenario calculations. Request cancellation and generation checks prevent late wallet/subaccount responses from replacing a newer selection.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Playwright uses Chromium at port 3001, reusing a running app or launching the development server. Run `npx playwright install chromium` if needed. Unit tests cover arithmetic/coverage/precision and provider boundaries/normalization. Browser API fixtures are explicitly mocked UI-state tests, **not proof of a mainnet read**. See [verification](docs/VERIFICATION.md) for executed results and limitations. Desktop and 375px mobile screenshots in `screenshots/` show the production Sample UI at −10%. A real browser download is preserved in [the example JSON report](examples/long-short-minus-10.json).

**Live verification incomplete.** This environment provides neither `SOLANA_RPC_URL` nor a suitable public Drift test authority with positions. The real SDK provider is implemented; a successful mainnet account snapshot has not been claimed. Configure both prerequisites and manually verify discovery, ownership, baseline coverage, oracle slots and expiry before demonstrating Live.

## Deploy (not published)

Use a Node 24 server/container or a hosting platform configured for Node 24 and Node route execution. Run `npm ci`, set server-only `SOLANA_RPC_URL` if live reads are desired, run `npm run build`, then `npm run start -- --port 3001`. The default scripts bind to loopback; behind a container ingress, invoke `npx next start --hostname 0.0.0.0 --port 3000`. Allow at least 30 seconds for Node route execution. Static export and edge-only hosting cannot execute this integration. No deployment or event submission was performed.

## Assets and event

Original vector artwork is in `public/brand/`: mark, horizontal wordmark, favicon, and monochrome mark/wordmark. The mark is an open U gauge and a detached vertical tick, 32 × 32 with 3px rounded strokes. Wordmarks use the local system sans stack.

[Submission copy and the 90-second demo](docs/SUBMISSION.md) describe only implemented functionality. The official event page checked September 11, 2026 confirms September 18–25, 2026. Detailed rules and judging criteria were not published there; **perps-only eligibility and pre-event development eligibility remain unverified**.

## Official sources

- [Event page](https://hackathons.solana.com/hackathons/perps-and-prediction-markets)
- [Official SDK manifest](https://raw.githubusercontent.com/drift-labs/protocol-v2/master/sdk/package.json) and [pinned npm package](https://www.npmjs.com/package/@drift-labs/sdk/v/2.163.0-beta.13)
- [Drift client docs](https://drift-labs-protocol-v2.mintlify.app/api/drift-client) and [client source](https://raw.githubusercontent.com/drift-labs/protocol-v2/master/sdk/src/driftClient.ts)
- [Account-loader source](https://raw.githubusercontent.com/drift-labs/protocol-v2/master/sdk/src/accounts/bulkAccountLoader.ts)
- [User metric source](https://raw.githubusercontent.com/drift-labs/protocol-v2/master/sdk/src/user.ts)
- [Precision constants](https://raw.githubusercontent.com/drift-labs/protocol-v2/master/sdk/src/constants/numericConstants.ts)

The package's installed `lib/node` typings and bundled `src` are authoritative for the pinned implementation; master reference URLs may subsequently change.
