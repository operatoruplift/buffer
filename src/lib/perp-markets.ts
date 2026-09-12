import markets from './perp-markets.json';
import { PROTOCOLS } from './protocols';
import type { Position, Snapshot } from './types';

// Small, browser-safe projection of the pinned SDK registries. Provider tests
// compare this file's data with both SDKs so dependency changes cannot drift silently.
// Entries describe identities, not current availability or verified oracle data.
export const CONFIGURED_PERP_MARKETS = markets;
export const SAMPLE_PERP_MARKETS = markets.velocity;

export function hasConfiguredPerpIdentity(position: Position, snapshot: Snapshot): boolean {
  const protocol = snapshot.protocol;
  if (protocol && protocol.programId !== PROTOCOLS[protocol.id]?.programId) return false;
  const registry = snapshot.source === 'sample' ? SAMPLE_PERP_MARKETS : markets[protocol?.id ?? 'velocity'];
  return Boolean(registry?.some((market) => market.marketIndex === position.marketIndex &&
    market.market === position.market && market.asset === position.asset));
}
