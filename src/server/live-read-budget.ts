import { createHash } from 'node:crypto';
import { clientKey, consumeSharedLimit, type SharedLimit } from '@/server/rate-limit';
import { ProviderFailure } from './provider-failure';

/**
 * The budget for live account reads, applied after validation and before the provider.
 *
 * 1. A five-second cache keyed by a digest of the normalised request (kind, protocol,
 *    network, authority, subaccount). Identical reads, concurrent ones included, share one
 *    provider call and consume no budget, so a reviewer tapping Explore live risk twice is
 *    never refused. A failed read is not cached.
 * 2. The per-client limit is the primary control: 30 reads a minute per client address,
 *    counted in the shared store across every instance when it is configured and in this
 *    process when it is not.
 * 3. A per-instance ceiling, 240 reads a minute and 8 in flight, protects the fixed RPC from
 *    many clients at once. Two clients cannot exhaust it on their own.
 *
 * Every key is a digest. No wallet address or client address is retained.
 */
export const LIVE_READ_LIMITS = Object.freeze({
  clientPerMinute: 30,
  instancePerMinute: 240,
  instanceConcurrent: 8,
  cacheMs: 5_000,
  windowMs: 60_000,
  trackedClients: 4_096,
  cachedReads: 1_024,
});
export type LiveReadLimits = typeof LIVE_READ_LIMITS;
export interface LiveReadIdentity { kind: 'discovery' | 'snapshot'; protocol: string; network: string; authority: string; subaccount: number | null }
export interface LiveReadBudget {
  /** Runs `read` once per identical request within the cache window, inside the limits. */
  read<T>(request: Request, identity: LiveReadIdentity, read: () => Promise<T>): Promise<T>;
  /** Forgets every window and cached read. For tests. */
  reset(): void;
}
interface Options {
  now?: () => number;
  sharedLimit?: (request: Request, scope: string, limit: number) => Promise<SharedLimit | null>;
  limits?: Partial<LiveReadLimits>;
}
type Window = { startedAt: number; count: number };
type Cached = { expiresAt: number; result: Promise<unknown> };

export function liveReadCacheKey(identity: LiveReadIdentity): string {
  return createHash('sha256').update(JSON.stringify([identity.kind, identity.protocol, identity.network, identity.authority, identity.subaccount])).digest('hex');
}
const refuseClient = () => new ProviderFailure('RATE_LIMITED', 'Too many live reads from this connection. Wait a moment and retry.', 429);
const refuseInstance = () => new ProviderFailure('RATE_LIMITED', 'Live reads are busy. Wait a moment and retry.', 429);

/** One more request in a minute window: a fresh window when the old one ended, counted only when admitted. */
function admit(window: Window | undefined, limit: number, windowMs: number, at: number): { window: Window; allowed: boolean } {
  const current = !window || at - window.startedAt >= windowMs ? { startedAt: at, count: 0 } : window;
  const allowed = current.count < limit;
  return { window: allowed ? { ...current, count: current.count + 1 } : current, allowed };
}

export function createLiveReadBudget(options: Options = {}): LiveReadBudget {
  const now = options.now ?? Date.now;
  const sharedLimit = options.sharedLimit ?? consumeSharedLimit;
  const limits: LiveReadLimits = { ...LIVE_READ_LIMITS, ...options.limits };
  const cache = new Map<string, Cached>();
  const clients = new Map<string, Window>();
  let instance: Window = { startedAt: 0, count: 0 };
  let inFlight = 0;

  function forgetIdleClients(at: number) {
    for (const [key, window] of clients) if (at - window.startedAt >= limits.windowMs) clients.delete(key);
    // Still full after a minute's worth of pruning: drop the longest-tracked client. Windows last a minute, so nothing of value is lost.
    while (clients.size >= limits.trackedClients) clients.delete(clients.keys().next().value as string);
  }
  function forgetExpiredReads(at: number) {
    for (const [key, entry] of cache) if (entry.expiresAt <= at) cache.delete(key);
  }
  /** The local per-client window, used only when the shared store gives no answer. */
  function admitClientLocally(request: Request, at: number): boolean {
    const key = clientKey(request, 'live-read');
    if (!clients.has(key) && clients.size >= limits.trackedClients) forgetIdleClients(at);
    const next = admit(clients.get(key), limits.clientPerMinute, limits.windowMs, at);
    clients.set(key, next.window);
    return next.allowed;
  }
  async function guarded<T>(request: Request, read: () => Promise<T>): Promise<T> {
    const shared = await sharedLimit(request, 'live-read', limits.clientPerMinute);
    if (shared ? !shared.allowed : !admitClientLocally(request, now())) throw refuseClient();
    const admitted = admit(instance, limits.instancePerMinute, limits.windowMs, now());
    instance = admitted.window;
    if (!admitted.allowed || inFlight >= limits.instanceConcurrent) throw refuseInstance();
    inFlight += 1;
    try { return await read(); } finally { inFlight -= 1; }
  }
  return {
    read<T>(request: Request, identity: LiveReadIdentity, read: () => Promise<T>): Promise<T> {
      const key = liveReadCacheKey(identity);
      const at = now();
      const hit = cache.get(key);
      if (hit && hit.expiresAt > at) return hit.result as Promise<T>;
      if (cache.size >= limits.cachedReads) forgetExpiredReads(at);
      const result = guarded(request, read);
      cache.set(key, { expiresAt: at + limits.cacheMs, result });
      result.catch(() => { if (cache.get(key)?.result === result) cache.delete(key); });
      return result;
    },
    reset() { cache.clear(); clients.clear(); instance = { startedAt: 0, count: 0 }; inFlight = 0; },
  };
}
/** The budget every live read route shares within this process. */
export const liveReadBudget = createLiveReadBudget();
