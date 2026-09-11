/* Buffer caches only this explicit public asset list. No account data enters Cache Storage. */
const CACHE_NAME = 'buffer-public-v1';
const OFFLINE_URL = '/offline.html';
const PUBLIC_ASSETS = [
  OFFLINE_URL,
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(
    PUBLIC_ASSETS.map((path) => new Request(path, { cache: 'reload', credentials: 'omit' })),
  )));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('buffer-public-') && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // In particular, leave RPC, Supabase, auth, API, Next RSC and mutation requests untouched.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (PUBLIC_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { cacheName: CACHE_NAME });
      return cached ?? fetch(request);
    })());
    return;
  }
  // Only public entry points receive a deterministic fallback, never cached live HTML.
  if (request.mode === 'navigate' && ['/', '/app', '/app/'].includes(url.pathname)) {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache: 'no-store' });
      } catch {
        return await caches.match(OFFLINE_URL, { cacheName: CACHE_NAME })
          ?? new Response('Buffer is offline. Reconnect and reload to prepare the sample.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
          });
      }
    })());
  }
});
