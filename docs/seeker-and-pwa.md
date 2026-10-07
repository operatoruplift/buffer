# Seeker and PWA readiness

Buffer supports browser installation as a PWA and includes an Android Web Shell project for Seeker and Android distribution. Web lint, type and build checks do not establish a signed APK release or physical-device compatibility; the on-device steps below still need a phone.

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
4. Offline: after a successful online visit, turn on airplane mode and reopen `/` or `/app`. The service worker serves the separate fixed-price offline scenario. It does not cache live page HTML, account data or authentication. An already-open live screen displays a disconnected notice. See [PWA behavior](PWA.md).

Mobile Wallet Adapter registers itself only on Android in a secure context (or inside the Web Shell). Desktop, iOS and in-wallet browsers keep their injected wallets; nothing changes for them.

## Build the Android APK

The shell in `android/` was generated with `@solana-mobile/webshell-cli`, which the Solana Mobile docs now recommend over Bubblewrap. It wraps `https://bufferonsolana.vercel.app/app` in a WebView with native wallet-intent handling, so the deployed site is the app: redeploying the web app updates the app without a new APK. The shell ships English resources only (`androidResources.localeFilters` in `android/app/build.gradle.kts`), so the APK declares one locale.

Prerequisites: JDK 21, the Android SDK with build-tools 36.1.0, and `adb`. Build with the Gradle wrapper; Gradle reads the signing values below and nothing else.

```bash
export JAVA_HOME=/usr/local/opt/openjdk@21 ANDROID_HOME=$HOME/Library/Android/sdk
cd android

# First release only: create the release keystore. Keep it and its passwords
# outside the repo. Losing it means you can never update the app on the dApp Store.
keytool -genkeypair -v -keystore $HOME/keys/buffer-release.keystore -alias buffer -keyalg RSA -keysize 4096 -validity 10000

WEB_SHELL_SIGNING_STORE_PASSWORD=… WEB_SHELL_SIGNING_KEY_PASSWORD=… ./gradlew --no-daemon assembleRelease -PWEB_SHELL_SIGNING_STORE_FILE=$HOME/keys/buffer-release.keystore -PWEB_SHELL_SIGNING_KEY_ALIAS=buffer

$ANDROID_HOME/build-tools/36.1.0/apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
adb install -r app/build/outputs/apk/release/app-release.apk
```

**A missing signing value does not fail the build.** Without the store file, store password or key alias, Gradle silently produces an unsigned `app-release-unsigned.apk`, which the dApp Store rejects. Always run the `apksigner verify` line before uploading. The key password falls back to the store password when it is not set.

Raise the version code on every release: set `WEB_SHELL_VERSION_CODE` and `WEB_SHELL_VERSION_NAME` in `android/gradle.properties`, or pass `-PWEB_SHELL_VERSION_CODE=2 -PWEB_SHELL_VERSION_NAME=1.1.0`. The URL, application ID and icons are already recorded in `gradle.properties` and `twa-manifest.json`.

## Publish on the Solana dApp Store

Winners must list on the dApp Store to claim CLOCK IN prizes, and the listing is the distribution channel for every Seeker owner. The store text, banner and screenshots are ready in [docs/dapp-store](dapp-store/listing.md).

- **Publisher Portal:** register at https://publish.solanamobile.com and complete KYC/KYB.
- **Publisher wallet:** connect a desktop browser-extension wallet, not a Ledger. Hold about 0.05 to 0.1 SOL for each release, plus ArDrive storage for the uploaded files. That wallet signs every future update, so treat it like the keystore.
- **Signing key:** a **new** key never used on Google Play. The keystore above qualifies. Upload a signed release APK only.
- **Text:** app name up to 25 characters, subtitle up to 30.
- **Assets:** the 512×512 icon (`public/icons/icon-512.png`), a banner of exactly 1200×600, and 4 to 8 portrait screenshots at least 1080 px wide.
- **Review** takes 3 to 5 business days. Every update needs a higher version code, the same signing key and the same publisher wallet.

## Decisions to make before the first publish

- **Application ID is permanent.** This shell uses `com.operatoruplift.buffer`. Change `WEB_SHELL_APPLICATION_ID` in `android/gradle.properties` now or never.
- **Host is pinned.** The shell keeps navigation on `bufferonsolana.vercel.app` and opens other hosts in the system browser. Moving to a custom domain later needs a rebuild but keeps the application ID.
- **Deep links.** The shell opens the start URL. To let a shared account link such as `https://bufferonsolana.vercel.app/app?protocol=velocity&authority=<public address>` open the app, add an intent filter for that host and the `/app` path in `android/app/src/main/AndroidManifest.xml`.

## CLOCK IN checklist (Solana Mobile × RadiantsDAO, closes 8 October 2026)

- [ ] Release APK built with the steps above and installed on a Seeker or Android device
- [ ] Public GitHub repo (this one), with this branch merged
- [ ] Demo video showing the install, the wallet handoff and the core flow on a phone
- [ ] Pitch deck: problem, product, why mobile-first, traction, team
- [ ] Optional SKR integration for the separate $10K SKR prize
