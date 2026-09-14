import 'server-only';
import { createRpcFetch } from './rpc-fetch';
import { Connection, PublicKey } from 'velocity-web3';
import {
  BulkAccountLoader, VelocityClient, DelistedMarketSetting, VELOCITY_PROGRAM_ID, PollingVelocityClientAccountSubscriber,
  getUserAccountPublicKeySync, getPerpMarketPublicKeySync, getSpotMarketPublicKeySync,
  type UserAccount, type PerpMarketAccount, type SpotMarketAccount, type User,
  type OracleInfo, type IWallet, type DataAndSlot, type OraclePriceData,
} from '@velocity-exchange/sdk';
import { ProviderFailure, type LiveProvider } from './boundary';
import { PROTOCOLS } from '../lib/protocols';
import { normalizeSnapshot, requiredMarkets, subaccountInfo, type ReadData } from './velocity-normalize';

const PROGRAM = new PublicKey(PROTOCOLS.velocity.programId);
const REQUEST_TIMEOUT_MS = 18_000;
// Solana's published mainnet-beta genesis hash (sdk/src/genesis_config.rs).
const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

/** Manual SDK-compatible loader using public RPC methods. The stock loader can
 * swallow RPC failures and log raw responses; this version propagates errors and
 * records every actual read slot even when bytes are unchanged. No interval runs. */
export class SnapshotAccountLoader extends BulkAccountLoader {
  constructor(private readonly rpc: Connection, private readonly programAccounts: Set<string>) { super(rpc, 'confirmed', 0); }
  override async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.readOnce();
    try { await this.loadPromise; } finally { this.loadPromise = undefined; }
  }
  private async readOnce(): Promise<void> {
    const accounts = [...this.accountsToLoad.values()];
    for (let start = 0; start < accounts.length; start += 100) {
      const batch = accounts.slice(start, start + 100);
      const result = await this.rpc.getMultipleAccountsInfoAndContext(batch.map((a) => a.publicKey), 'confirmed');
      this.mostRecentSlot = Math.max(this.mostRecentSlot, result.context.slot);
      result.value.forEach((account, index) => {
        const target = batch[index];
        const address = target.publicKey.toBase58();
        const previous = this.bufferAndSlotMap.get(address);
        // Load-balanced RPCs can answer out of order. Keep the newest bytes and
        // slot together so a late response cannot regress the SDK's view or
        // cause a stale owner check to reject a valid cached account.
        if (previous && result.context.slot < previous.slot) return;
        if (account && this.programAccounts.has(target.publicKey.toBase58()) && !account.owner.equals(PROGRAM)) {
          throw new ProviderFailure('INVALID_ACCOUNT', 'The account owner does not match the fixed Velocity program.', 502, false);
        }
        this.bufferAndSlotMap.set(address, { slot: result.context.slot, buffer: account?.data });
        if (account) for (const callback of target.callbacks.values()) callback(account.data, result.context.slot);
      });
    }
  }
  dispose(): void { this.stopPolling(); this.accountsToLoad.clear(); this.bufferAndSlotMap.clear(); this.errorCallbacks.clear(); }
}

interface Scope {
  connection: Connection;
  loader: SnapshotAccountLoader;
  clients: VelocityClient[];
  users: User[];
  programAccounts: Set<string>;
  authority: PublicKey;
}

/** Fail closed if a future SDK changes the program or subscriber binding. */
export function bindCanonicalVelocityProgram(client: VelocityClient): void {
  if (!(client.accountSubscriber instanceof PollingVelocityClientAccountSubscriber)) {
    throw new ProviderFailure('INVALID_CONFIGURATION', 'The public account subscriber is unavailable.', 503, false);
  }
  if (VELOCITY_PROGRAM_ID !== PROGRAM.toBase58() || !client.program.programId.equals(PROGRAM) || client.accountSubscriber.program !== client.program) throw new ProviderFailure('INVALID_CONFIGURATION', 'The Velocity program could not be verified.', 503, false);
}

function clientFor(scope: Scope, markets = { perp: [] as number[], spot: [] as number[] }, oracleInfos: OracleInfo[] = []): VelocityClient {
  const wallet: IWallet = {
    publicKey: scope.authority,
    async signTransaction() { throw new Error('Buffer does not sign transactions.'); },
    async signAllTransactions() { throw new Error('Buffer does not sign transactions.'); },
  };
  const client = new VelocityClient({ connection: scope.connection, wallet, authority: scope.authority, env: 'mainnet-beta', programID: PROGRAM,
    skipLoadUsers: true, userStats: false, perpMarketIndexes: markets.perp, spotMarketIndexes: markets.spot, oracleInfos,
    accountSubscription: { type: 'polling', accountLoader: scope.loader }, delistedMarketSetting: DelistedMarketSetting.Subscribe });
  bindCanonicalVelocityProgram(client);
  // Request-owned listener: never allow SDK error events to become uncaught errors.
  client.eventEmitter.on('error', () => { /* All fetch failures propagate through the strict loader. */ });
  scope.clients.push(client);
  return client;
}

