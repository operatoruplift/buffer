import markets from './perp-markets.json';
import fixtures from './sample-prices.json';
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

/**
 * The fixed identity list the editable preset builder draws from. It names a
 * catalog of perpetual identities — never an account, a venue read, or a live
 * market — and is deliberately independent of the live Protocol selector.
 */
export interface PerpCatalogInfo {
  id: 'reference-perps';
  label: string;
  markets: number;
  capturedAt: string;
  source: string;
  explanation: string;
}

export const REFERENCE_PERP_MARKETS = markets.pacifica;
export const REFERENCE_PERP_CATALOG: PerpCatalogInfo = {
  id: 'reference-perps',
  label: 'Buffer reference perpetual catalog',
  markets: REFERENCE_PERP_MARKETS.length,
  capturedAt: fixtures.capturedAt,
  source: 'https://api.pacifica.fi/api/v1/info',
  explanation: 'A fixed catalog of perpetual identities and default reference prices for editable preset portfolios. It identifies the catalog and its capture, not an account, a venue read, or a live market, and it is the same for every preset and every protocol selection.',
};

/** Verify the catalog identity before modeling or rendering positions against it. */
export function isReferencePerpCatalog(value: unknown): value is PerpCatalogInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (Object.keys(REFERENCE_PERP_CATALOG) as (keyof PerpCatalogInfo)[])
    .every(key => candidate[key] === REFERENCE_PERP_CATALOG[key]) &&
    Object.keys(candidate).length === Object.keys(REFERENCE_PERP_CATALOG).length;
}

function registered(registry: readonly { marketIndex: number; market: string; asset: string }[], position: Position): boolean {
  return registry.some((market) => market.marketIndex === position.marketIndex &&
    market.market === position.market && market.asset === position.asset);
}

export function hasConfiguredPerpIdentity(position: Position, snapshot: Snapshot): boolean {
  const protocol = snapshot.protocol;
  if (protocol && !isCanonicalProtocol(protocol)) return false;
  if (snapshot.catalog) {
    // Editable preset portfolios verify identities against the reference catalog.
    // A catalog never applies to a live read or stands in for a protocol registry.
    if (snapshot.source !== 'sample' || protocol || !isReferencePerpCatalog(snapshot.catalog)) return false;
    return registered(REFERENCE_PERP_MARKETS, position);
  }
  if (protocol?.id === 'jupiter') return false; // Inventory-only until the capped payoff and prices are verified.
  const registry = markets[protocol?.id ?? 'velocity'];
  return Boolean(registry && registered(registry, position));
}
