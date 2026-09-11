import 'server-only';
import type { ProtocolId } from '../lib/protocols';
import type { LiveProvider } from './boundary';

// Load only the selected official SDK. Both deployment IDs are fixed server-side.
export async function resolveProvider(protocol: ProtocolId): Promise<LiveProvider> {
  if (protocol === 'drift') return (await import('./drift')).liveProvider;
  return (await import('./velocity')).velocityProvider;
}
