import { expect, it } from 'vitest';
import { isDiscoveryResponse, isSnapshotResponse } from '../src/lib/live-response';
import { PROTOCOLS } from '../src/lib/protocols';
import { getSampleSnapshot } from '../src/lib/samples';
import { REFERENCE_PERP_CATALOG } from '../src/lib/perp-markets';
const authority = '11111111111111111111111111111111';
const account = { id: 0, name: 'Primary', address: authority };
const discovery = { authority, protocol: PROTOCOLS.velocity, retrievedAt: new Date().toISOString(), subaccounts: [account] };
const snapshot = () => ({ ...getSampleSnapshot('long-short'), source: 'live', network: 'mainnet-beta', sampleName: null, authority, protocol: PROTOCOLS.velocity, subaccount: account, positions: getSampleSnapshot('long-short').positions.map(position => ({ ...position, oracle: { ...position.oracle, slot: 123, readSlot: 124 } })) });
const valid = (value: unknown) => isSnapshotResponse(value, authority, 'velocity', 0, authority);
it('accepts a complete matching response and rejects wrong account/provider identities', () => {
  expect(isDiscoveryResponse(discovery, authority, 'velocity')).toBe(true);
  expect(isDiscoveryResponse(discovery, authority, 'pacifica')).toBe(false);
  expect(isDiscoveryResponse({ ...discovery, subaccounts: [account, account] }, authority, 'velocity')).toBe(false);
  expect(isDiscoveryResponse({ ...discovery, protocol: undefined }, authority, 'velocity')).toBe(false);
  expect(valid(snapshot())).toBe(true);
  for (const change of [{ authority: 'different' }, { protocol: PROTOCOLS.drift }, { source: 'sample' }, { subaccount: { ...account, id: 1 } }, { subaccount: { ...account, address: null } }]) expect(valid({ ...snapshot(), ...change })).toBe(false);
  // A fixture identity catalog never describes a live account read.
  expect(valid({ ...snapshot(), catalog: { ...REFERENCE_PERP_CATALOG } })).toBe(false);
});
it('rejects malformed financial values and arrays without requiring historical prices to be fresh', () => {
  for (const change of [{ positions: null }, { positions: [{ ...snapshot().positions[0], size: 'NaN' }] }, { positions: [{ ...snapshot().positions[0], price: 150 }] }, { metrics: [{}] }, { retrievedAt: 'unknown' }, { positions: [snapshot().positions[0], snapshot().positions[0]] }]) expect(valid({ ...snapshot(), ...change })).toBe(false);
  expect(valid(snapshot())).toBe(true); // The calculation engine separately handles expiration.
});

it('rejects future snapshots and missing provider-specific price evidence', () => {
  expect(valid({ ...snapshot(), retrievedAt: new Date(Date.now() + 60_000).toISOString() })).toBe(false);
  expect(valid({ ...snapshot(), retrievedAt: '2026-09-11' })).toBe(false);
  expect(valid({ ...snapshot(), positions: getSampleSnapshot('long-short').positions })).toBe(false);
  const api = { ...snapshot(), protocol: PROTOCOLS.pacifica };
  expect(isSnapshotResponse(api, authority, 'pacifica', 0, authority)).toBe(false);
});

it('accepts a bounded current risk context and rejects unsafe status payloads', () => {
  const risk = { scope: 'cross-margin', totalCollateral: '11000', maintenanceRequirement: '1000', maintenanceHeadroom: '10000', canBeLiquidated: false, status: 'clear', explanation: 'Current provider observation.' };
  expect(valid({ ...snapshot(), risk })).toBe(true);
  expect(valid({ ...snapshot(), risk: { ...risk, maintenanceHeadroom: 'NaN' } })).toBe(false);
  expect(valid({ ...snapshot(), risk: { ...risk, status: 'safe' } })).toBe(false);
  expect(isSnapshotResponse({ ...snapshot(), protocol: PROTOCOLS.pacifica, risk }, authority, 'pacifica', 0, authority)).toBe(false);
});
