# Seeker and PWA readiness

This branch makes Buffer run as an installed app on Android, iOS and the Solana Seeker, and ships the Android shell the Solana Mobile hackathon and dApp Store need. Everything below was lint-, type- and build-checked; the on-device steps still need a phone.

## What changed

- `src/components/WalletAddressButton.tsx` adds **Use my wallet** under the address field. It connects through Wallet Standard (`@wallet-standard/app`), reads the wallet's public address and runs the same `readAccount` path as pasting. Nothing is ever signed; Buffer stays read-only.
- `src/components/MobileWallet.tsx` registers the Solana Mobile Wallet Adapter so that button can hand off to Seed Vault Wallet, Phantom or Solflare on Android and Seeker. With exactly one wallet available it connects immediately; with several it shows a small chooser.
- `next.config.ts` allows `ws://localhost:*` in `connect-src` for the MWA handoff.
- `android/` is a Solana Mobile Web Shell project (`com.operatoruplift.buffer`) wrapping `/app`.
- The PWA (manifest, `public/sw.js`, `PwaClient`, safe-area viewport) was already complete and is untouched.

## Test on a phone (no APK needed)

1. Open https://bufferonsolana.vercel.app in Chrome on Android or Seeker. Use the browser menu → **Install app**, or the in-page install control where one exists. On iPhone use Safari → Share → **Add to Home Screen**.
2. Launch from the home screen. The app should open full-screen with the status bar in the theme colour and content clear of the notch and gesture bar.
3. Wallet: Open `/app`, pick a protocol and tap **Use my wallet**. On Seeker the phone's wallet chooser opens; approving fills the address and reads the account. Nothing is signed.
4. Offline: turn on airplane mode and relaunch. Static assets and the shell load from cache; live data shows its normal unavailable state rather than a browser error.

Mobile Wallet Adapter registers itself only on Android in a secure context (or inside the Web Shell). Desktop, iOS and in-wallet browsers keep their injected wallets; nothing changes for them.

## Build the Android APK

The shell in `android/` was generated with `@solana-mobile/webshell-cli`, which the Solana Mobile docs now recommend over Bubblewrap. It wraps `https://bufferonsolana.vercel.app/app` in a WebView with native wallet-intent handling, so the deployed site is the app: redeploying the web app updates the app without a new APK.

Prerequisites: Node 24+, `adb`, and about 2 GB of disk for the Android SDK. The CLI installs a managed JDK 17 and the SDK packages it needs on the first `build` (`doctor --fix` does the same without building).

```bash
npm install -g @solana-mobile/webshell-cli
cd android

# First build only: choose a release keystore. The CLI creates it if the file
# does not exist. Keep it and its passwords outside the repo; losing it means
# you can never update the app on the dApp Store.
export WEB_SHELL_KEYSTORE_PASSWORD='...'
export WEB_SHELL_KEY_PASSWORD='...'
webshell build . --keystore-path ~/keys/buffer-release.keystore --keystore-alias buffer

adb install -r app/build/outputs/apk/release/app-release.apk
```

Bump `--version-code` on every release (`webshell init . --force --version-code 2 --version-name 1.1.0` rewrites `gradle.properties`; the URL, id and icons are already recorded in `twa-manifest.json`).

## Publish on the Solana dApp Store

Winners must list on the dApp Store to claim CLOCK IN prizes, and the listing is the distribution channel for every Seeker owner.

- Register at the Publisher Portal (https://docs.solanamobile.com/dapp-publishing/intro): KYC/KYB, and a publisher wallet holding about 0.2 SOL. That wallet signs every future update, so treat it like the keystore.
- Signing key: a **new** key never used on Google Play. The keystore above qualifies.
- Assets: the 512×512 icon (`icons/icon-512.png` or equivalent here), a 1200×600 banner, and at least four phone screenshots.
- Submit the release APK; review currently takes 3–5 business days. Updates go through the `dapp-store` CLI with the same publisher wallet.

## Decisions to make before the first publish

- **Application ID is permanent.** This shell uses `com.operatoruplift.buffer`. Change it now (`webshell init . --force --application-id ...`) or never.
- **Host is pinned.** The shell keeps navigation on `bufferonsolana.vercel.app` and opens other hosts in the system browser. Moving to a custom domain later needs a rebuild but keeps the application ID.
- **Deep links.** The shell opens the start URL; if you want `/rwa?mint=...`-style links to open the app, add an intent filter for the host in `android/app/src/main/AndroidManifest.xml`.

## CLOCK IN checklist (Solana Mobile × RadiantsDAO, closes 8 October 2026)

- [ ] Release APK built with the steps above and installed on a Seeker or Android device
- [ ] Public GitHub repo (this one), with this branch merged
- [ ] Demo video showing the install, the wallet handoff and the core flow on a phone
- [ ] Pitch deck: problem, product, why mobile-first, traction, team
- [ ] Optional SKR integration for the separate $10K SKR prize
