import { PublicKey } from '@solana/web3.js';
import type { ApiError, Discovery, Snapshot } from '../lib/types';

export class ProviderFailure extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 502, public readonly retryable = true) {
    super(message);
    this.name = 'ProviderFailure';
  }
}

export function validateAuthority(input: string | null): string {
  const value = input?.trim();
  if (!value || value.length < 32 || value.length > 44) {
    throw new ProviderFailure('INVALID_ADDRESS', 'Enter a valid Solana public wallet address.', 400, false);
  }
  try {
    const key = new PublicKey(value);
    if (key.toBase58() !== value) throw new Error('Noncanonical address');
    return value;
  } catch {
    throw new ProviderFailure('INVALID_ADDRESS', 'Enter a valid Solana public wallet address.', 400, false);
  }
}

export function validateSubaccount(input: string | null): number {
  if (input === null || !/^(0|[1-9]\d{0,4})$/.test(input) || Number(input) > 65535) {
    throw new ProviderFailure('INVALID_SUBACCOUNT', 'Select one Drift subaccount with an ID from 0 to 65535.', 400, false);
  }
  return Number(input);
}

export interface LiveProvider {
  discover(authority: string): Promise<Discovery>;
  snapshot(authority: string, subaccount: number): Promise<Snapshot>;
}

export function errorResponse(error: unknown): Response {
  const failure = error instanceof ProviderFailure ? error : new ProviderFailure('RPC_ERROR', 'The live data provider could not complete this read. Please retry.');
  const body: { error: ApiError } = { error: { code: failure.code, message: failure.message, retryable: failure.retryable } };
  return Response.json(body, { status: failure.status, headers: { 'Cache-Control': 'no-store' } });
}

// Per-process caps protect the fixed server RPC. No wallet addresses are retained.
let windowStarted = 0;
let readsInWindow = 0;
let concurrentReads = 0;
export async function serveRead(request: Request, kind: 'discovery' | 'snapshot', provider: LiveProvider): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const allowed = kind === 'snapshot' ? ['authority', 'subaccount'] : ['authority'];
    if ([...params.keys()].some((key) => !allowed.includes(key)) || allowed.some((key) => params.getAll(key).length > 1)) {
      throw new ProviderFailure('INVALID_QUERY', 'Only an authority and selected subaccount are accepted.', 400, false);
    }
    const authority = validateAuthority(params.get('authority'));
    const subaccount = kind === 'snapshot' ? validateSubaccount(params.get('subaccount')) : null;
    const now = Date.now();
    if (now - windowStarted >= 60_000) { windowStarted = now; readsInWindow = 0; }
    if (readsInWindow >= 60 || concurrentReads >= 4) {
      throw new ProviderFailure('RATE_LIMITED', 'Live reads are busy. Wait a moment and retry.', 429);
    }
    readsInWindow += 1;
    concurrentReads += 1;
    try {
      const result = subaccount === null ? await provider.discover(authority) : await provider.snapshot(authority, subaccount);
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } finally { concurrentReads -= 1; }
  } catch (error) { return errorResponse(error); }
}
