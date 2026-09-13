# Buffer reliability audit

Read-only inspection on September 12, 2026, before Phase 2 implementation. This records observed configuration and repair candidates; it does not claim that the proposed fixes or unverified authentication paths are complete. No application code, production settings, database records, users, or deployments were changed during the audit.

## Preservation ledger

| Area | Existing behavior to retain | Source |
| --- | --- | --- |
| Public entry and lookup | `/`, `/app`, optional `/auth`, `/demo`; public wallet lookup requires no login or signing. Velocity remains the initial live-provider selection. | `src/components/Dashboard.tsx`, `src/app/**/page.tsx` |
| Samples and arithmetic | Twelve original fixtures plus the editable 76-market catalog. The original SOL/BTC fixture produces +3,500 USDC at −10%; the current four-position app default produces +1,000 USDC. Decimal strings, quote-separated totals, exclusions, and historical report values remain exact. | `src/lib/samples.ts`, `sample-builder.ts`, `scenario.ts`, `report.ts` |
| Live state | Explicit account selection; request generation plus AbortController cancels superseded UI reads. Provider/account changes clear incompatible state. Failed refresh retains the old snapshot but disables calculation and report creation. | `Dashboard.tsx:94–255` |
| Sources | Velocity and legacy Drift use fixed programs, SDK decoding, canonical PDAs, owner/authority checks, pinned market/oracle identities, quote-mint validation, and recorded slots. Pacifica uses fixed public HTTPS GET endpoints, exact symbols, API USD accounting, timestamp validation, and no claimed chain slots. | `src/server/{velocity,drift,pacifica}.ts` and normalizers |
| Scope and expiry | Fixed-size linear price effects only; collateral, fees, funding changes, future fills, and liquidation stay outside the scenario. Snapshot expiry is at most 120 seconds, with earlier Pacifica expiry. Explicit live Drift scenarios remain paused. | `src/lib/scenario.ts`, normalizers |
| Reports and identity | Device reports use `buffer.device-reports.v1`, at most 20 reports/1 MiB. Optional cloud reports remain private historical records. Login does not upload guest reports or grant wallet permissions. | `device-reports.ts`, `DeviceReportsPanel.tsx`, `AccountPanel.tsx` |
| Media and offline | Original demo/pitch/technical videos, captions, install controls, pause preference, and reduced motion remain. The service worker caches only the offline calculator and six icon assets, never auth/API/session/report responses. | `public/sw.js`, `PwaClient.tsx`, `e2e/demo.spec.ts`, `e2e/pwa.spec.ts` |

## Configuration and database evidence

