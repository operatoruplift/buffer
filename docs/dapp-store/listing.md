# Solana dApp Store listing: Buffer

Copy and assets for the Publisher Portal (https://publish.solanamobile.com). The text inside each fenced block is the exact Portal value. `node scripts/generate-dapp-store-assets.mjs verify` checks the text limits below as well as the image sizes.

## Store text

**App name** (6 of 25 characters). If the name is taken, use `Buffer: Perp Scenarios` (22 characters).

```text name
Buffer
```

**Subtitle** (28 of 30 characters)

```text subtitle
A clearer view of your perps
```

**Description** (2,777 of 10,000 characters)

```text description
Buffer shows what a market move would do to your Solana perpetual positions. Paste a public wallet address, read the account, and move one shared price slider from −20% to +20%. Every number comes with its source, its assumptions and what it leaves out.

What you can do
• Read live positions on Velocity (Solana mainnet by default, devnet on request) and Pacifica. Pacifica lists 76 perpetual markets across crypto, equities, commodities and FX. Velocity covers SOL, BTC, ETH and HYPE.
• Apply one price move to every eligible position. See each position's contribution, the total for each quote currency, and every excluded position with the reason.
• On live Velocity reads, see the maintenance headroom reported by the Velocity SDK and a liquidation estimate for each position. The estimate uses a named, versioned model (cross-margin-hold-others-v1). It solves for the oracle price at which one position alone would reach the maintenance boundary while everything else stays fixed. It is an estimate, not a guarantee, and it is not the protocol's liquidation engine.
• Inspect Jupiter Perps positions as inventory, without a price-effect estimate. Legacy Drift stays available as a labeled historical read. That deployment is paused, so Buffer does not calculate scenarios for it.
• Start without an address. Twelve presets and an editable four-market portfolio use fixed reference prices, clearly labeled.
• Save a dated report on your device, or download it as JSON. Saved reports are historical records and do not refresh with the market.
• Create an optional email account to keep a private library of saved reports and to set alert rules.
• Set alerts on a Velocity mainnet account: maintenance headroom in USD, or the distance from the current oracle price to one position's estimated liquidation price in percent. When the operator connects a verified Discord channel or signed webhook for your account, alerts go there. Alerts can be delayed or fail, so keep watching your positions directly.
• Delete your account and the data stored with it at any time, from inside the app.

Read-only by design
• Buffer never asks for a seed phrase or private key.
• Buffer never requests a signature, never sends a transaction and never moves funds.
• Use my wallet asks your wallet for its public address and nothing else. On Android and Seeker it works through Mobile Wallet Adapter, with wallets such as Seed Vault Wallet, Phantom or Solflare.
• Live calculations expire after at most two minutes and ask you to refresh.

This Android app opens the Buffer web app, so live reads, account sync and alerts need an internet connection.

Buffer is a scenario tool, not trading advice. Positions, prices and estimates come from public protocol data and can change between reads.
```

**What's new**

```text whats-new
First release
```

## Listing details

| Field | Value |
| --- | --- |
| Website | https://bufferonsolana.vercel.app |
| Privacy policy | https://bufferonsolana.vercel.app/privacy |
| Terms of use | https://bufferonsolana.vercel.app/terms |
| Account deletion | In the app: My reports, then Delete account. Explained at https://bufferonsolana.vercel.app/privacy#delete-account |
| Support and contact email | Set in the Portal |
| Languages | English |
| Category (suggested) | Finance, matching the web app manifest |
| Token distribution | No |
| Copyright | © 2026 Operator Uplift |
| Availability | All regions except sanctioned countries |
| Android package | `com.operatoruplift.buffer`, version 1.0.0 (versionCode 1), a signed release APK built from `android/` (see [Seeker and PWA readiness](../seeker-and-pwa.md)) |

## Assets

Regenerate everything, then check it:

```bash
node scripts/generate-dapp-store-assets.mjs            # banner, screenshots, verify
node scripts/generate-dapp-store-assets.mjs verify     # sizes and text limits only
```

The banner is composed in `scripts/dapp-store/banner.html` from the brand masters, the Buffer mark and the self-hosted Inter, and rendered with Playwright at deviceScaleFactor 1. Its scenario card is the app's own Long + short preset at −10%, computed by `src/lib/scenario.ts`, with fixed reference prices.

Screenshots are captured as a 360 × 640 phone at deviceScaleFactor 3, with service workers blocked. They show real public mainnet accounts at capture time. The script only opens public pages; the report shot saves to the throwaway browser profile. By default it reads the live site; pass `--base-url` to capture another build.

This kit was captured on 8 October 2026 from a local production build of this branch (`npm run build`, then `npm run start -- --port 3191` with `SOLANA_RPC_URL=https://api.mainnet-beta.solana.com`), so the landing page already shows the corrected hero line. Velocity data came from Solana mainnet through that public RPC and Pacifica data from Pacifica's public API:

```bash
node scripts/generate-dapp-store-assets.mjs screenshots --base-url=http://127.0.0.1:3191
node scripts/generate-dapp-store-assets.mjs verify
```

| File | Size | Shows |
| --- | --- | --- |
| `banner-1200x600.png` | 1200 × 600 | Brand banner: headline, read-only cue and the Long + short preset scenario card |
| `screenshots/01-landing-hero.png` | 1080 × 1920 | The landing page hero |
| `screenshots/02-velocity-liquidation-estimate.png` | 1080 × 1920 | Live Velocity mainnet example: observation time and per-position liquidation estimates (model cross-margin-hold-others-v1) |
| `screenshots/03-velocity-price-scenario.png` | 1080 × 1920 | The same account with a −10% shared price move applied |
| `screenshots/04-pacifica-positions.png` | 1080 × 1920 | Live Pacifica example: perpetual positions across index, equity, commodity and FX markets |
| `screenshots/05-saved-report.png` | 1080 × 1920 | A report saved on the device, with its dated explanation open |
| `screenshots/06-alerts-panel.png` | 1080 × 1920 | Live monitoring for the Velocity account, as a signed-out visitor sees it |

## Reviewer notes

```text reviewer-notes
No account is needed for the core flows: presets, live account reads and reports saved on the device.

To see a live Velocity mainnet position, open the app and tap "Explore live risk", or paste DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2 into the address field with Velocity selected and tap "Read account". It is a public account; its balances can change. For Pacifica, choose Pacifica and paste Ep1d8JdFw4FnB85XDgXGVabYutro4JzK285HQqW6TZE2.

"Use my wallet" is read-only. It asks the wallet for its public address through Wallet Standard, or Mobile Wallet Adapter on Android, and never requests a signature or a transaction.

Signed-in accounts can be deleted from inside the app. Tap My reports, scroll to Delete account at the bottom of the Saved perspectives dialog, tap "Delete account…", then confirm with "Delete account permanently". The account and all of its data are deleted and the app signs out.
```

## Before you submit

- Apply `supabase/migrations/20261007120000_delete_own_account.sql` to production. Until then, Delete account reports that deletion could not be confirmed and deletes nothing.
- Give the reviewer a way to test deletion. Email sign-up is off in production (`NEXT_PUBLIC_AUTH_EMAIL_READY` is not `true`), so either enable it or create a reviewer account and add its sign-in details in the Portal's reviewer notes.
- Optionally regenerate the screenshots from production once this branch is deployed (the default `--base-url`).
- Check that both example accounts still hold open positions; if not, pass `--velocity=<address>` or `--pacifica=<address>` to the script.
- Enter the support email in the Portal.
