import 'server-only';
import type { ProtocolId } from '../lib/protocols';
import type { LiveProvider } from './boundary';

// Load only the selected adapter. Deployment IDs and API origins are fixed server-side.
export async function resolveProvider(protocol: ProtocolId): Promise<LiveProvider> {
  if (protocol === 'jupiter') return (await import('./jupiter-provider')).jupiterLiveProvider;
  if (protocol === 'drift') return (await import('./drift')).liveProvider;
  if (protocol === 'pacifica') return (await import('./pacifica')).pacificaProvider;
  return (await import('./velocity')).velocityProvider;
}
