# Buffer on mobile and desktop

Buffer is a responsive, installable progressive web app. The same deployment serves the website, phone app, tablet app and desktop app. It does not include App Store, Play Store, Electron or native installer binaries.

## Install

- **iPhone / iPad:** Open the deployed HTTPS site in Safari, tap **Share → Add to Home Screen**, and enable **Open as Web App** if shown.
- **Android:** Open the site in Chrome or Edge. Use **Install Buffer** when the browser offers it, or the browser menu's **Install app / Add to Home screen** option.
- **Windows / macOS / Linux:** In Chrome or Edge, use the address bar install icon or browser menu. In supported macOS Safari versions, use **File → Add to Dock**.

The in-app install button appears only after the browser fires `beforeinstallprompt`. Other browsers receive instructions, not a simulated installer. In installed standalone mode, the guide shows the installed state. Browser support, engagement rules and enterprise policy affect installation availability.

## Offline behavior and privacy

After one successful online visit, the service worker prepares `/offline.html` and the original Buffer icon assets. Reopening `/` or `/app` without a connection serves this standalone sample. Its SOL-long/BTC-short fixture supports −20% to +20% price moves, presets, keyboard input, one-percent minus/plus steps, and reset. All prices are fixed, all claims explicitly say sample, and the page makes no account or network requests.

The worker uses an explicit seven-file public allowlist. It never caches live page HTML, React Server Component payloads, API responses, RPC calls, Supabase requests, authentication, wallet addresses, access tokens or saved reports. Other routes do not receive cached private data or a simulated sign-in. Existing live screens display a disconnected notice when the browser goes offline. Their current in-memory content is not converted into offline sample data.

The standalone fixture uses integer coefficients equivalent to the core formula for its specific values. For example, a −10% shared move produces −1,500 USDC on 100 SOL at 150 USDC and +5,000 USDC on −0.5 BTC at 100,000 USDC: +3,500 USDC total. It excludes funding, fees, collateral, debt, orders, margin changes and liquidation, just as the online scenario model does.

## Assets and integration

- `src/app/manifest.ts` generates `/manifest.webmanifest`, with `/app` as launch URL, standalone display and site-wide scope.
- `src/components/PwaClient.tsx` registers `/sw.js`, manages optional browser installation and exposes update/offline status. Mount it once in the root layout.
- `public/icons/icon.svg` is Buffer's refined gauge mark on blue, derived from `public/brand/favicon.svg`; PNG exports are 192px, 512px, and 180px for Apple devices.
- `public/icons/icon-maskable.svg` places the same mark inside the maskable safe circle; dedicated 192px and 512px PNG versions fill the entire icon background.
- Root metadata should include the Apple 180px icon and `appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Buffer' }`; viewport metadata should use `themeColor: '#315fe8'` and `viewportFit: 'cover'`.
- Serve `/sw.js` with JavaScript content type, `Cache-Control: no-cache, no-store, must-revalidate`, and `Service-Worker-Allowed: /`.

Service workers require HTTPS in production; localhost works for development. No PWA secrets, push keys or notification permissions are required because Buffer does not send push notifications.

## Updates

New workers wait while a previous version is in use. The app offers **Update app**, explains that unsaved scenarios will reset, then activates the worker and reloads only after that button is pressed. When changing offline assets or their behavior, increment `CACHE_NAME` in `public/sw.js`. Activation deletes only older Buffer public caches, preserving unrelated origin caches.

## Verification

Run `npm run test:e2e -- e2e/pwa.spec.ts`. Tests cover manifest and PNG dimensions, real service-worker activation, offline navigation, bounded fixture calculations, keyboard controls, public-cache contents, private-request bypass, and install guidance. The offline page and install controls have keyboard focus outlines, 44px controls, safe-area padding, narrow-screen layouts and no required animation.

Automated Chromium tests verify browser behavior, not an actual user installing on physical iOS/Android/macOS devices. Manual device installation remains a separate release check.

## References

Implementation follows the [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps), [Next.js manifest convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest), [MDN service-worker guidance](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) and [MDN install-prompt event guidance](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event). Browser documentation was checked September 11, 2026, together with the installed Next.js 16.3.4 documentation.
