# Verification record

**Last updated:** September 12, 2026. Checks ran September 11 UTC / September 12 in Vietnam. Local runtime: Node **24.16.0**. Vercel production runtime: Node **24.19.0**. Drift SDK: **2.161.0-beta.5**.

## Current results

| Check | Result |
| --- | --- |
| Unit and provider suite | **60 passed**, including one compatibility test decoding seven captured mainnet account buffers. |
| TypeScript and ESLint | Passed; production build also completed its type check. |
| Vercel production build | Passed with the explicit Next.js framework configuration. |
| Public deployment smoke | HTTP 200 for `/`, `/app`, `/auth`, `/demo`, manifest, service worker, and all three MP4s; videos use `video/mp4`. |
| Production browser suite | **40 passed** across desktop and mobile, including explorer, website, PWA, and actual Supabase Auth/report integration. |
| Production video browser tests | **2 passed** across desktop and mobile; all three films decode, play, and seek at 1600 × 900, with caption VTT responses verified. |
| Actual Supabase browser integration | Passed on desktop and mobile: login, save, download, cross-tab identity change with a delayed response, owner isolation, delete, logout. |
| Database ownership and constraints | Passed in the dedicated cloud project; see [database evidence](DATABASE-VERIFICATION.md). |
| Mainnet provider | Local and deployed authority/subaccount reads passed. Both production API endpoints returned HTTP 200; stale oracle correctly withheld affected values. A fresh-price live scenario was not verified. |
| Video media checks | All three films decoded, played, and sought successfully; captions, audio levels, frames, and provenance checked. See [video evidence](VIDEO.md). |
| Production dependency audit | `npm audit --omit=dev`: zero high or critical findings; two moderate transitive findings remain. |

**42 distinct production browser cases passed:** 40 in the combined suite and two additional video cases. The browser suite includes mocked live API state tests. Separate actual production account-discovery and snapshot reads returned HTTP 200 after the server dependency repair. The SDK read and stale-oracle result are recorded below.

## Arithmetic and account coverage

Unit tests verify long/short direction, zero shock, the +3,500 USDC example, decimal precision, large integer inputs, separate quote totals, missing/invalid prices, exclusions, malformed shocks, deterministic samples, immutable baseline values, expiry boundaries, and precision-preserving JSON export.

Provider tests verify canonical addresses, bounded subaccount IDs, absent accounts, owner/subaccount mismatch, sanitized errors, complete baseline coverage, isolated collateral and LP/residual state, oracle validity, verified identities, debt/collateral/order inventory, loader failures, cleanup, and unchanged-byte read slots. Raw account fixtures guard against SDK binary-layout incompatibility, rather than merely retesting SDK-created mocks.

## Mainnet verification

On production deployment `A3AbTkEYhDcBjp9ZMiXcLycghxKn`, aliased to `https://buffer-lovat.vercel.app`, the actual `/api/accounts` and `/api/snapshot` requests returned **HTTP 200** for public authority `7WigdYd1qdbPofUKhzbvtVPYdo8wAUEZMWBZp8MtyAb`. Discovery returned **Main Account**, subaccount `0`, User account `9P7Y41yQPacZtcsyKzBBT2FZmQe6RDxn7AQBMxZXoYz7`.

The snapshot retrieved at **2026-09-11T17:39:43.278Z** decoded **+1 SOL-PERP**, **31.732475 USDC debt**, and **0.855627563 SOL collateral**. Account read slot was **446215843**; observed RPC slot was **446215844**; the external oracle publication slot was **410366404**. The oracle failed Buffer's 150-slot maximum lag, and price, affected scenario values, and baseline metrics were unavailable as designed. An earlier local SDK read also passed at account/observed slot **446213278**.

A separate real browser journey passed public address discovery, explicit subaccount selection, and the Method dialog at account/observed slot **446216442**. Stale oracle data disabled scenario controls and report export, with no browser errors. Its screenshot is [live stale-oracle evidence](../screenshots/live-stale-oracle.png). Sample and saved-report export are verified separately; this check does not claim a live priced report.

This is actual RPC/SDK integration evidence, distinct from mocked browser API cases. It verifies discovery, decoding, selected-account handling, and stale-data rejection. It does not establish fresh-oracle scenario success or sustained RPC capacity. The seven public market/state buffers in `tests/fixtures/drift-mainnet/` were independently captured at observed slot **446212035** and document canonical binary layouts. No user credentials or signing permissions were required.

The initial production RPC uses Solana's shared mainnet endpoint. A dedicated provider and an account with fresh eligible oracles remain useful for a complete fresh-price live demonstration. Keep source, subaccount, observation slots, coverage, and expiry visible during that check. See [provider details](PROVIDER.md).

