import type { Position, Snapshot } from './types';
import { DEFAULT_SAMPLE_ID, getPortfolioSampleSnapshot } from './sample-builder';

export const SAMPLE_ACCOUNTS = [
  { id: 'sol-long', name: 'SOL long', description: 'One position. A clear place to start.' },
  { id: 'long-short', name: 'Long + short', description: 'SOL long and BTC short. Two sides of a move.' },
  { id: 'partial-coverage', name: 'Partial coverage', description: 'An excluded perpetual, collateral, debt, and open orders.' },
  { id: 'btc-long', name: 'BTC long', description: 'A Bitcoin position. Fixed sample prices.' },
  { id: 'eth-long', name: 'ETH long', description: 'An Ethereum position. Fixed sample prices.' },
  { id: 'hype-long', name: 'HYPE long', description: 'Explore Hyperliquid token exposure with fixed sample prices.' },
  { id: 'sol-short', name: 'SOL short', description: 'See how a Solana short responds to a move.' },
  { id: 'btc-short', name: 'BTC short', description: 'See how a Bitcoin short responds to a move.' },
  { id: 'eth-short', name: 'ETH short', description: 'See how an Ethereum short responds to a move.' },
  { id: 'hype-short', name: 'HYPE short', description: 'See how a HYPE short responds to a move.' },
  { id: 'market-basket', name: 'Four-market basket', description: 'SOL, BTC, ETH, and HYPE longs in one USDT scenario.' },
  { id: 'hedged-basket', name: 'Mixed four-market basket', description: 'SOL and ETH longs; BTC and HYPE shorts.' },
  { id: DEFAULT_SAMPLE_ID, name: 'Four-market portfolio', description: 'SOL, BTC, ETH, and XRP. Add more perps and edit your own sample.' },
];

const FIXTURE_TIME = '2026-09-11T12:00:00.000Z';
type SampleAsset = 'SOL' | 'BTC' | 'ETH' | 'HYPE';
const FIXTURE_MARKETS: Record<SampleAsset, { index: number; size: string; price: string; notional: string }> = {
  SOL: { index: 0, size: '100', price: '150', notional: '15000' },
  BTC: { index: 1, size: '0.2', price: '100000', notional: '20000' },
  ETH: { index: 2, size: '8', price: '2500', notional: '20000' },
  HYPE: { index: 3, size: '500', price: '40', notional: '20000' },
};
const SINGLE_MARKET_SAMPLES: Record<string, { asset: SampleAsset; short: boolean }> = {
  'btc-long': { asset: 'BTC', short: false },
  'eth-long': { asset: 'ETH', short: false },
  'hype-long': { asset: 'HYPE', short: false },
  'sol-short': { asset: 'SOL', short: true },
  'btc-short': { asset: 'BTC', short: true },
  'eth-short': { asset: 'ETH', short: true },
  'hype-short': { asset: 'HYPE', short: true },
};

function position(asset: SampleAsset, size: string, price: string, notional: string, quote = 'USDC'): Position {
  return {
    id: `fixture-${asset.toLowerCase()}`, marketIndex: FIXTURE_MARKETS[asset].index,
    market: `${asset}-PERP`, asset, size, price, quote, notional,
    modeled: true, exclusionReason: null, isolated: false,
    oracle: { slot: null, readSlot: null, valid: true, reason: 'Deterministic sample price; no live oracle was read.' },
  };
}

export function getSampleSnapshot(id: string): Snapshot {
  if (id === DEFAULT_SAMPLE_ID) return getPortfolioSampleSnapshot();
  const sample = SAMPLE_ACCOUNTS.find((account) => account.id === id);
  if (!sample) throw new Error('Unknown sample account. Choose one of the listed samples.');
  const expanded = Boolean(SINGLE_MARKET_SAMPLES[id]) || id === 'market-basket' || id === 'hedged-basket';
  const quote = expanded ? 'USDT' : 'USDC';
  let positions = [position('SOL', '100', '150', '15000')];
  const single = SINGLE_MARKET_SAMPLES[id];
  if (single) {
    const market = FIXTURE_MARKETS[single.asset];
    positions = [position(single.asset, `${single.short ? '-' : ''}${market.size}`, market.price, market.notional, quote)];
  } else if (id === 'market-basket' || id === 'hedged-basket') {
    positions = (Object.keys(FIXTURE_MARKETS) as SampleAsset[]).map((asset) => {
      const market = FIXTURE_MARKETS[asset];
      const short = id === 'hedged-basket' && (asset === 'BTC' || asset === 'HYPE');
      return position(asset, `${short ? '-' : ''}${market.size}`, market.price, market.notional, quote);
    });
  }
  if (id === 'long-short' || id === 'partial-coverage') positions.push(position('BTC', '-0.5', '100000', '50000'));
  if (id === 'partial-coverage') positions.push({
    id: 'fixture-unsupported', marketIndex: -1, market: 'OTHER-PERP', asset: 'OTHER',
    size: '250', price: '4', quote: 'USDC', notional: '1000',
    modeled: false, exclusionReason: 'Sample unsupported market; only verified linear perpetuals are modeled.',
    isolated: false, oracle: { slot: null, readSlot: null, valid: true, reason: 'Deterministic sample price; no live oracle was read.' },
  });
  return {
    source: 'sample', network: 'fixture', authority: null, sampleName: sample.name,
    subaccount: { id: 0, name: sample.name, address: null },
    retrievedAt: FIXTURE_TIME, expiresAt: null, accountSlot: null, observedSlot: null,
    metrics: [
      { label: 'Net USD value', value: id === 'sol-long' ? '12000' : id === 'partial-coverage' ? '34375' : '30000', unit: 'USD', explanation: 'Illustrative fixture metric. Not calculated from a live account.' },
      { label: 'Unrealized perp P&L', value: id === 'sol-long' ? '650' : '1250', unit: quote, explanation: 'Illustrative baseline fixture. Separate from the incremental scenario result.' },
      { label: 'Cross-margin health', value: id === 'sol-long' ? '83' : '76', unit: '%', explanation: 'Illustrative fixture metric. The slider does not recalculate protocol health.' },
    ],
    positions,
    spots: id === 'partial-coverage'
      ? [{ market: 'USDC', kind: 'Collateral', amount: '35000' }, { market: 'SOL', kind: 'Debt', amount: '12.5' }]
      : [{ market: quote, kind: 'Collateral', amount: id === 'sol-long' ? '11350' : '28750' }],
    orders: id === 'partial-coverage'
      ? [{ market: 'SOL-PERP', count: 2 }, { market: 'BTC-PERP', count: 1 }, { market: 'SOL', count: 1 }]
      : [],
    inventoryAvailable: true,
    warnings: ['Sample account: all positions, prices, inventory, and baseline metrics are deterministic fixtures.'],
    provenance: [
      'Buffer built-in sample provider. No public wallet address, on-chain account, or RPC slot is associated with this fixture.',
      'Fixture values are fixed at 2026-09-11 12:00 UTC for reproducible demonstrations.',
      'Sample labels and market indices are fixture identifiers, not evidence of a decoded mainnet market.',
    ],
  };
}
