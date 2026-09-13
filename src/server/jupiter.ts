import 'server-only';
import { Connection, PublicKey } from '@solana/web3.js';
import { createRpcFetch } from './rpc-fetch';
import { ProviderFailure, validateAuthority } from './boundary';
import {
  JUPITER_JLP_POOL,
  JUPITER_PERPS_PROGRAM_ID,
  JupiterDecodeError,
  decodeJupiterCustody,
  decodeJupiterPool,
  decodeJupiterPosition,
  deriveJupiterPositionPda,
  jupiterPositionFilters,
} from './jupiter-decoder';
import {
  JupiterNormalizationError,
  normalizeJupiterInventory,
  type JupiterCustodyRead,
  type JupiterInventorySnapshot,
  type JupiterPoolRead,
  type JupiterPositionRead,
} from './jupiter-normalize';

const REQUEST_TIMEOUT_MS = 18_000;
const MAX_POSITION_ACCOUNTS = 32;
const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const CONFIRMED = 'confirmed' as const;
const PROGRAM = new PublicKey(JUPITER_PERPS_PROGRAM_ID);
const POOL = new PublicKey(JUPITER_JLP_POOL);

export interface JupiterDiscovery {
  protocol: 'jupiter';
  authority: string;
  subaccounts: [{ id: 0; name: string; address: string }];
  retrievedAt: string;
  positionCount: number;
  closedPositionCount: number;
}

function invalidAccount(message: string, retryable = false): ProviderFailure {
  return new ProviderFailure('INVALID_ACCOUNT', message, 502, retryable);
}

function invalidData(message: string): ProviderFailure {
  return new ProviderFailure('INVALID_DATA', message, 502, false);
}

function mapJupiterError(error: unknown): ProviderFailure {
  if (error instanceof ProviderFailure) return error;
  if (error instanceof JupiterDecodeError) {
    return new ProviderFailure(error.code, 'Jupiter returned account bytes that Buffer could not verify.', 502, false);
  }
  if (error instanceof JupiterNormalizationError) {
    const retryable = error.code === 'CUSTODY_UNVERIFIED';
    return new ProviderFailure(error.code, 'Jupiter account identity could not be verified for this read.', 502, retryable);
  }
  return new ProviderFailure('RPC_ERROR', 'The Jupiter live read could not complete. Please retry.', 502, true);
}

function accountData(value: Awaited<ReturnType<Connection['getAccountInfoAndContext']>>, address: string, label: string): { data: Buffer; slot: number; owner: PublicKey } {
  if (!value.value) throw invalidAccount(`The canonical Jupiter ${label} account was not found.`);
  if (!value.value.owner.equals(PROGRAM)) throw invalidAccount(`The Jupiter ${label} account is not owned by the fixed Perpetuals program.`);
  if (!Number.isSafeInteger(value.context.slot) || value.context.slot < 0) throw invalidData(`The Jupiter ${label} read slot is invalid.`);
  if (address !== address.trim()) throw invalidData(`The Jupiter ${label} address is not canonical.`);
  return { data: value.value.data, slot: value.context.slot, owner: value.value.owner };
}

