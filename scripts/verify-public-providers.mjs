/** Optional read-only production probe. Never run implicitly in unit tests. */
const cases = [
  ['velocity', 'DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2', 'USDT'],
  ['pacifica', 'Ep1d8JdFw4FnB85XDgXGVabYutro4JzK285HQqW6TZE2', 'USD'],
];
let failed = false;
for (const [protocol, authority, quote] of cases) {
  try {
    const url = new URL('/api/snapshot', 'https://bufferonsolana.vercel.app');
    url.search = new URLSearchParams({ protocol, authority, subaccount: '0' }).toString();
    const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('Empty provider response');
    const reader = response.body.getReader(); const chunks = []; let length = 0;
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 1_048_576) { await reader.cancel(); throw new Error('Response exceeded the probe bound'); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const snapshot = JSON.parse(new TextDecoder().decode(bytes));
    const observed = Date.parse(snapshot.retrievedAt);
    if (snapshot.source !== 'live' || snapshot.network !== 'mainnet-beta' || snapshot.protocol?.id !== protocol ||
        snapshot.authority !== authority || snapshot.subaccount?.id !== 0 || !Number.isFinite(observed) ||
        observed > Date.now() + 5000 || Date.now() - observed >= 120000 ||
        !Number.isFinite(Date.parse(snapshot.expiresAt)) || Date.parse(snapshot.expiresAt) <= Date.now() ||
        !Array.isArray(snapshot.positions) || snapshot.positions.length > 128 ||
        snapshot.positions.some(position => position.quote !== quote || typeof position.modeled !== 'boolean')) {
      throw new Error('Provider snapshot failed identity, freshness or coverage checks');
    }
    console.log(JSON.stringify({ protocol, result: 'PASS', observedAt: snapshot.retrievedAt, positions: snapshot.positions.length, quote }));
  } catch (error) {
    failed = true;
    console.error(JSON.stringify({ protocol, result: 'UNAVAILABLE', reason: error instanceof Error ? error.message : 'Provider probe failed' }));
  }
}
process.exitCode = failed ? 1 : 0;
