import { describe, expect, it } from 'vitest';
import fixture from './fixtures/jupiter-mainnet/accounts.json';
import extraCustodies from './fixtures/jupiter-mainnet/custodies.json';
import shortFixture from './fixtures/jupiter-mainnet/short-position.json';
import {
  decodeJupiterCustody,
  decodeJupiterPool,
  decodeJupiterPosition,
} from '../src/server/jupiter-decoder';
import { jupiterDecimalFromAtomic, normalizeJupiterInventory, type JupiterCustodyRead, type JupiterPoolRead, type JupiterPositionRead } from '../src/server/jupiter-normalize';

const bytes = (value: string) => Buffer.from(value, 'base64');
const allAccounts = { ...fixture.accounts, ...extraCustodies };
const capturedAt = fixture.capturedAt;

function input(): Parameters<typeof normalizeJupiterInventory>[0] {
  const poolAccount = allAccounts.pool;
  const poolDecoded = decodeJupiterPool(bytes(poolAccount.data));
  const pool: JupiterPoolRead = { address: poolAccount.address, readSlot: poolAccount.slot, ...poolDecoded };
  const custodies: JupiterCustodyRead[] = pool.custodies.map((address) => {
    const entry = Object.values(allAccounts).find((account) => account.address === address);
    if (!entry) throw new Error(`Missing fixture for ${address}`);
    return { address, readSlot: entry.slot, ...decodeJupiterCustody(bytes(entry.data)) };
  });
  const positions: JupiterPositionRead[] = [fixture.accounts.activePosition].map((entry) => ({
    address: entry.address,
    accountSlot: entry.slot,
    ...decodeJupiterPosition(bytes(entry.data)),
  }));
  return {
    authority: 'AhUvhrHHZXh7Huu8AtCfEkTvgUdTw4ZwL1j1c6Fu5dfq',
    pool,
    positions,
    custodies,
    retrievedAt: capturedAt,
    observedSlot: Math.max(...Object.values(allAccounts).map((account) => account.slot)),
  };
}

describe('Jupiter Perps inventory normalization', () => {
  it('normalizes USD atomic fields and preserves native locked-token identity', () => {
    const result = normalizeJupiterInventory(input());
    expect(result.protocol).toBe('jupiter');
    expect(result.subaccount).toEqual({ id: 0, name: 'Wallet account', address: input().authority });
    expect(result.positions).toHaveLength(1);
    expect(result.closedPositionCount).toBe(0);
    expect(result.positions[0]).toMatchObject({
      direction: 'long',
      sizeUsd: '16.755624',
      sizeUsdAtomic: '16755624',
      entryPriceUsd: '143.486464',
      collateralUsd: '15.224968',
      lockedAmountNative: '0.116774944',
      lockedAmountAtomic: '116774944',
      lockedAmountCustody: '7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz',
      lockedAmountDecimals: 9,
      currentPriceUsd: null,
      modeled: false,
      inventoryOnly: true,
    });
    expect(result.positions[0].exclusionReason).toContain('lockedAmount');
    expect(result.warnings.join(' ')).toContain('not treated as USDC');

    // This is a captured closed account with its original owner and PDA. It
    // is kept as a separate wallet fixture because it is not owned by the
    // active-position wallet above.
    const closed = fixture.accounts.closedPosition;
    const closedDecoded = decodeJupiterPosition(bytes(closed.data));
    const closedInput = input();
    closedInput.authority = closedDecoded.owner;
    closedInput.positions = [{ address: closed.address, accountSlot: closed.slot, ...closedDecoded }];
    const closedResult = normalizeJupiterInventory(closedInput);
    expect(closedResult.positions).toHaveLength(0);
    expect(closedResult.closedPositionCount).toBe(1);
  });

  it('keeps exact decimal conversion independent from JavaScript number precision', () => {
    expect(jupiterDecimalFromAtomic(0n, 6)).toBe('0');
    expect(jupiterDecimalFromAtomic(158225872n, 6)).toBe('158.225872');
    expect(jupiterDecimalFromAtomic(1000000n, 6)).toBe('1');
    expect(jupiterDecimalFromAtomic(1n, 9)).toBe('0.000000001');
    expect(jupiterDecimalFromAtomic(-42n, 6)).toBe('-0.000042');
    expect(jupiterDecimalFromAtomic(99999999999999999999n, 6)).toBe('99999999999999.999999');
  });

  it('uses collateral custody decimals for lockedAmount on a real short SOL/USDC position', () => {
    const source = input();
    const decoded = decodeJupiterPosition(bytes(shortFixture.data));
    source.authority = decoded.owner;
    source.positions = [{
      address: shortFixture.address,
      accountSlot: shortFixture.slot,
      ...decoded,
    }];
    const result = normalizeJupiterInventory(source);
    expect(result.positions[0]).toMatchObject({
      direction: 'short',
      custody: fixture.accounts.solCustody.address,
      collateralCustody: fixture.accounts.usdcCustody.address,
      lockedAmountAtomic: '5354639992',
      lockedAmountNative: '5354.639992',
      lockedAmountCustody: fixture.accounts.usdcCustody.address,
      lockedAmountDecimals: 6,
    });
  });

  it('fails closed when owner, PDA, custody, or pool identity changes', () => {
    const ownerMismatch = input();
    ownerMismatch.positions[0].owner = '11111111111111111111111111111111';
    expect(() => normalizeJupiterInventory(ownerMismatch)).toThrow(/owner or pool/);

    const pdaMismatch = input();
    pdaMismatch.positions[0].address = '11111111111111111111111111111111';
    expect(() => normalizeJupiterInventory(pdaMismatch)).toThrow(/PDA/);

    const custodyMismatch = input();
    custodyMismatch.custodies = custodyMismatch.custodies.filter((custody) => custody.address !== custodyMismatch.positions[0].custody);
    expect(() => normalizeJupiterInventory(custodyMismatch)).toThrow(/custody/);

    const poolMismatch = input();
    poolMismatch.pool.address = '11111111111111111111111111111111';
    expect(() => normalizeJupiterInventory(poolMismatch)).toThrow(/Pool identity/);
  });

  it('does not turn unsupported direction or stale timestamp bytes into a modeled position', () => {
    const unsupported = input();
    unsupported.positions[0].side = 'none';
    expect(() => normalizeJupiterInventory(unsupported)).toThrow(/no supported long or short/);

    const timestamp = input();
    timestamp.positions[0].openTime = 9_999_999_999n;
    expect(() => normalizeJupiterInventory(timestamp)).toThrow(/timestamp/);
  });

  it('verifies closed Position PDAs before applying sizeUsd zero exclusion', () => {
    const closed = fixture.accounts.closedPosition;
    const decoded = decodeJupiterPosition(bytes(closed.data));
    const source = input();
    source.authority = decoded.owner;
    source.positions = [{ address: closed.address, accountSlot: closed.slot, ...decoded }];
    source.positions[0].address = '11111111111111111111111111111111';
    expect(() => normalizeJupiterInventory(source)).toThrow(/PDA/);

    const none = input();
    none.authority = decoded.owner;
    none.positions = [{ address: closed.address, accountSlot: closed.slot, ...decoded, side: 'none' }];
    expect(() => normalizeJupiterInventory(none)).toThrow(/long or short/);
  });
});