async function withConnection<T>(run: (connection: Connection) => Promise<T>): Promise<T> {
  const endpoint = process.env.SOLANA_RPC_URL?.trim();
  if (!endpoint) throw new ProviderFailure('NOT_CONFIGURED', 'Jupiter live reads require server-side SOLANA_RPC_URL configuration.', 503, false);
  try {
    const configured = new URL(endpoint);
    if (configured.protocol !== 'https:' && configured.protocol !== 'http:') throw new Error('invalid endpoint');
  } catch {
    throw new ProviderFailure('INVALID_CONFIGURATION', 'The configured Solana RPC endpoint is invalid.', 503, false);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const connection = new Connection(endpoint, {
      commitment: CONFIRMED,
      disableRetryOnRateLimit: true,
      fetch: createRpcFetch(endpoint, controller.signal),
    });
    if (await connection.getGenesisHash() !== MAINNET_GENESIS_HASH) throw new ProviderFailure('WRONG_NETWORK', 'The configured RPC is not Solana mainnet-beta.', 503, false);
    return await run(connection);
  } catch (error) {
    if (error instanceof ProviderFailure) throw error;
    if (controller.signal.aborted) throw new ProviderFailure('TIMEOUT', 'The Jupiter live read timed out. Please retry.', 504, true);
    throw mapJupiterError(error);
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}

async function readPool(connection: Connection): Promise<JupiterPoolRead> {
  const result = await connection.getAccountInfoAndContext(POOL, CONFIRMED);
  const account = accountData(result, JUPITER_JLP_POOL, 'Pool');
  return { address: JUPITER_JLP_POOL, readSlot: account.slot, ...decodeJupiterPool(account.data) };
}

async function readPositions(connection: Connection, authority: string): Promise<{ positions: JupiterPositionRead[]; closedPositionCount: number; readSlot: number }> {
  const result = await connection.getProgramAccounts(PROGRAM, {
    commitment: CONFIRMED,
    encoding: 'base64',
    // Do not add a dataSize filter here. A future account allocation with the
    // same Anchor discriminator must reach the decoder and fail closed rather
    // than looking like an empty wallet. The decoder enforces the verified
    // 216-byte layout after this bounded, owner-scoped query.
    filters: [...jupiterPositionFilters(authority)],
    withContext: true,
  });
  if (!('context' in result) || !Array.isArray(result.value)) throw invalidData('The Jupiter position discovery response was not contextualized.');
  if (result.value.length > MAX_POSITION_ACCOUNTS) throw new ProviderFailure('TOO_MANY_ACCOUNTS', 'This Jupiter wallet has more positions than Buffer can safely read at once.', 502, false);
  const positions: JupiterPositionRead[] = [];
  let closedPositionCount = 0;
  for (const item of result.value) {
    if (!item.account.owner.equals(PROGRAM)) throw invalidAccount('A discovered Jupiter position is owned by another program.');
    const decoded = decodeJupiterPosition(item.account.data);
    const address = item.pubkey.toBase58();
    if (decoded.owner !== authority || decoded.pool !== JUPITER_JLP_POOL) throw invalidAccount('A discovered Jupiter position does not belong to the requested wallet and pool.');
    if (decoded.side === 'none') throw invalidData('A Jupiter position has no supported long or short direction.');
    const expected = deriveJupiterPositionPda({ owner: authority, pool: JUPITER_JLP_POOL, custody: decoded.custody, collateralCustody: decoded.collateralCustody, side: decoded.side });
    if (expected !== address) throw invalidAccount('A discovered Jupiter position does not match its canonical PDA.');
    if (decoded.sizeUsdAtomic === 0n) {
      closedPositionCount += 1;
      positions.push({ address, accountSlot: result.context.slot, ...decoded });
      continue;
    }
    positions.push({ address, accountSlot: result.context.slot, ...decoded });
  }
  if (!Number.isSafeInteger(result.context.slot) || result.context.slot < 0) throw invalidData('The Jupiter position discovery slot is invalid.');
  return { positions, closedPositionCount, readSlot: result.context.slot };
}

async function readCustodies(connection: Connection, pool: JupiterPoolRead): Promise<{ custodies: JupiterCustodyRead[]; readSlot: number }> {
  const addresses = pool.custodies.map((value) => {
    try { return new PublicKey(value); }
    catch { throw invalidData('The Jupiter Pool contains an invalid custody identity.'); }
  });
  const result = await connection.getMultipleAccountsInfoAndContext(addresses, CONFIRMED);
  if (!Number.isSafeInteger(result.context.slot) || result.context.slot < 0) throw invalidData('The Jupiter custody read slot is invalid.');
  if (result.value.length !== addresses.length) throw invalidData('The Jupiter custody response was incomplete.');
  const custodies: JupiterCustodyRead[] = [];
  result.value.forEach((account, index) => {
    if (!account) throw invalidAccount('A custody listed by the canonical Jupiter Pool was not found.');
    if (!account.owner.equals(PROGRAM)) throw invalidAccount('A Jupiter custody listed by the Pool is owned by another program.');
    const address = addresses[index].toBase58();
    custodies.push({ address, readSlot: result.context.slot, ...decodeJupiterCustody(account.data) });
  });
  return { custodies, readSlot: result.context.slot };
}

/** Read one wallet grouping (id 0) from Jupiter Perpetuals. */
export async function readJupiterInventory(authorityInput: string): Promise<JupiterInventorySnapshot> {
  const authority = validateAuthority(authorityInput);
  return withConnection(async (connection) => {
    try {
      const pool = await readPool(connection);
      if (pool.address !== JUPITER_JLP_POOL) throw invalidAccount('The Jupiter Pool address is not canonical.');
      const positions = await readPositions(connection, authority);
      const custodies = await readCustodies(connection, pool);
      const observedSlot = Math.max(pool.readSlot, positions.readSlot, custodies.readSlot, await connection.getSlot(CONFIRMED));
      return normalizeJupiterInventory({
        authority,
        pool,
        positions: positions.positions,
        custodies: custodies.custodies,
        retrievedAt: new Date().toISOString(),
        observedSlot,
      });
    } catch (error) {
      throw mapJupiterError(error);
    }
  });
}

export async function discoverJupiter(authorityInput: string): Promise<JupiterDiscovery> {
  const snapshot = await readJupiterInventory(authorityInput);
  return {
    protocol: 'jupiter',
    authority: snapshot.authority,
    subaccounts: [{ id: 0, name: 'Wallet account', address: snapshot.authority }],
    retrievedAt: snapshot.retrievedAt,
    positionCount: snapshot.positions.length,
    closedPositionCount: snapshot.closedPositionCount,
  };
}

export const jupiterProvider = { discover: discoverJupiter, inventory: readJupiterInventory };
