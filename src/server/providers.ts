import 'server-only';
import type { ProtocolId } from '../lib/protocols';
import type { LiveProvider } from './boundary';
import type { LiveNetwork } from '../lib/networks';

// Load only the selected adapter. Deployment IDs and API origins are fixed server-side.
export async function resolveProvider(protocol: ProtocolId, network: LiveNetwork = 'mainnet-beta'): Promise<LiveProvider> {
  // The boundary admits devnet for Velocity only; this keeps any other pairing on the checked path.
  if (network === 'devnet') return (await import('./velocity')).velocityProviderFor(protocol === 'velocity' ? 'devnet' : 'mainnet-beta');
  if (protocol === 'jupiter') return (await import('./jupiter-provider')).jupiterLiveProvider;
  if (protocol === 'drift') return (await import('./drift')).liveProvider;
  if (protocol === 'pacifica') return (await import('./pacifica')).pacificaProvider;
  return (await import('./velocity')).velocityProvider;
}
