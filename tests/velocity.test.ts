import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
vi.mock('server-only', () => ({}));
import { Connection, PublicKey } from 'velocity-web3';
import {
  BulkAccountLoader,
  MainnetPerpMarkets,
  MainnetSpotMarkets,
  VELOCITY_PROGRAM_ID,
  VelocityClient,
  type IWallet,
  type PerpMarketAccount,
  type SpotMarketAccount,
  type StateAccount,
} from '@velocity-exchange/sdk';
import { bindCanonicalVelocityProgram, SnapshotAccountLoader } from '../src/server/velocity';

const program = new PublicKey(VELOCITY_PROGRAM_ID);
const authority = new PublicKey('11111111111111111111111111111111');
const fixtures = new URL('./fixtures/velocity-mainnet/', import.meta.url);

function makeClient() {
  const connection = new Connection('http://127.0.0.1:1');
  const wallet: IWallet = {
    publicKey: authority,
    async signTransaction() { throw new Error('Read only'); },
    async signAllTransactions() { throw new Error('Read only'); },
  };
  const loader = new BulkAccountLoader(connection, 'confirmed', 0);
  return { connection, loader, client: new VelocityClient({
    connection,
    wallet,
    env: 'mainnet-beta',
    skipLoadUsers: true,
    userStats: false,
    perpMarketIndexes: [],
    spotMarketIndexes: [],
    accountSubscription: { type: 'polling', accountLoader: loader },
  }) };
}

describe('Velocity mainnet compatibility fixtures', () => {
  it('binds the official SDK to the current program and lower-camel IDL accounts', () => {
    const { loader, client } = makeClient();
    bindCanonicalVelocityProgram(client);
    expect(client.program.programId.toBase58()).toBe(VELOCITY_PROGRAM_ID);
    expect(client.program.idl.accounts?.map((account) => account.name)).toEqual(expect.arrayContaining(['state', 'perpMarket', 'spotMarket', 'user', 'pythLazerOracle']));
    expect(PublicKey.findProgramAddressSync([Buffer.from('velocity_state')], program)[0].toBase58()).toBe('2etx5NvPNxeMZ7EfHE6GjJfW2imRYEUANehNS1WB4CVW');
    loader.stopPolling();
  });

  it('decodes captured state, SOL/BTC/ETH markets, quote USDT, and oracle buffers', () => {
    const { loader, client } = makeClient();
    const state = client.program.coder.accounts.decode<StateAccount>('state', readFileSync(new URL('state-2etx5NvPNxeMZ7EfHE6GjJfW2imRYEUANehNS1WB4CVW.bin', fixtures)));
    expect(Number(state.numberOfMarkets)).toBeGreaterThanOrEqual(3);
    expect(Number(state.numberOfSpotMarkets)).toBeGreaterThan(0);

    const expectedPerps = new Map(MainnetPerpMarkets.filter((market) => [0, 1, 2].includes(market.marketIndex)).map((market) => [market.marketIndex, market]));
    for (const file of readdirSync(fixtures).filter((name) => name.startsWith('perpMarket-'))) {
      const address = file.slice('perpMarket-'.length, -'.bin'.length);
      const market = client.program.coder.accounts.decode<PerpMarketAccount>('perpMarket', readFileSync(new URL(file, fixtures)));
      const expected = expectedPerps.get(market.marketIndex);
      expect(expected, file).toBeDefined();
      expect(market.pubkey.toBase58(), file).toBe(address);
      expect(market.pubkey.toBase58(), file).toBe(PublicKey.findProgramAddressSync([Buffer.from('perp_market'), Buffer.from([market.marketIndex & 0xff, (market.marketIndex >> 8) & 0xff])], program)[0].toBase58());
      expect(market.oracle.toBase58(), file).toBe(expected?.oracle.toBase58());
      expect(market.oracleSource, file).toEqual(expected?.oracleSource);
      expect(market.quoteSpotMarketIndex, file).toBe(0);
    }

    const spot = client.program.coder.accounts.decode<SpotMarketAccount>('spotMarket', readFileSync(new URL('spotMarket-2QpHj5vzgCdWaGM2KSoGtYJWeSkx24cMyzUDHDrucvRc.bin', fixtures)));
    expect(spot.marketIndex).toBe(0);
    expect(spot.mint.toBase58()).toBe(MainnetSpotMarkets[0].mint.toBase58());
    expect(spot.mint.toBase58()).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
    expect(Buffer.from(spot.name).toString().trim()).toBe('USDT');

    for (const file of readdirSync(fixtures).filter((name) => name.startsWith('pythLazerOracle-'))) {
      const oracle = client.program.coder.accounts.decode<{ price: { gt: (value: number) => boolean }; postedSlot: { gt: (value: number) => boolean } }>('pythLazerOracle', readFileSync(new URL(file, fixtures)));
      expect(oracle.price.gt(0), file).toBe(true);
      expect(oracle.postedSlot.gt(0), file).toBe(true);
    }
    loader.stopPolling();
  });

  it('keeps the request-owned loader available without starting a polling interval', () => {
    const { loader } = makeClient();
    const snapshotLoader = new SnapshotAccountLoader({} as Connection, new Set());
    expect(loader.intervalId).toBeUndefined();
    expect(snapshotLoader.intervalId).toBeUndefined();
    snapshotLoader.dispose();
    loader.stopPolling();
  });
});
