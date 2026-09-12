# Verification record

**Last updated:** September 12, 2026. Checks ran September 12 in Vietnam. Local runtime: Node **24.16.0**. Current live provider: Velocity SDK **0.23.1**. Legacy compatibility provider: Drift SDK **2.161.0-beta.5**.

## Current results

| Check | Result |
| --- | --- |
| Unit and provider suite | **90 passed** across scenario, provider, device-report, and Velocity compatibility tests. |
| TypeScript and ESLint | Passed on the current working tree. |
| Ribbon B monogram rollout | Production build, TypeScript, ESLint, and **14 local browser checks passed** across desktop/mobile layouts, website interactions, install assets, offline arithmetic, and public cache isolation. A separate browser migration check confirmed that activation replaces the v2 cache with v3 and serves the ribbon icon. All nine vector sources share the same geometry; the standalone PNG is transparent and the maskable mark fits the safe circle. Landing and sample-app screenshots were refreshed. |
| Velocity decoder fixtures | Passed for current State, SOL/BTC/ETH perp markets, USDT spot identity, Pyth Lazer oracle buffers, PDA derivation, and the request-owned loader. |
| Local judge-experience browser run | **16 passed** across the new quick-start guide, scenario-first mobile layout, device reports, PWA, website, and API-failure paths. |
| Vercel public routes and media | Passed on `https://bufferonsolana.vercel.app`: `/`, `/app`, `/auth`, `/demo`, manifest, service worker, USDT artwork, and all three MP4s returned successfully after the Velocity deployment. |
| Supabase database | Dedicated Buffer project and both saved-report migrations verified; owner RLS, constraints, and private report CRUD passed. |
| Authentication | Confirmed-account password sign-in and report operations passed with disposable fixtures. Public signup and recovery remain gated until SMTP and Auth settings are verified. |

The earlier **42-case production browser run** and its live Drift endpoint check predate the Velocity cutover. The final production browser run completed **44 passed, 2 skipped** across desktop and mobile; the two skipped cases are the opt-in Supabase fixture tests.

## Arithmetic and account coverage

Unit tests verify long/short direction, zero shock, the +3,500 USDC example, decimal precision, large integer inputs, separate quote totals, missing/invalid prices, exclusions, malformed shocks, deterministic samples, immutable baseline values, expiry boundaries, and precision-preserving JSON export.

Provider tests verify canonical addresses, bounded subaccount IDs, protocol/query validation, absent accounts, owner/subaccount mismatch, sanitized errors, complete baseline coverage, isolated collateral and residual state, oracle validity, verified identities, debt/collateral/order inventory, loader failures, cleanup, and unchanged-byte read slots. Device-report tests cover strict nested report validation, quota/error handling, corrupt storage preservation, ordering, deletion, and the 20-report/1 MiB limits.

The Velocity compatibility tests decode captured public State, perp, spot, and Pyth Lazer oracle buffers. They assert the fixed Velocity program, the `velocity_state` PDA, current lower-camel account coders, market PDA derivation, SOL/BTC/ETH identities, and the USDT mint. Fixtures are layout guards, not current-price evidence.

## Current mainnet verification

The current provider was exercised against Solana mainnet-beta with the fixed Velocity program `vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P`. State, SOL/BTC/ETH markets, USDT spot market, user account, and Pyth Lazer oracle accounts were owned by the expected program and decoded with `@velocity-exchange/sdk` **0.23.1**.

The public **Explore a live account** example uses authority `DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2`, Velocity subaccount `0`, and User account `DXN7aHSRosnuyv4eTctBwUJ8tJQ97eGeTEox9iVpnSoe`. A bounded read at observed slot **446228680** decoded +0.05 BTC, +2 ETH, USDT collateral, and no open orders. BTC and ETH oracle data was valid at one-slot lag. The same read recorded net USD value `2105.213085`, funding-inclusive unrealized P&L `297.289922`, and cross-margin health `89`.

These values are observations only. The browser refetches the selected account and current slots, preserves retrieval metadata, and shows that balances can change. Baseline USD values are converted through the validated USDT quote oracle; scenario contributions remain denominated in USDT. The live read used no wallet, private key, transaction, or signing permission.

The final production smoke read without a `protocol` parameter (Velocity is the default) completed at `2026-09-11T19:50:46.127Z`, observed slot **446240613**, with net USD value `2121.618077`, funding-inclusive unrealized P&L `313.694912`, health `89`, and the same two modeled positions. The browser then applied −10% and produced a live USDT scenario total of approximately `−894.83`; values vary as the account and oracles move.

The verified Velocity deployment identities were observed at slot **446228253**:

