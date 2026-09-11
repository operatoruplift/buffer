import type { Position, Snapshot } from './types';

export const SAMPLE_ACCOUNTS = [
  { id: 'sol-long', name: 'SOL long', description: 'One position. A clear place to start.' },
  { id: 'long-short', name: 'Long + short', description: 'SOL long and BTC short. Two sides of a move.' },
  { id: 'partial-coverage', name: 'Partial coverage', description: 'An excluded perpetual, collateral, debt, and open orders.' },
];

const FIXTURE_TIME = '2026-09-11T12:00:00.000Z';

function position(asset: 'SOL' | 'BTC', size: string, price: string, notional: string): Position {
  return {
    id: `fixture-${asset.toLowerCase()}`, marketIndex: asset === 'SOL' ? 0 : 1,
    market: `${asset}-PERP`, asset, size, price, quote: 'USDC', notional,
    modeled: true, exclusionReason: null, isolated: false,
    oracle: { slot: null, readSlot: null, valid: true, reason: 'Deterministic sample price; no live oracle was read.' },
  };
}

export function getSampleSnapshot(id: string): Snapshot {
  const sample = SAMPLE_ACCOUNTS.find((account) => account.id === id);
  if (!sample) throw new Error('Unknown sample account. Choose one of the listed samples.');
  const positions = [position('SOL', '100', '150', '15000')];
  if (id === 'long-short' || id === 'partial-coverage') positions.push(position('BTC', '-0.5', '100000', '50000'));
  if (id === 'partial-coverage') positions.push({
    id: 'fixture-unsupported', marketIndex: -1, market: 'OTHER-PERP', asset: 'OTHER',
    size: '250', price: '4', quote: 'USDC', notional: '1000',
    modeled: false, exclusionReason: 'Sample unsupported market; only verified SOL, BTC, and ETH linear perpetuals are modeled.',
    isolated: false, oracle: { slot: null, readSlot: null, valid: true, reason: 'Deterministic sample price; no live oracle was read.' },
  });
  return {
    source: 'sample', network: 'fixture', authority: null, sampleName: sample.name,
    subaccount: { id: 0, name: sample.name, address: null },
    retrievedAt: FIXTURE_TIME, expiresAt: null, accountSlot: null, observedSlot: null,
    metrics: [
      { label: 'Net USD value', value: id === 'sol-long' ? '12000' : id === 'partial-coverage' ? '34375' : '30000', unit: 'USD', explanation: 'Illustrative fixture metric. Not calculated from a live Drift account.' },
      { label: 'Unrealized perp P&L', value: id === 'sol-long' ? '650' : '1250', unit: 'USDC', explanation: 'Illustrative baseline fixture. Separate from the incremental scenario result.' },
      { label: 'Cross-margin health', value: id === 'sol-long' ? '83' : '76', unit: '%', explanation: 'Illustrative fixture metric. The slider does not recalculate protocol health.' },
    ],
    positions,
    spots: id === 'partial-coverage'
      ? [{ market: 'USDC', kind: 'Collateral', amount: '35000' }, { market: 'SOL', kind: 'Debt', amount: '12.5' }]
      : [{ market: 'USDC', kind: 'Collateral', amount: id === 'sol-long' ? '11350' : '28750' }],
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
