import markets from './perp-markets.json';
import { isCanonicalProtocol } from './protocols';
import type { Position, Snapshot } from './types';

// Browser-safe market identities from the pinned SDKs and Pacifica's public /info.
// Pacifica's 76 perpetual identities were captured on 2026-09-12; spot is excluded.
// Pacifica indexes are stable Buffer-local identifiers, never API array offsets.
// When adding markets, append new indexes without renumbering existing entries.
// Entries describe identities, not current availability or verified oracle data.
export const CONFIGURED_PERP_MARKETS = { ...markets, jupiter: [
  { marketIndex: 0, market: 'SOL-PERP', asset: 'SOL' },
  { marketIndex: 1, market: 'ETH-PERP', asset: 'ETH' },
  { marketIndex: 2, market: 'BTC-PERP', asset: 'BTC' },
] };
export const SAMPLE_PERP_MARKETS = markets.velocity;

export function hasConfiguredPerpIdentity(position: Position, snapshot: Snapshot): boolean {
  const protocol = snapshot.protocol;
  if (protocol && !isCanonicalProtocol(protocol)) return false;
  if (protocol?.id === 'jupiter') return false; // Inventory-only until the capped payoff and prices are verified.
  const registry = markets[protocol?.id ?? 'velocity'];
  return Boolean(registry?.some((market) => market.marketIndex === position.marketIndex &&
    market.market === position.market && market.asset === position.asset));
}
