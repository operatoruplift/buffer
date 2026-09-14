import Decimal from 'decimal.js';
import { CONFIGURED_PERP_MARKETS } from './perp-markets';
import { isCanonicalProtocol, PROTOCOLS } from './protocols';
import fixtures from './sample-prices.json';
import type { Position, Snapshot } from './types';

export const DEFAULT_SAMPLE_ID = 'portfolio';
export const SAMPLE_QUOTES = ['USDC', 'USDT', 'USD'] as const;
export type SampleQuote = typeof SAMPLE_QUOTES[number];
export type SampleSide = 'long' | 'short';
export type SamplePerpInput = { side: SampleSide; quantity: string; price: string };

const D = Decimal.clone({ precision: 80, toExpNeg: -100, toExpPos: 100 });
const prices: Readonly<Record<string, string>> = fixtures.prices;

/** Historical, editable fixtures. These prices never serve as a live-read fallback. */
export const SAMPLE_MARKET_CATALOG = CONFIGURED_PERP_MARKETS.pacifica.map(market => ({
  ...market,
  price: prices[market.asset],
}));

const FIXTURE_REASON = 'Editable reference price. No live oracle was read.';

function positiveDecimal(value: string, label: string): string {
  if (!/^\d{1,18}(?:\.\d{1,18})?$/.test(value) || new D(value).lessThanOrEqualTo(0)) {
    throw new Error(`${label} must be greater than zero, with up to 18 digits before and after the decimal point.`);
  }
  return new D(value).toFixed();
}

function sampleQuote(value: string): SampleQuote {
  if (!SAMPLE_QUOTES.some(quote => quote === value)) throw new Error('Choose USDC, USDT, or USD for this portfolio.');
  return value as SampleQuote;
}

function fixtureMetrics(positions: Position[], quote: SampleQuote): Snapshot['metrics'] {
  let long = new D(0);
  let short = new D(0);
  for (const position of positions) {
    if (!position.modeled || position.exclusionReason || !position.oracle.valid ||
        position.quote !== quote || !/^-?\d+(?:\.\d+)?$/.test(position.size) ||
        !position.price || !/^\d+(?:\.\d+)?$/.test(position.price)) continue;
    const notional = new D(position.size).times(position.price).abs();
    if (new D(position.size).isNegative()) short = short.plus(notional);
    else long = long.plus(notional);
  }
  return [
    { label: 'Gross notional', value: long.plus(short).toFixed(), unit: quote, explanation: 'Modeled positions only; excluded positions omitted. Absolute quantity × baseline price in this denomination; exposure, not equity.' },
    { label: 'Long notional', value: long.toFixed(), unit: quote, explanation: 'Modeled positions only; excluded positions omitted. Long exposure stays fixed when you move the scenario slider.' },
    { label: 'Short notional', value: short.toFixed(), unit: quote, explanation: 'Modeled positions only; excluded positions omitted. Absolute short exposure; no collateral or margin health is assumed.' },
  ];
}

function makePosition(asset: string, input: SamplePerpInput, quote: SampleQuote): Position {
  const market = SAMPLE_MARKET_CATALOG.find(entry => entry.asset === asset);
  if (!market) throw new Error('Choose a perpetual from the market catalog.');
  if (input.side !== 'long' && input.side !== 'short') throw new Error('Choose Long or Short.');
  const quantity = positiveDecimal(input.quantity, 'Quantity');
  const price = positiveDecimal(input.price, 'Baseline price');
  return {
    id: `sample-perp-${asset}`, marketIndex: market.marketIndex, market: market.market, asset,
    size: input.side === 'short' ? `-${quantity}` : quantity,
    price, quote, notional: new D(quantity).times(price).toFixed(),
    modeled: true, exclusionReason: null, isolated: false,
    oracle: { slot: null, readSlot: null, valid: true, reason: FIXTURE_REASON },
  };
}