## Browser evidence

Browser tests cover the working app at 1280px desktop and 375px mobile widths. The explorer journey includes sample selection, contributions, the −10% preset, keyboard slider movement, Method dialog, JSON download, reset, and refresh. Additional cases cover partial coverage, copy/explorer links, no accounts/positions, explicit subaccount choice, API failures/retry, missing metrics, stale refresh, and late responses after authority/subaccount changes.

The website tests exercise the actual scenario arithmetic in the landing preview, routing into `/app`, narrow-screen overflow, and the optional account screen's public-explorer path. PWA checks exercise manifest/icon dimensions, actual service-worker activation, offline sample navigation/calculation, keyboard controls, cache contents, private-request bypass, and installation guidance. Browser tests do not certify installation on physical iOS/Android/macOS devices.

Deterministic samples and mocked API state tests are labeled accordingly. Production sample screenshots in `screenshots/` and [the downloaded example](../examples/long-short-minus-10.json) demonstrate the core explorer; the exact report total is decimal string `3500`. The recorded films use sample fixtures and the earlier explorer capture, not fabricated production account activity.

## Cloud database and authentication

Dedicated Supabase project `vhbngdatlowfnwaymvuq` has both saved-report migrations applied. Checks run as real `authenticated` and `anon` roles verified owner-only access, forged-owner rejection, denied anonymous access, restricted insert columns, no UPDATE privilege, malformed/oversized report rejection, title bounds, and deletion cascade. A representative newest-50 query used the ownership/date index without sorting. See [database verification](DATABASE-VERIFICATION.md) for SQL and query-plan details.

Actual browser tests used two temporary confirmed `.invalid` email accounts. They tested Supabase password login and report requests, including a delayed first-user response after a second user signs in from another tab. They do not test email delivery. After the production tests, both exact fixture accounts were deleted. A follow-up query confirmed zero test users and zero test reports. Fixture credentials were private and excluded from source control.

Public signup and password-recovery requests are disabled by `NEXT_PUBLIC_AUTH_EMAIL_READY=false`. Production SMTP, exact Auth redirect URLs, and server-enforced password settings still require configuration and verification. Existing confirmed accounts can sign in, and the public explorer works independently. The Auth advisor also reports compromised-password screening disabled; the database's fixed Auth connection allocation is an informational tuning notice. These are recorded configuration gaps, not completed checks.

## Review and dependency findings

Code and TypeScript review informed the original explorer and expanded application. Fixes include consistent freshness UI/calculation limits, complete isolated collateral inventory, final state-buffer coverage, and withholding delayed responses after account or authenticated-user changes. Database review fixed JSON-null CHECK behavior and padded title length validation. Read [database verification](DATABASE-VERIFICATION.md) for the resulting schema constraints.

The selected SDK was validated against actual canonical Drift layouts after the incompatible newer package was identified. The production dependency-resolution failure was repaired by removing 13 stale lockfile lines for nested UUID 14; the selected UUID 11 override and application dependency versions did not change. A clean isolated install and actual SDK/web3/spl/RPC imports passed before the successful deployed API checks. Security overrides pin vulnerable transitive dependencies; the production dependency audit now has zero high/critical and two moderate findings associated with the `stream-json` / Jayson dependency chain. Those unused filter paths remain in the dependency tree; the application does not claim a clean zero-finding audit.

The original browser bundle inspection found no server RPC variable, account loader, wallet-signing implementation, or Pyth SDK implementation in client chunks. Error-path checks verified structured `NOT_CONFIGURED` and sanitized retryable `RPC_ERROR` responses without raw endpoint disclosure or sample fallback.

Final review also made the reported SDK version follow the exact package manifest pin, and strengthened video verification to wait for the completed seek and resumed playback. Type checking, lint, all 60 unit/provider cases, and both affected video browser cases passed afterward.

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

Playwright starts/reuses the development server on port 3001 unless `PLAYWRIGHT_BASE_URL` points to an existing deployment. `BUFFER_AUTH_FIXTURES` must reference a private JSON array of two disposable confirmed `{ "email": "…", "password": "…" }` records to run the real Auth cases; otherwise those cases skip. Use dedicated fixtures, remove their exact users/sessions/reports after testing, and never include credentials in artifacts or the repository.

## Remaining release checks

- Configure SMTP, Auth redirects, minimum password policy, and compromised-password screening; verify public confirmation and recovery before enabling email actions.
- Demonstrate an eligible mainnet account with fresh oracle values and assess a dedicated RPC's production capacity.
- Perform actual device installation checks if physical iOS/Android/desktop installation certification is needed. Native store packages and signed desktop installers are outside this PWA delivery.
