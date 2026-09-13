import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import fixture from './fixtures/jupiter-mainnet/accounts.json';
import more from './fixtures/jupiter-mainnet/custodies.json';
import short from './fixtures/jupiter-mainnet/short-position.json';
import { decodeJupiterPool, decodeJupiterPosition, decodeJupiterCustody } from '../src/server/jupiter-decoder';
import { normalizeJupiterInventory } from '../src/server/jupiter-normalize';
import { toJupiterSnapshot, jupiterLiveProvider } from '../src/server/jupiter-provider';
import { calculateScenario } from '../src/lib/scenario';
import { isSnapshotResponse } from '../src/lib/live-response';
import { createReport } from '../src/lib/report';
import { isReport } from '../src/lib/device-reports';

function inventory() {
  const all = { ...fixture.accounts, ...more };
  const pool = { ...decodeJupiterPool(Buffer.from(fixture.accounts.pool.data, 'base64')), address: fixture.accounts.pool.address, readSlot: fixture.accounts.pool.slot };
  const position = { ...decodeJupiterPosition(Buffer.from(short.data, 'base64')), address: short.address, accountSlot: short.slot };
  return normalizeJupiterInventory({ authority: position.owner, pool, positions: [position],
    custodies: pool.custodies.map(address => { const row = Object.values(all).find(account => account.address === address)!; return { ...decodeJupiterCustody(Buffer.from(row.data, 'base64')), address, readSlot: row.slot }; }),
    retrievedAt: new Date().toISOString(), observedSlot: short.slot,
  });
}
it('adapts a captured short position without creating a current price or base-size inference', () => {
  const snapshot = toJupiterSnapshot(inventory());
  expect(snapshot.positions[0]).toMatchObject({ size: '0', price: null, quote: 'USD', modeled: false,
    inventory: { direction: 'short', lockedToken: 'USDC', lockedAmount: '5354.639992', entryPriceUsd: '105.140073' },
  });
  expect(isSnapshotResponse(snapshot, snapshot.authority!, 'jupiter', 0, snapshot.authority)).toBe(true);
  for (const shock of [-20, -10, 0, 10, 20]) {
    const scenario = calculateScenario(snapshot, shock);
    expect(scenario.totals).toEqual([]);
    expect(scenario.eligible).toBe(0);
    expect(scenario.excluded[0].reason).toContain('inventory');
    expect(isReport(createReport(snapshot, scenario))).toBe(true);
  }
  // Even a mistakenly enabled position cannot enter the linear engine.
  snapshot.positions[0] = { ...snapshot.positions[0], modeled: true, exclusionReason: null, size: '100', price: '150', oracle: { valid: true, reason: null, slot: 1, readSlot: 1 } };
  expect(calculateScenario(snapshot, -10).totals).toEqual([]);
});
it('rejects unverified custody units and non-wallet subaccounts', async () => {
  const source = inventory();
  source.custodies.find(custody => custody.address === source.positions[0].collateralCustody)!.decimals = 9;
  expect(() => toJupiterSnapshot(source)).toThrow(/custody token identity or unit/);
  await expect(jupiterLiveProvider.snapshot(source.authority, 1)).rejects.toMatchObject({ code: 'INVALID_SUBACCOUNT' });
});
