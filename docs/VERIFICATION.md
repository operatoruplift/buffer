# Verification record

Tested locally on September 11, 2026 with Node 24.16.0. Exact installed Drift SDK: 2.163.0-beta.13; web3.js: 1.98.0; spl-token: 0.4.13. The npm install was repeated under Node 24 after detecting a shell PATH selecting Node 22.

## Executed checks

- ESLint: passed.
- Unit/provider tests: **59 passed** (40 arithmetic/sample/report tests; 19 provider/boundary/normalization tests).
- TypeScript: passed.
- Next.js production build: passed; dashboard and all three API routes build for Node server execution.
- Playwright: **26 distinct browser cases passed** across desktop (1280px) and mobile (375px) targeted runs. All four strengthened delayed-response cases passed after their final synchronization fix.

Arithmetic tests cover long and short direction, zero shock, the +3,500 USDC fixture, decimal precision, large integer inputs, separate quote totals, missing/invalid prices, exclusions, stale snapshots, malformed shocks, deterministic samples and precision-preserving JSON export. Provider tests cover canonical public addresses, bounded IDs, no accounts, ownership mismatch, missing selected account, sanitized errors, incomplete baseline coverage, LP/isolated positions, oracle validity, verified identities, collateral/debt/open orders and loader read slots/cleanup. Request-race behavior is tested through browser API fixtures.

## Live verification

**Live verification incomplete.** Neither `SOLANA_RPC_URL` nor a suitable `BUFFER_TEST_AUTHORITY` was supplied to this environment. A successful mainnet account snapshot was not run. Server configuration errors and provider boundaries are tested, but mocked responses and deterministic fixtures do not prove live integration.

To complete: provide a mainnet RPC with required account-query methods and a public authority with active Drift positions, start the app with that server configuration, read the authority, select one actual subaccount, and inspect actual account/oracle slots and baseline coverage. Compare at least one decoded size and oracle with the SDK/source account, exercise refresh and expiry, and save the live verification record without including RPC credentials.

## Browser verification approach

Playwright tests exercise the actual running dashboard at 1280px desktop and 375px mobile. Sample tests use shipped fixtures; live-state tests intercept application API responses and are explicitly marked as mocks. Screenshots show Sample, never a fabricated live account. The journey covers sample selection, position review, −10% preset, keyboard slider step, Method open/close, JSON download content, reset and refresh. Additional cases cover excluded exposure, copy/explorer controls, API errors/retry, no accounts, explicit subaccount selection, no positions, incomplete metrics, stale/failed refresh and late responses after wallet/subaccount changes.

The first cold development compile exceeded a default 30-second navigation timeout under concurrent local build load. This was a startup timing issue, not a successful live read; final browser results distinguish reruns from application defects.

## Review

A code-review agent reviewed arithmetic, client state, and provider integration. Its initial two UI findings were fixed: the freshness indicator now uses the same maximum 120-second retrieval age as scenario calculations, and timestamps no longer contain a dangling decimal point. Review of the provider and final browser artifacts was performed before delivery; any later material findings are recorded with their fixes below.

The provider review identified isolated quote collateral missing from the inventory; labeled isolated collateral entries and a zero-base isolated regression test now cover this. Final state-buffer presence also gates baseline valuation. Initial production TypeScript errors in intentionally partial SDK test fixtures were corrected without excluding tests. Client chunk inspection found no `SOLANA_RPC_URL`, `BulkAccountLoader`, wallet-signing implementation, or Pyth SDK implementation in the browser bundle. An actual unconfigured API call returned structured HTTP 503 `NOT_CONFIGURED`, without a stack trace or fallback data.

Production smoke check: served the built application on port 3002; the −10% Long + short fixture displayed +3,500.00 USDC and downloaded a JSON total of the exact decimal string `3500`. Method opened and closed. The desktop and 375px screenshots were recaptured from this production instance. Mobile document/viewport widths were both 375px; there were zero page/console errors in this sample journey. The downloaded example is saved in `examples/long-short-minus-10.json`.

A separate production instance configured with a deliberately refused local RPC transport returned HTTP 502 `RPC_ERROR`, `retryable: true`, and a sanitized message without the endpoint. This verifies configured-provider failure handling, not mainnet success. The temporary test server was shut down.

Final TypeScript reviewer result: no blocking runtime findings; typecheck and lint passed. Its test-synchronization finding was fixed by awaiting deferred old-route fulfillment before retained-state assertions. The four affected desktop/mobile race cases passed afterward. Initial ambiguous test selectors were corrected; one mobile test interrupted by development Fast Refresh passed on targeted rerun. No remaining application defect was identified. Browser API mocks are labeled and remain distinct from the production transport-failure check and the still-unverified mainnet success path.