- Local `.env.local` supplies `SOLANA_RPC_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Values were not printed. The configured RPC answered HTTP 200, matched the canonical Solana mainnet genesis hash, and returned confirmed slot **446421589**.
- Supabase project **Buffer**, reference `vhbngdatlowfnwaymvuq`, reports `ACTIVE_HEALTHY`. Both repository migrations, `20260911170941` and `20260911171816`, are applied.
- Metadata queries confirmed `saved_reports` RLS is enabled. Authenticated SELECT and DELETE use `auth.uid() = user_id`; INSERT has the same ownership check and column grants limited to `user_id`, `title`, and `report`. Anonymous users have no table grants, and authenticated users have no UPDATE grant.
- Applied constraints retain the user foreign key, bounded nonblank title, JSON object/version/source checks, and a 262,144-byte cloud report bound. An anonymous REST read returned **401 / PostgreSQL 42501**, with no report rows disclosed.
- The security advisor returned no notices in this audit. This result alone does not prove individual Auth settings such as leaked-password protection are configured.
- Public `/auth/v1/settings` returned HTTP 200: email authentication is enabled, backend signup is enabled, and automatic email confirmation is disabled. Public settings do not establish SMTP delivery or redirect allowlists.

These were metadata and public read checks. Owner-isolation write/delete tests were not rerun against production. Earlier transactional verification is recorded separately in `DATABASE-VERIFICATION.md`.

## Phase 2 repair candidates

| Priority | Current gap and effect | Proposed local repair and verification |
| --- | --- | --- |
| High | `AccountPanel.tsx:39–71` has no request deadline or try/finally around cloud operations. A thrown operation can leave `busy` set indefinitely. The same-user request order is not tracked separately from identity changes. | Use bounded operations, operation generations, cleanup, and consistent completion handling. Mock rejected/stalled requests and delayed overlapping loads without contacting production. |
| High | `AuthForm.tsx:30–57` permits switching modes during a pending submit. A late completion can navigate or overwrite the new mode. Recovery handling at line 25 recognizes only `PASSWORD_RECOVERY`; invalid/expired callbacks and a reloaded recovery session have no explicit recovery-state UI. | Coordinate with the design owner after Phase 1. Add operation/identity guards, explicit callback-error and recovery states, safe cleanup, and deterministic sign-in/signup/recovery/race tests. Preserve the email readiness gate. |
| Medium | `AccountPanel.tsx:48` casts cloud rows without validating them; the database intentionally checks only a small report envelope. A failed load can display an error alongside “No reports saved yet” at line 88. Sign-out at line 91 has no operation or identity guard. | Reuse a shared report validator while retaining the existing storage format; distinguish load failure from verified empty results; sequence sign-out and restore/expired-session states. Test malformed rows, account switches, logout failures, and late previous-user responses. |
| Medium | `Dashboard.tsx:128` casts successful JSON as `Discovery` or `Snapshot`. The server currently normalizes its own adapters, but an unexpected successful response shape can reach rendering without a final boundary check. | Validate response identity and required fields before committing state. Test malformed success payloads and mismatched protocol/authority/subaccount responses, especially before adding a provider. |
| Medium | Velocity/Drift transport has an 18-second abort deadline and disables SDK rate-limit retries, but unlike Pacifica it has no explicit streamed response-byte cap. Its fetch wrapper does not explicitly set `cache: 'no-store'`; the route supplies dynamic/no-store behavior. | Add a bounded shared RPC transport with explicit no-store behavior while preserving SDK bindings and redacted errors. Verify oversize, timeout, malformed, and 429 outcomes. Keep endpoints server-configured, never user-selectable. |

`src/server/boundary.ts` already rejects extra/duplicate query keys, validates canonical Solana addresses and bounded account IDs, and emits sanitized no-store errors. Its **60 reads/minute and four concurrent reads are per-process protections**, not a distributed account quota. Pacifica already uses an 18-second total deadline, a 1 MiB response cap, fixed endpoint union, redirect rejection, no-store requests, and documented not-found matching; outages are not interpreted as empty holdings. Preserve these distinctions.

## Authentication requirements still unverified

1. **Authorized nonproduction test accounts:** `BUFFER_AUTH_FIXTURES` is not set and no such fixture file was found in project work files. The existing real Auth browser test expects a private JSON array containing two disposable, confirmed `{email, password}` accounts. Do not create production users or mutate production reports in this task. Add mocked tests now; use a nonproduction Supabase project with its own public configuration and authorized fixtures for real CRUD/session verification when available.
2. **Email delivery readiness:** `NEXT_PUBLIC_AUTH_EMAIL_READY` is absent locally, so the application evaluates it as false. No SMTP setup credentials are present. This does not establish whether SMTP exists remotely; delivery, signup confirmation, and recovery remain unverified. Do not change the readiness flag without evidence.
3. **Redirects and password settings:** Both signup and recovery target the current origin’s `/auth`. The deployed destination is `https://bufferonsolana.vercel.app/auth`; every intentional local/preview destination also needs an exact authorized Supabase entry. Management-side Site URL, redirect allowlist, minimum password policy, and leaked-password protection could not be verified with the available public configuration. No management token was present locally. The connected database tools do not expose these Auth settings.
4. **Callback contract:** The installed Supabase Auth SDK defaults to implicit flow, persists/refreshes sessions, and detects URL sessions. `lib/supabase.ts` preserves those defaults. Strengthening recovery must respect the current callback contract and sanitize displayed URL errors rather than assuming a PKCE migration already exists.

## Existing verification coverage

- `tests/provider.test.ts`, `velocity.test.ts`, and `pacifica.test.ts`: canonical SDK/program bindings, market units and identities, exclusion/oracle rules, partial valuation, malformed input, fixed-origin public requests, missing configuration, redacted errors, loader races, and Pacifica timeout/freshness behavior.
- `tests/scenario.test.ts` and `sample-builder.test.ts`: exact arithmetic, separated quotes, registry tampering, old fixtures, editable samples, exclusions, expiry, and report contents.
- `tests/device-reports.test.ts`: corruption, quotas, storage denial, version/protocol validation, immutable historical reports, and precise round trips.
- `e2e/dashboard.spec.ts`, `judge-experience.spec.ts`, `pacifica.spec.ts`, and `sample-builder.spec.ts`: sample/live transitions, selected-account flows, failed refresh, stale state, late request races, Method, downloads, and sample editing on desktop/mobile.
- `e2e/auth.spec.ts`: real sign-in, save/download/delete, logout, and cross-tab account-switch isolation, but the entire test skips without the external two-account fixture. There are currently no default mocked sign-in/recovery/expired-session tests.
- `e2e/pwa.spec.ts`: real offline arithmetic, installation behavior, public cache allowlist, and inability to replay private responses. `e2e/demo.spec.ts` covers original video decode/play/seek/captions.

This audit inspected coverage; it did not rerun the entire suite or claim successful live email/auth verification. Root verification should run after the ordered design and reliability changes are complete.
