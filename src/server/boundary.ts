import { PublicKey } from '@solana/web3.js';
import type { ApiError, Discovery, Snapshot } from '../lib/types';
import type { ProtocolId } from '../lib/protocols';
import type { LiveNetwork } from '../lib/networks';
import { liveReadBudget } from './live-read-budget';
import { ProviderFailure } from './provider-failure';

export { ProviderFailure };

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
    throw new ProviderFailure('INVALID_SUBACCOUNT', 'Select one subaccount with an ID from 0 to 65535.', 400, false);
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

export function validateProtocol(value: string | null): ProtocolId {
  if (value === null || value === 'velocity') return 'velocity';
  if (value === 'jupiter') return 'jupiter';
  if (value === 'pacifica') return 'pacifica';
  if (value === 'drift') return 'drift';
  throw new ProviderFailure('INVALID_PROTOCOL', 'Choose Velocity, Pacifica, Jupiter Perps, or legacy Drift.', 400, false);
}

/** Devnet is offered for Velocity only; every other protocol reads mainnet or its public API. */
export function validateNetwork(value: string | null, protocol: ProtocolId): LiveNetwork {
  if (value === null || value === 'mainnet-beta') return 'mainnet-beta';
  if (value === 'devnet' && protocol === 'velocity') return 'devnet';
  throw new ProviderFailure('INVALID_NETWORK', value === 'devnet' ? 'Devnet reads are available for Velocity only.' : 'Choose Solana mainnet or, for Velocity, devnet.', 400, false);
}

export async function serveRead(request: Request, kind: 'discovery' | 'snapshot', provider: LiveProvider | ((protocol: ProtocolId, network: LiveNetwork) => Promise<LiveProvider>)): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const allowed = kind === 'snapshot' ? ['authority', 'subaccount', 'protocol', 'network'] : ['authority', 'protocol', 'network'];
    if ([...params.keys()].some((key) => !allowed.includes(key)) || allowed.some((key) => params.getAll(key).length > 1)) {
      throw new ProviderFailure('INVALID_QUERY', 'Only a supported protocol, network, authority, and selected subaccount are accepted.', 400, false);
    }
    const authority = validateAuthority(params.get('authority'));
    const protocol = validateProtocol(params.get('protocol'));
    const network = validateNetwork(params.get('network'), protocol);
    const subaccount = kind === 'snapshot' ? validateSubaccount(params.get('subaccount')) : null;
    // Cached for five seconds per identical request, then limited per client and per instance (see live-read-budget.ts).
    const result: Discovery | Snapshot = await liveReadBudget.read(request, { kind, protocol, network, authority, subaccount }, async () => {
      const selected = typeof provider === 'function' ? await provider(protocol, network) : provider;
      return subaccount === null ? selected.discover(authority) : selected.snapshot(authority, subaccount);
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
