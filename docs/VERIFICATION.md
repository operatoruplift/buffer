# Verification record

**Last updated:** September 12, 2026. Checks ran September 12 in Vietnam. Local runtime: Node **24.16.0**. Live providers: Velocity SDK **0.23.1** and Pacifica public REST API. Legacy compatibility provider: Drift SDK **2.161.0-beta.5**.

## Current results

| Check | Result |
| --- | --- |
| Unit and provider suite | **269 passed** across six suites, including 23 sample-builder tests, 117 Pacifica adapter tests, all 76 Pacifica identities, all four Velocity identities, scaled units, source/quote separation, malformed data, freshness, timeouts, and historical reports. |
| TypeScript and ESLint | Passed on the current working tree. |
| Branding and artwork | Shared blue wordmarks use the landing header typography across all routes and the footer. The default SOL/BTC/ETH/XRP images decode in both browser layouts; every local token reference exists. Landing, install, app, and sample-catalog screenshots were refreshed. The existing v3 offline cache and maskable install assets remain verified by the PWA checks. |
| Editable sample portfolio | The default four positions produce exactly `+1000` USDC at −10%. All 76 catalog identities can be added, including alongside an excluded fixture position. Edits and denomination changes flow into precise JSON and device reports; refresh preserves edits. Invalid inputs leave the prior calculation intact. A 375px browser check with maximum-size integer inputs had no horizontal overflow. |
| Velocity decoder fixtures | Passed for current State, SOL/BTC/ETH perp markets, USDT spot identity, Pyth Lazer oracle buffers, PDA derivation, and the request-owned loader. |
| Local production-build browser run | **56 passed, 2 skipped** across desktop/mobile branding, continuous motion and pause/reduced-motion behavior, restored favicon, editable 76-market sample catalog, selectors, Pacifica account workflow, provenance, scenarios, account-switch races, device reports, PWA, videos, website, and API-failure paths. The skipped cases require disposable Supabase authentication fixtures. |
| Pacifica real public API | Direct provider smoke and desktop/mobile browser reads succeeded with 22 of 22 positions eligible, USD scenarios, null chain slots, current API timestamps, and aggregate order inventory. Browser reads at `2026-09-12T10:16:33.155Z` and `10:16:37.112Z` produced nonzero −10% scenarios; all 36 rendered position/contribution images decoded, with no JavaScript errors or horizontal overflow. |
| Install caption and motion | The hero and install artwork run continuously beyond the initial five seconds. Caption and icon share one rotation/translation, with a 4px optical offset to the right and an 18px desktop / 15px mobile gap. Both icon-only controls pause the shared motion; reduced motion disables the effects. |
| Selector, market, and favicon review | Frontend/TypeScript and security reviews passed after correcting excluded-position metrics, catalog capacity, and preset provenance. The browser favicon restores the blue tile SVG with a fresh cache key; the ICO packages the unchanged 192px blue-tile PNG. Shared branding matches the landing header across app, demo, auth, and footer. |
| Vercel public routes and media | Passed on `https://bufferonsolana.vercel.app`: `/`, `/app`, `/auth`, `/demo`, manifest, service worker, USDT artwork, and all three MP4s returned successfully after the Velocity deployment. |
| Supabase database | Dedicated Buffer project and saved-report migrations verified; owner RLS, constraints, and private report CRUD passed. The additive alert migration is committed and locally validated; hosted alert persistence remains gated. |
| Authentication | Confirmed-account password sign-in and report operations passed with disposable fixtures. Public signup and recovery remain gated until SMTP and Auth settings are verified. |

The earlier **42-case production browser run** and its live Drift endpoint check predate the Velocity cutover. The selector/market revision passed **46 local production-build browser tests**, and the Pacifica adapter revision passed **48**. The current branding, continuous-motion, and sample-builder revision passes **56**, with the two opt-in Supabase fixture tests skipped.

## Arithmetic and account coverage

Unit tests verify long/short direction, zero shock, the +1,000 USDC editable default and preserved +3,500 USDC fixture, decimal precision, large integer inputs, separate quote totals, missing/invalid prices, exclusions, malformed shocks, deterministic samples, immutable baseline values, expiry boundaries, and precision-preserving JSON export. Builder tests cover all 76 markets, input bounds, source isolation, denomination retention after removing all positions, excluded-position metrics, and saved-report round trips.

Provider tests verify canonical addresses, bounded subaccount IDs, protocol/query validation, absent accounts, owner/subaccount mismatch, sanitized errors, complete baseline coverage, isolated collateral and residual state, oracle validity, verified identities, debt/collateral/order inventory, loader failures, cleanup, and unchanged-byte read slots. Device-report tests cover strict nested report validation, quota/error handling, corrupt storage preservation, ordering, deletion, and the 20-report/1 MiB limits.

The Velocity compatibility tests decode captured public State, perp, spot, and Pyth Lazer oracle buffers. They assert the fixed Velocity program, the `velocity_state` PDA, current lower-camel account coders, market PDA derivation, SOL/BTC/ETH identities, and the USDT mint. Synthetic normalization tests now cover all four configured markets, including HYPE, and reject mismatched identity/oracle sources, inactive or nonlinear contracts, dated contracts, and unusable prices. Registry tests compare the lightweight browser identities to the pinned SDKs. Fixtures are layout guards, not current-price evidence.

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

Dedicated Supabase project `vhbngdatlowfnwaymvuq` has the saved-report migrations applied. Checks run as real `authenticated` and `anon` roles verified owner-only access, forged-owner rejection, denied anonymous access, restricted insert columns, no UPDATE privilege, malformed/oversized report rejection, title bounds, deletion cascade, and query indexing. The additive alert migration is present in source and covered by local state-machine tests; it is not presented as hosted delivery until the service-role worker and destination are configured. See [database evidence](DATABASE-VERIFICATION.md) for SQL and query-plan details.

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