/** A new detached portfolio; neither this factory nor the editor reads a provider. */
export function getPortfolioSampleSnapshot(): Snapshot {
  const positions = [
    makePosition('SOL', { side: 'long', quantity: '100', price: '150' }, 'USDC'),
    makePosition('BTC', { side: 'short', quantity: '0.5', price: '100000' }, 'USDC'),
    makePosition('ETH', { side: 'long', quantity: '8', price: '2500' }, 'USDC'),
    makePosition('XRP', { side: 'long', quantity: '2500', price: '2' }, 'USDC'),
  ];
  return {
    protocol: { ...PROTOCOLS.pacifica }, source: 'sample', network: 'fixture', authority: null,
    sampleName: 'Four-market portfolio', subaccount: { id: 0, name: 'Four-market portfolio', address: null },
    retrievedAt: fixtures.capturedAt, expiresAt: null, accountSlot: null, observedSlot: null,
    positions,
    metrics: fixtureMetrics(positions, 'USDC'), spots: [], orders: [], inventoryAvailable: true,
    warnings: ['Preset portfolio: all quantities and baseline prices are editable fixtures. No account, collateral balance, or trade is created.'],
    provenance: [
      'Buffer portfolio builder. No wallet address, live account, or RPC slot is associated with this fixture.',
      'The catalog uses the 76 configured Pacifica perpetual identities. Its protocol metadata identifies the catalog, not a live Pacifica account.',
      `Newly added market defaults are frozen from ${fixtures.source} at ${fixtures.capturedAt}; SOL, BTC, ETH, and XRP use round illustrative values. Existing presets retain their illustrative prices; edited prices are user-supplied fixtures.`,
      'USDC, USDT, and USD are illustrative denominations. Changing denomination preserves numeric inputs, performs no currency conversion, and does not assert venue settlement support.',
    ],
  };
}

function editableSnapshot(snapshot: Snapshot): Snapshot {
  if (snapshot.source !== 'sample' || snapshot.network !== 'fixture' || snapshot.authority !== null ||
      (snapshot.protocol && !isCanonicalProtocol(snapshot.protocol))) {
    throw new Error('Only preset portfolios can be edited. Live account snapshots cannot be changed here.');
  }
  const next = structuredClone(snapshot);
  next.protocol = { ...PROTOCOLS.pacifica };
  next.sampleName = 'Custom portfolio';
  next.subaccount = { id: 0, name: 'Custom portfolio', address: null };
  next.accountSlot = null;
  next.observedSlot = null;
  next.expiresAt = null;
  const baseline = getPortfolioSampleSnapshot();
  next.warnings = baseline.warnings;
  next.provenance = baseline.provenance;
  // Existing fixtures use Velocity indexes. Remap complete known identities to
  // the sample catalog; preserve intentionally unsupported positions as excluded.
  next.positions = next.positions.map(position => {
    const market = SAMPLE_MARKET_CATALOG.find(entry => entry.asset === position.asset && entry.market === position.market);
    if (!market) return { ...position, modeled: false, exclusionReason: position.exclusionReason ?? 'This market is outside the configured catalog.' };
    return { ...position, marketIndex: market.marketIndex };
  });
  return next;
}

export function getSampleQuote(snapshot: Snapshot): SampleQuote {
  const quote = snapshot.positions[0]?.quote ?? snapshot.metrics.find(metric => metric.label === 'Gross notional')?.unit ?? 'USDC';
  return SAMPLE_QUOTES.some(value => value === quote) ? quote as SampleQuote : 'USDC';
}

export function setSampleQuote(snapshot: Snapshot, value: string): Snapshot {
  const quote = sampleQuote(value);
  const next = editableSnapshot(snapshot);
  next.positions = next.positions.map(position => ({ ...position, quote }));
  next.metrics = fixtureMetrics(next.positions, quote);
  // Existing fixture inventory is intentionally kept outside the price model;
  // its currencies and amounts are not silently converted by this selector.
  return next;
}

export function addSamplePerp(snapshot: Snapshot, asset: string, value = getSampleQuote(snapshot)): Snapshot {
  const next = editableSnapshot(snapshot);
  if (next.positions.some(position => position.asset === asset)) throw new Error('This perpetual is already in your portfolio. Edit its existing position.');
  const market = SAMPLE_MARKET_CATALOG.find(entry => entry.asset === asset);
  if (!market) throw new Error('Choose a perpetual from the market catalog.');
  next.positions.push(makePosition(asset, { side: 'long', quantity: '1', price: market.price }, sampleQuote(value)));
  next.metrics = fixtureMetrics(next.positions, sampleQuote(value));
  return next;
}

export function updateSamplePerp(snapshot: Snapshot, id: string, input: SamplePerpInput): Snapshot {
  const next = editableSnapshot(snapshot);
  const index = next.positions.findIndex(position => position.id === id);
  if (index < 0) throw new Error('This position is no longer in your portfolio.');
  const position = next.positions[index];
  next.positions[index] = { ...makePosition(position.asset, input, sampleQuote(position.quote)), id: position.id };
  next.metrics = fixtureMetrics(next.positions, getSampleQuote(snapshot));
  return next;
}

export function removeSamplePerp(snapshot: Snapshot, id: string): Snapshot {
  const next = editableSnapshot(snapshot);
  if (!next.positions.some(position => position.id === id)) throw new Error('This position is no longer in your portfolio.');
  next.positions = next.positions.filter(position => position.id !== id);
  next.metrics = fixtureMetrics(next.positions, getSampleQuote(snapshot));
  return next;
}