| Account | Address | Bytes |
| --- | --- | ---: |
| State | `2etx5NvPNxeMZ7EfHE6GjJfW2imRYEUANehNS1WB4CVW` | 1752 |
| SOL perp, index 0 | `FDejXbUrSy6zayBCL5xuk2SXLHZgr8ppfFTLcHbyJorY` | 1560 |
| BTC perp, index 1 | `7s5WRWA3GahueLNfNb8bbVnHnxCssK5YjGCR3wP6Aa1t` | 1560 |
| ETH perp, index 2 | `Bx7JoyYAmBLDPnEdQsPUEhs2dDu4Ga5PoW5BhhhAcChg` | 1560 |
| USDT spot, index 0 | `2QpHj5vzgCdWaGM2KSoGtYJWeSkx24cMyzUDHDrucvRc` | 1064 |

The USDT mint is `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`. The official [Velocity migration guide](https://docs.velocity.exchange/developers/migrate-from-drift) describes the new deployment and the fact that old Drift state does not carry over.

## Legacy Drift verification

The legacy provider is available only through the explicit Drift selector. Its earlier production read decoded authority `7WigdYd1qdbPofUKhzbvtVPYdo8wAUEZMWBZp8MtyAb`, User `9P7Y41yQPacZtcsyKzBBT2FZmQe6RDxn7AQBMxZXoYz7`, +1 SOL-PERP, 31.732475 USDC debt, and 0.855627563 SOL collateral. The external oracle publication was far older than Buffer's 150-slot freshness limit, so price, affected scenario values, and baseline metrics were unavailable as designed. The retired Drift path must never be used as a source of current Velocity prices.

## Browser evidence

Browser tests cover the working app at 1280px desktop and 375px mobile widths. The judge-experience cases exercise the explicit Velocity protocol label, three-step sample guide, scenario-first mobile order, 44px controls, device-local report save/delete/download, API failure and retry paths, and honest cloud-auth messaging. A separate production smoke journey exercises the live-example call to action end to end.

The explorer journey also covers sample selection, contributions, the −10% preset, keyboard slider movement, Method dialog, JSON download, reset, and refresh. Website tests cover landing-page arithmetic, routing into `/app`, narrow-screen overflow, and the public-explorer auth path. PWA tests cover manifest/icon dimensions, service-worker activation, offline sample navigation/calculation, keyboard controls, cache contents, private-request bypass, and installation guidance. Browser tests do not certify installation on physical iOS, Android, or desktop devices.

Deterministic samples and mocked API state tests are labeled accordingly. The sample report at [examples/long-short-minus-10.json](../examples/long-short-minus-10.json) preserves the exact decimal total `3500` USDC. The recorded films use sample fixtures and are not presented as live account activity.

Production live-example captures are [desktop](../screenshots/live-velocity-proof-desktop.png) and [mobile](../screenshots/live-velocity-proof-mobile.png). They show the current Velocity protocol, two modeled positions, USDT contributions, baseline USD metrics, explicit freshness, and the JSON download confirmation.

## Cloud database and authentication

Dedicated Supabase project `vhbngdatlowfnwaymvuq` has both saved-report migrations applied. Checks run as real `authenticated` and `anon` roles verified owner-only access, forged-owner rejection, denied anonymous access, restricted insert columns, no UPDATE privilege, malformed/oversized report rejection, title bounds, deletion cascade, and query indexing. See [database evidence](DATABASE-VERIFICATION.md) for SQL and query-plan details.

Confirmed-account browser tests covered password login and private report requests, including a delayed first-user response after a second user signs in from another tab. They do not test email delivery. The temporary fixture users and reports were deleted after verification, and credentials were never committed.

`NEXT_PUBLIC_AUTH_EMAIL_READY=false` keeps public signup and password-recovery actions visibly unavailable. Existing confirmed accounts can sign in, and visitors can use live reads, device-local reports, downloads, and samples without an account. Production SMTP, exact Auth redirect URLs, server-enforced password policy, and compromised-password screening still require management access and verification.

## Reproduce checks

```sh
nvm use
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Playwright starts or reuses the development server on port 3001 unless `PLAYWRIGHT_BASE_URL` points to an existing deployment. `BUFFER_AUTH_FIXTURES` must reference a private JSON array of two disposable confirmed `{ "email": "…", "password": "…" }` records to run the real Auth cases; otherwise those cases skip. Use dedicated fixtures, remove their exact users/sessions/reports after testing, and never include credentials in artifacts or the repository.

## Remaining release checks

- Configure SMTP, Auth redirects, minimum password policy, and compromised-password screening before enabling public email actions.
- Assess a dedicated RPC's capacity before sustained traffic. Perform physical device installation checks if native installation certification is needed; native store packages and signed desktop installers are outside this PWA delivery.
