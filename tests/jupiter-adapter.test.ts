import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import fixture from './fixtures/jupiter-mainnet/accounts.json';
import extraCustodies from './fixtures/jupiter-mainnet/custodies.json';
import { readJupiterInventory } from '../src/server/jupiter';
import { JUPITER_POSITION_DISCRIMINATOR_BASE58 } from '../src/server/jupiter-decoder';

const authority = 'AhUvhrHHZXh7Huu8AtCfEkTvgUdTw4ZwL1j1c6Fu5dfq';
const allAccounts = { ...fixture.accounts, ...extraCustodies };
const accountInfo = (account: { owner: string; space: number; data: string }) => ({
  lamports: 1,
  data: [account.data, 'base64'],
  owner: account.owner,
  executable: false,
  rentEpoch: 0,
  space: account.space,
});

function rpcHarness(options: { genesis?: string; positions?: Array<typeof fixture.accounts.activePosition>; poolOwner?: string } = {}) {
  const calls: { method: string; params: unknown[] }[] = [];
  const genesis = options.genesis ?? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  const positions = options.positions ?? [fixture.accounts.activePosition];
  const pool = fixture.accounts.pool;
  const poolAccount = { ...pool, owner: options.poolOwner ?? pool.owner };
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
    calls.push({ method: request.method, params: request.params });
    let result: unknown;
    if (request.method === 'getGenesisHash') result = genesis;
    else if (request.method === 'getAccountInfo') result = { context: { slot: pool.slot }, value: accountInfo(poolAccount) };
    else if (request.method === 'getProgramAccounts') result = {
      context: { slot: Math.max(...positions.map((position) => position.slot)) },
      value: positions.map((position) => ({ pubkey: position.address, account: accountInfo(position) })),
    };
    else if (request.method === 'getMultipleAccounts') {
      const addresses = (request.params[0] as string[]);
      result = { context: { slot: Math.max(...Object.values(allAccounts).map((account) => account.slot)) }, value: addresses.map((address) => {
        const account = Object.values(allAccounts).find((candidate) => candidate.address === address);
        return account ? accountInfo(account) : null;
      }) };
    } else if (request.method === 'getSlot') result = Math.max(...Object.values(allAccounts).map((account) => account.slot));
    else throw new Error(`unexpected ${request.method}`);
    return Response.json({ jsonrpc: '2.0', id: request.id, result });
  });
  vi.stubGlobal('fetch', fetcher);
  return { calls, fetcher };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Jupiter Perps bounded server adapter', () => {
  it('uses one wallet-filtered, discriminator-filtered read and returns inventory-only metadata', async () => {
    vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example.test/private-token');
    const { calls } = rpcHarness();
    const result = await readJupiterInventory(authority);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].positionAccount).toBe(fixture.accounts.activePosition.address);
    expect(result.positions[0].currentPriceUsd).toBeNull();
    expect(result.positions[0].modeled).toBe(false);
    expect(result.positions[0].sizeUsd).toBe('16.755624');
    expect(result.positions[0].lockedAmountCustody).toBe(fixture.accounts.solCustody.address);
    expect(result.observedSlot).toBeGreaterThanOrEqual(fixture.accounts.pool.slot);
    const discovery = calls.find((call) => call.method === 'getProgramAccounts');
    expect(discovery).toBeDefined();
    const config = discovery!.params[1] as { filters: Array<{ dataSize?: number; memcmp?: { offset: number; bytes: string } }> };
    expect(config.filters).toEqual(expect.arrayContaining([
      expect.objectContaining({ memcmp: { offset: 8, bytes: authority, encoding: 'base58' } }),
      expect.objectContaining({ memcmp: { offset: 0, bytes: JUPITER_POSITION_DISCRIMINATOR_BASE58, encoding: 'base58' } }),
    ]));
    expect(config.filters.some((filter) => filter.dataSize !== undefined)).toBe(false);
    expect(config.filters).toHaveLength(2);
    expect(calls.filter((call) => call.method === 'getProgramAccounts')).toHaveLength(1);
  });

  it('fails closed when the endpoint is missing or the network is not mainnet', async () => {
    vi.stubEnv('SOLANA_RPC_URL', '');
    await expect(readJupiterInventory(authority)).rejects.toMatchObject({ code: 'NOT_CONFIGURED', retryable: false });
    vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example.test/private-token');
    rpcHarness({ genesis: 'devnet-genesis' });
    await expect(readJupiterInventory(authority)).rejects.toMatchObject({ code: 'WRONG_NETWORK', retryable: false });
  });

  it('rejects account ownership changes, malformed bytes, and an unbounded response', async () => {
    vi.stubEnv('SOLANA_RPC_URL', 'https://rpc.example.test/private-token');
    rpcHarness({ poolOwner: '11111111111111111111111111111111' });
    await expect(readJupiterInventory(authority)).rejects.toMatchObject({ code: 'INVALID_ACCOUNT' });

    vi.unstubAllGlobals();
    rpcHarness({ positions: [{ ...fixture.accounts.activePosition, data: fixture.accounts.activePosition.data.slice(0, -4) }] });
    await expect(readJupiterInventory(authority)).rejects.toMatchObject({ code: 'UNSUPPORTED_ACCOUNT_VERSION' });

    vi.unstubAllGlobals();
    const many = Array.from({ length: 33 }, () => ({ ...fixture.accounts.activePosition }));
    rpcHarness({ positions: many });
    await expect(readJupiterInventory(authority)).rejects.toMatchObject({ code: 'TOO_MANY_ACCOUNTS', retryable: false });
  });
});