async function withScope<T>(authority: string, run: (scope: Scope) => Promise<T>): Promise<T> {
  const endpoint = process.env.SOLANA_RPC_URL?.trim();
  if (!endpoint) throw new ProviderFailure('NOT_CONFIGURED', 'Live reads require server-side SOLANA_RPC_URL configuration. Preset accounts are ready to use.', 503, false);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  const programAccounts = new Set<string>();
  const scope: Partial<Scope> = { clients: [], users: [], programAccounts, authority: new PublicKey(authority) };
  try {
    const configured = new URL(endpoint);
    if (configured.protocol !== 'https:' && configured.protocol !== 'http:') throw new Error('Invalid configuration');
    const connection = new Connection(endpoint, { commitment: 'confirmed', disableRetryOnRateLimit: true,
      fetch: createRpcFetch(endpoint, abort.signal),
    });
    scope.connection = connection;
    scope.loader = new SnapshotAccountLoader(connection, programAccounts);
    if (await connection.getGenesisHash() !== MAINNET_GENESIS_HASH) throw new ProviderFailure('WRONG_NETWORK', 'The configured RPC is not Solana mainnet-beta.', 503, false);
    return await run(scope as Scope);
  } catch (error) {
    if (error instanceof ProviderFailure) throw error;
    if (abort.signal.aborted) throw new ProviderFailure('TIMEOUT', 'The live read timed out. Please retry.', 504);
    throw new ProviderFailure('RPC_ERROR', 'The live data provider could not complete this read. Please retry.');
  } finally {
    abort.abort();
    clearTimeout(timer);
    for (const user of scope.users ?? []) { await user.unsubscribe().catch(() => undefined); user.eventEmitter.removeAllListeners(); user.accountSubscriber.eventEmitter.removeAllListeners(); }
    for (const client of scope.clients ?? []) { await client.unsubscribe().catch(() => undefined); client.eventEmitter.removeAllListeners(); }
    scope.loader?.dispose();
  }
}

async function decodeMarkets<T extends PerpMarketAccount | SpotMarketAccount>(scope: Scope, client: VelocityClient, kind: 'PerpMarket' | 'SpotMarket', indexes: number[]): Promise<Map<number, T>> {
  const result = new Map<number, T>();
  if (!indexes.length) return result;
  const keys = indexes.map((index) => kind === 'PerpMarket' ? getPerpMarketPublicKeySync(PROGRAM, index) : getSpotMarketPublicKeySync(PROGRAM, index));
  keys.forEach((key) => scope.programAccounts.add(key.toBase58()));
  const read = await scope.connection.getMultipleAccountsInfoAndContext(keys, 'confirmed');
  read.value.forEach((info, index) => {
    if (!info) return;
    if (!info.owner.equals(PROGRAM)) throw new ProviderFailure('INVALID_ACCOUNT', 'Market ownership could not be verified.', 502, false);
    const market = client.program.coder.accounts.decode<T>(kind === 'PerpMarket' ? 'perpMarket' : 'spotMarket', info.data);
    if (market.marketIndex !== indexes[index] || !market.pubkey.equals(keys[index])) throw new ProviderFailure('INVALID_ACCOUNT', 'Market identity could not be verified.', 502, false);
    result.set(indexes[index], market);
  });
  return result;
}

export function requireSelectedAccount(account: UserAccount | null, authority: PublicKey, subaccount: number): asserts account is UserAccount {
  if (!account) throw new ProviderFailure('SUBACCOUNT_NOT_FOUND', 'The selected Velocity subaccount was not found for this authority.', 404, false);
  if (!account.authority.equals(authority) || account.subAccountId !== subaccount) throw new ProviderFailure('SUBACCOUNT_MISMATCH', 'The selected subaccount does not belong to this authority.', 400, false);
}

