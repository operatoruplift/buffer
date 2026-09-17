import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Cross-instance rate limiting for live reads.
 *
 * serveRead already keeps an in-process window, which on Vercel is per-lambda
 * and therefore not a limit under concurrency: forty parallel requests each
 * landed on a fresh instance and every one reached mainnet. When Supabase is
 * configured the count lives in Postgres behind a SECURITY DEFINER function
 * guarded by a server-held secret. Keys hash the client IP; no address is
 * stored. If the store is unreachable this returns null and the local window
 * still applies.
 */

const WINDOW_SECONDS = 60;
const TIMEOUT_MS = 1500;

export type SharedLimit = { allowed: boolean; retryAfterSeconds: number };

function config() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const secret = (process.env.RATE_LIMIT_SECRET ?? '').trim();
  return url && key && secret ? { url, key, secret } : null;
}

export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;
}

export async function consumeSharedLimit(request: Request, scope: string, limit: number): Promise<SharedLimit | null> {
  const shared = config();
  if (!shared) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${shared.url}/rest/v1/rpc/consume_rate_limit`, {
      method: 'POST',
      signal: controller.signal,
      headers: { apikey: shared.key, authorization: `Bearer ${shared.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_secret: shared.secret, p_key: clientKey(request, scope), p_limit: limit, p_window_seconds: WINDOW_SECONDS }),
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ allowed: boolean; retry_after: number }>;
    const row = rows[0];
    if (!row || typeof row.allowed !== 'boolean') return null;
    return { allowed: row.allowed, retryAfterSeconds: Math.max(1, Number(row.retry_after) || WINDOW_SECONDS) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
