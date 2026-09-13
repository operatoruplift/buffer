import { describe, expect, it } from 'vitest';
import fixture from './fixtures/jupiter-mainnet/accounts.json';
import shortFixture from './fixtures/jupiter-mainnet/short-position.json';
import {
  JUPITER_JLP_POOL,
  JUPITER_PERPS_PROGRAM_ID,
  JUPITER_POSITION_ACCOUNT_SIZE,
  JUPITER_POSITION_DISCRIMINATOR_BASE58,
  decodeJupiterCustody,
  decodeJupiterPool,
  decodeJupiterPosition,
  deriveJupiterPositionPda,
  jupiterPositionFilters,
} from '../src/server/jupiter-decoder';

const bytes = (value: string) => Buffer.from(value, 'base64');
const accounts = fixture.accounts;

describe('Jupiter Perps canonical decoder', () => {
  it('decodes captured mainnet Pool, Custody, and active Position bytes', () => {
    const pool = decodeJupiterPool(bytes(accounts.pool.data));
    const custody = decodeJupiterCustody(bytes(accounts.solCustody.data));
    const position = decodeJupiterPosition(bytes(accounts.activePosition.data));

    expect(accounts.pool.owner).toBe(JUPITER_PERPS_PROGRAM_ID);
    expect(accounts.activePosition.space).toBe(JUPITER_POSITION_ACCOUNT_SIZE);
    expect(pool).toMatchObject({ name: 'Pool', accountDataLength: 2000 });
    expect(pool.custodies).toHaveLength(6);
    expect(custody).toMatchObject({
      pool: JUPITER_JLP_POOL,
      decimals: 9,
      isStable: false,
      oracleType: 'pyth',
      maxPriceAgeSec: 5,
      accountDataLength: 2000,
    });
    expect(position).toMatchObject({
      owner: 'AhUvhrHHZXh7Huu8AtCfEkTvgUdTw4ZwL1j1c6Fu5dfq',
      pool: JUPITER_JLP_POOL,
      custody: accounts.solCustody.address,
      collateralCustody: accounts.solCustody.address,
      side: 'long',
      priceAtomic: 143486464n,
      sizeUsdAtomic: 16755624n,
      collateralUsdAtomic: 15224968n,
      lockedAmountAtomic: 116774944n,
      bump: 254,
    });
    if (position.side === 'none') throw new Error('Fixture must have an open direction');
    expect(deriveJupiterPositionPda({
      owner: position.owner,
      pool: position.pool,
      custody: position.custody,
      collateralCustody: position.collateralCustody,
      side: position.side,
    })).toBe(accounts.activePosition.address);
  });

  it('preserves closed Position accounts so the normalizer can count and exclude them', () => {
    const position = decodeJupiterPosition(bytes(accounts.closedPosition.data));
    expect(position.sizeUsdAtomic).toBe(0n);
    expect(position.side).toBe('long');
    if (position.side === 'none') throw new Error('Captured closed position must preserve its direction');
    expect(deriveJupiterPositionPda({
      owner: position.owner,
      pool: position.pool,
      custody: position.custody,
      collateralCustody: position.collateralCustody,
      side: position.side,
    })).toBe(accounts.closedPosition.address);
  });

  it('decodes a real short SOL/USDC Position and proves its collateral custody differs from position custody', () => {
    const position = decodeJupiterPosition(bytes(shortFixture.data));
    expect(position).toMatchObject({
      owner: '8vXZp5DRsAKGv6QwfqKjZ2MQgMT6arfYYpoCqAN2b9aw',
      pool: JUPITER_JLP_POOL,
      custody: fixture.accounts.solCustody.address,
      collateralCustody: fixture.accounts.usdcCustody.address,
      side: 'short',
      priceAtomic: 105140073n,
      sizeUsdAtomic: 5353838028n,
      lockedAmountAtomic: 5354639992n,
    });
    if (position.side === 'none') throw new Error('Fixture must have an open direction');
    expect(deriveJupiterPositionPda({
      owner: position.owner,
      pool: position.pool,
      custody: position.custody,
      collateralCustody: position.collateralCustody,
      side: position.side,
    })).toBe(shortFixture.address);
  });

  it('emits the exact owner and Anchor discriminator filters from the official discovery pattern', () => {
    const filters = jupiterPositionFilters('AhUvhrHHZXh7Huu8AtCfEkTvgUdTw4ZwL1j1c6Fu5dfq');
    expect(filters).toEqual([
      { memcmp: { offset: 8, bytes: 'AhUvhrHHZXh7Huu8AtCfEkTvgUdTw4ZwL1j1c6Fu5dfq' } },
      { memcmp: { offset: 0, bytes: JUPITER_POSITION_DISCRIMINATOR_BASE58 } },
    ]);
    expect(JUPITER_POSITION_DISCRIMINATOR_BASE58).toBe('VZMoMoKgZQb');
  });

  it('fails closed for another account layout, discriminator, direction, and reserved bytes', () => {
    const original = bytes(accounts.activePosition.data);
    expect(() => decodeJupiterPosition(original.subarray(0, original.length - 1))).toThrow(/layout/);
    const badDiscriminator = Buffer.from(original);
    badDiscriminator[0] ^= 1;
    expect(() => decodeJupiterPosition(badDiscriminator)).toThrow(/discriminator/);
    const badSide = Buffer.from(original);
    badSide[152] = 3;
    expect(() => decodeJupiterPosition(badSide)).toThrow(/direction/);
    const badReserved = Buffer.from(original);
    badReserved[215] = 1;
    expect(() => decodeJupiterPosition(badReserved)).toThrow(/reserved/);
    const badCustody = Buffer.from(accounts.solCustody.data, 'base64');
    badCustody[0] ^= 1;
    expect(() => decodeJupiterCustody(badCustody)).toThrow(/discriminator/);
  });
});