export const velocityProvider: LiveProvider = {
  discover: (authority) => withScope(authority, async (scope) => {
    const client = clientFor(scope);
    const accounts = await client.getUserAccountsForAuthority(scope.authority);
    if (accounts.some((account) => !account.authority.equals(scope.authority))) throw new ProviderFailure('INVALID_ACCOUNT', 'Returned account ownership could not be verified.', 502, false);
    return { authority, protocol: PROTOCOLS.velocity, subaccounts: accounts.map((account) => subaccountInfo(account, getUserAccountPublicKeySync(PROGRAM, scope.authority, account.subAccountId).toBase58())).sort((a, b) => a.id - b.id), retrievedAt: new Date().toISOString() };
  }),
  snapshot: (authority, subaccount) => withScope(authority, async (scope) => {
    const decoder = clientFor(scope);
    const address = getUserAccountPublicKeySync(PROGRAM, scope.authority, subaccount);
    scope.programAccounts.add(address.toBase58());
    const read = await scope.connection.getAccountInfoAndContext(address, 'confirmed');
    if (read.value && !read.value.owner.equals(PROGRAM)) throw new ProviderFailure('INVALID_ACCOUNT', 'The selected account is not owned by Velocity.', 502, false);
    const initial = read.value ? decoder.program.coder.accounts.decode<UserAccount>('user', read.value.data) : null;
    requireSelectedAccount(initial, scope.authority, subaccount);
    const required = requiredMarkets(initial);
    const initialPerps = await decodeMarkets<PerpMarketAccount>(scope, decoder, 'PerpMarket', required.perp);
    for (const market of initialPerps.values()) if (!required.spot.includes(market.quoteSpotMarketIndex)) required.spot.push(market.quoteSpotMarketIndex);
    const initialSpots = await decodeMarkets<SpotMarketAccount>(scope, decoder, 'SpotMarket', required.spot);
    const oracles: OracleInfo[] = [...initialPerps.values()].map((m) => ({ publicKey: m.oracle, source: m.oracleSource })).concat([...initialSpots.values()].map((m) => ({ publicKey: m.oracle, source: m.oracleSource })));
    const client = clientFor(scope, required, oracles);
    scope.programAccounts.add((await client.getStatePublicKey()).toBase58());
    const user = client.createUser(subaccount, { type: 'polling', accountLoader: scope.loader }, scope.authority);
    scope.users.push(user);
    user.eventEmitter.on('error', () => { /* Strict loader propagates fetch errors. */ });
    await user.subscribe(initial);
    user.accountSubscriber.updateData(initial, read.context.slot);
    const subscribed = await client.subscribe();
    if (!subscribed) throw new ProviderFailure('INCOMPLETE_DATA', 'Required Velocity state did not arrive. Please retry.');
    await client.fetchAccounts();
    // User is request-owned, not stored in client.users; the shared loader includes it.
    const current = user.getUserAccountAndSlot();
    if (!current || !scope.loader.getBufferAndSlot(address)?.buffer) throw new ProviderFailure('INCOMPLETE_DATA', 'The selected account did not arrive in the final read. Please retry.');
    requireSelectedAccount(current.data, scope.authority, subaccount);
    await client.accountSubscriber.setPerpOracleMap();
    await client.accountSubscriber.setSpotOracleMap();
    const observedSlot = Math.max(scope.loader.getSlot(), await scope.connection.getSlot('confirmed'));
    const perps = new Map<number, PerpMarketAccount>();
    const spots = new Map<number, SpotMarketAccount>();
    const perpOracles = new Map<number, DataAndSlot<OraclePriceData>>();
    const spotOracles = new Map<number, DataAndSlot<OraclePriceData>>();
    const valuationOracles = new Map<number, OraclePriceData>();
    for (const index of required.perp) {
      const market = client.getPerpMarketAccount(index);
      const key = getPerpMarketPublicKeySync(PROGRAM, index);
      if (!market || !scope.loader.getBufferAndSlot(key)?.buffer) continue;
      if (market.marketIndex !== index || !market.pubkey.equals(key)) throw new ProviderFailure('INVALID_ACCOUNT', 'Perpetual market identity changed unexpectedly.', 502, false);
      perps.set(index, market);
      if (scope.loader.getBufferAndSlot(market.oracle)?.buffer) {
        const oracle = client.getOraclePriceDataAndSlot(market.oracle, market.oracleSource);
        if (oracle) { perpOracles.set(index, oracle); try { valuationOracles.set(index, client.getMMOracleDataForPerpMarket(index, observedSlot)); } catch { /* Coverage marks missing valuation data unavailable. */ } }
      }
    }
    for (const index of required.spot) {
      const market = client.accountSubscriber.getSpotMarketAccountAndSlot(index)?.data;
      const key = getSpotMarketPublicKeySync(PROGRAM, index);
      if (!market || !scope.loader.getBufferAndSlot(key)?.buffer) continue;
      if (market.marketIndex !== index || !market.pubkey.equals(key)) throw new ProviderFailure('INVALID_ACCOUNT', 'Spot market identity changed unexpectedly.', 502, false);
      spots.set(index, market);
      if (market.oracle.equals(PublicKey.default) || scope.loader.getBufferAndSlot(market.oracle)?.buffer) {
        const oracle = client.getOraclePriceDataAndSlot(market.oracle, market.oracleSource);
        if (oracle) spotOracles.set(index, oracle);
      }
    }
    const data: ReadData = { account: current.data, authority, address: address.toBase58(), accountSlot: current.slot, observedSlot,
      state: scope.loader.getBufferAndSlot(await client.getStatePublicKey())?.buffer ? client.getStateAccount() : undefined, perps, spots, perpOracles, spotOracles, valuationOracles, user, retrievedAt: new Date().toISOString() };
    return { ...normalizeSnapshot(data), protocol: PROTOCOLS.velocity };
  }),
};
