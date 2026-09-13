import 'server-only';
import { ProviderFailure } from './boundary';

/** Per response, in addition to the adapter's shared 18-second total deadline. */
export const MAX_RPC_RESPONSE_BYTES = 8 * 1024 * 1024;

/** Both pinned SDKs use this fixed-endpoint, bounded transport. No automatic retries. */
export function createRpcFetch(endpoint: string, requestSignal: AbortSignal, maxBytes = MAX_RPC_RESPONSE_BYTES): typeof fetch {
  const target = new URL(endpoint).href;
  return async (input, init) => {
    const inputUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (new URL(inputUrl).href !== target) throw new ProviderFailure('INVALID_CONFIGURATION', 'The RPC request did not match the configured endpoint.', 503, false);
    const signal = init?.signal ? AbortSignal.any([requestSignal, init.signal]) : requestSignal;
    try {
      signal.throwIfAborted();
      const response = await fetch(input, { ...init, signal, cache: 'no-store', redirect: 'error' });
      if (response.status === 429) {
        await response.body?.cancel();
        throw new ProviderFailure('RATE_LIMITED', 'The live data provider is busy. Wait a moment and retry.', 429);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderFailure('RPC_ERROR', 'The live data provider could not complete this read. Please retry.');
      }
      const declared = response.headers.get('content-length');
      if (declared !== null && Number(declared) > maxBytes) {
        await response.body?.cancel();
        throw new ProviderFailure('RESPONSE_TOO_LARGE', 'This account read exceeds the supported response limit.', 502, false);
      }
      if (!response.body) throw new ProviderFailure('RPC_ERROR', 'The live data provider returned an empty response. Please retry.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > maxBytes) throw new ProviderFailure('RESPONSE_TOO_LARGE', 'This account read exceeds the supported response limit.', 502, false);
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      // Reconstructed bytes are already decoded by fetch; do not forward encoding/length headers.
      return new Response(bytes, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof ProviderFailure) throw error;
      throw new ProviderFailure(signal.aborted ? 'TIMEOUT' : 'RPC_ERROR', signal.aborted ? 'The live read timed out. Please retry.' : 'The live RPC could not be reached. Please retry.', signal.aborted ? 504 : 502);
    }
  };
}
