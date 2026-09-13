import { PublicKey } from '@solana/web3.js';
import {
  JUPITER_JLP_POOL,
  deriveJupiterPositionPda,
  type DecodedJupiterCustody,
  type DecodedJupiterPool,
  type DecodedJupiterPosition,
  type JupiterOracleType,
  type JupiterSide,
} from './jupiter-decoder';

export const JUPITER_USD_DECIMALS = 6;
export const JUPITER_INVENTORY_TTL_MS = 120_000;

export interface JupiterPositionRead extends DecodedJupiterPosition {
  address: string;
  accountSlot: number;
}

export interface JupiterCustodyRead extends DecodedJupiterCustody {
  address: string;
  readSlot: number;
}

export interface JupiterPoolRead extends DecodedJupiterPool {
  address: string;
  readSlot: number;
}

export interface JupiterInventoryCustody {
  address: string;
  pool: string;
  mint: string;
  tokenAccount: string;
  decimals: number;
  isStable: boolean;
  oracleAccount: string;
  oracleType: JupiterOracleType;
  oracleBufferAtomic: string;
  maxPriceAgeSec: number;
  readSlot: number;
  accountDataLength: number;
}

export interface JupiterInventoryPosition {
  id: string;
  positionAccount: string;
  owner: string;
  pool: string;
  custody: string;
  collateralCustody: string;
  direction: Exclude<JupiterSide, 'none'>;
  sizeUsd: string;
  sizeUsdAtomic: string;
  entryPriceUsd: string;
  entryPriceAtomic: string;
  collateralUsd: string;
  collateralUsdAtomic: string;
  realisedPnlUsd: string;
  realisedPnlUsdAtomic: string;
  lockedAmountNative: string;
  lockedAmountAtomic: string;
  lockedAmountCustody: string;
  lockedAmountDecimals: number;
  openTime: string;
  updateTime: string;
  accountReadSlot: number;
  custodyReadSlot: number;
  collateralCustodyReadSlot: number;
  oracleAccount: string;
  oracleType: JupiterOracleType;
  oracleMaxPriceAgeSec: number;
  currentPriceUsd: null;
  currentPriceReadSlot: null;
  modeled: false;
  inventoryOnly: true;
  exclusionReason: string;
}

export interface JupiterInventorySnapshot {
  protocol: 'jupiter';
  source: 'live';
  network: 'mainnet-beta';
  authority: string;
  subaccount: { id: 0; name: string; address: string };
  retrievedAt: string;
  expiresAt: string;
  accountSlot: null;
  observedSlot: number;
  pool: { address: string; name: string; custodies: string[]; readSlot: number };
  positions: JupiterInventoryPosition[];
  custodies: JupiterInventoryCustody[];
  closedPositionCount: number;
  inventoryAvailable: true;
  warnings: string[];
  provenance: string[];
}

export class JupiterNormalizationError extends Error {
  constructor(public readonly code: 'INVALID_DATA' | 'ACCOUNT_MISMATCH' | 'CUSTODY_UNVERIFIED', message: string) {
    super(message);
    this.name = 'JupiterNormalizationError';
  }
}

function fail(code: JupiterNormalizationError['code'], message: string): never {
  throw new JupiterNormalizationError(code, message);
}

function address(value: string, label: string): string {
  try {
    const key = new PublicKey(value);
    if (key.toBase58() !== value) fail('INVALID_DATA', `Jupiter ${label} address is not canonical.`);
    return value;
  } catch (error) {
    if (error instanceof JupiterNormalizationError) throw error;
    fail('INVALID_DATA', `Jupiter ${label} address is not canonical.`);
  }
}

function slot(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_DATA', `Jupiter ${label} read slot is invalid.`);
  return value;
}

function decimalFromAtomic(value: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) fail('INVALID_DATA', 'Jupiter token decimals are outside the supported range.');
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  if (decimals === 0) return `${negative ? '-' : ''}${digits}`;
  const padded = digits.padStart(decimals + 1, '0');
  const split = padded.length - decimals;
  const integer = padded.slice(0, split);
  const fraction = padded.slice(split).replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function iso(value: bigint, label: string): string {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 4_102_444_800) fail('INVALID_DATA', `Jupiter ${label} timestamp is outside the supported range.`);
  const result = new Date(number * 1_000).toISOString();
  return result;
}

function normalizedCustody(read: JupiterCustodyRead, poolAddress: string): JupiterInventoryCustody {
  const custodyAddress = address(read.address, 'custody');
  slot(read.readSlot, 'custody');
  if (read.pool !== poolAddress) fail('CUSTODY_UNVERIFIED', 'Jupiter custody does not point at the canonical pool.');
  return {
    address: custodyAddress,
    pool: address(read.pool, 'custody pool'),
    mint: address(read.mint, 'custody mint'),
    tokenAccount: address(read.tokenAccount, 'custody token account'),
    decimals: read.decimals,
    isStable: read.isStable,
    oracleAccount: address(read.oracleAccount, 'custody oracle'),
    oracleType: read.oracleType,
    oracleBufferAtomic: read.oracleBufferAtomic.toString(),
    maxPriceAgeSec: read.maxPriceAgeSec,
    readSlot: read.readSlot,
    accountDataLength: read.accountDataLength,
  };
}

const INVENTORY_ONLY_REASON = 'Jupiter Perps is inventory-only: current oracle price, fees, funding, collateral effects, liquidation, and the lockedAmount maximum-profit cap are not modeled.';

/**
 * Purely normalize already-decoded reads. No network, SDK, price conversion,
 * or scenario calculation happens here. A position is returned as metadata
 * only; callers must not pass it to Buffer's linear price-shock engine.
 */
export function normalizeJupiterInventory(input: {
  authority: string;
  pool: JupiterPoolRead;
  positions: JupiterPositionRead[];
  custodies: JupiterCustodyRead[];
  retrievedAt: string;
  observedSlot: number;
}): JupiterInventorySnapshot {
  const authorityValue = address(input.authority, 'wallet');
  const poolAddress = address(input.pool.address, 'pool');
  slot(input.pool.readSlot, 'pool');
  slot(input.observedSlot, 'observed');
  if (poolAddress !== JUPITER_JLP_POOL || input.pool.name !== 'Pool') fail('ACCOUNT_MISMATCH', 'Jupiter Pool identity does not match the fixed mainnet deployment.');
  if (input.pool.custodies.length === 0 || input.pool.custodies.length > 16 || new Set(input.pool.custodies).size !== input.pool.custodies.length) fail('INVALID_DATA', 'Jupiter Pool custody identities are invalid.');
  if (input.positions.length > 32 || input.custodies.length > 16) fail('INVALID_DATA', 'Jupiter returned more accounts than the bounded reader supports.');
  const custodyReads = new Map<string, JupiterCustodyRead>();
  for (const read of input.custodies) {
    const key = address(read.address, 'custody');
    if (custodyReads.has(key)) fail('INVALID_DATA', 'Jupiter returned duplicate custody accounts.');
    custodyReads.set(key, read);
  }
  if (custodyReads.size !== input.pool.custodies.length || input.pool.custodies.some((key) => !custodyReads.has(address(key, 'pool custody')))) fail('CUSTODY_UNVERIFIED', 'Jupiter Pool custody sources could not all be verified.');
  const custodies = [...custodyReads.values()].map((read) => normalizedCustody(read, poolAddress));
  const custodyByAddress = new Map(custodies.map((custody) => [custody.address, custody]));
  const positions: JupiterInventoryPosition[] = [];
  let closedPositionCount = 0;
  const seenPositions = new Set<string>();
  for (const read of input.positions) {
    const positionAddress = address(read.address, 'position');
    slot(read.accountSlot, 'position');
    if (seenPositions.has(positionAddress)) fail('INVALID_DATA', 'Jupiter returned duplicate position accounts.');
    seenPositions.add(positionAddress);
    if (read.owner !== authorityValue || read.pool !== poolAddress) fail('ACCOUNT_MISMATCH', 'Jupiter position owner or pool does not match the requested wallet.');
    if (read.side === 'none') fail('INVALID_DATA', 'A Jupiter position has no supported long or short direction.');
    const expected = deriveJupiterPositionPda({ owner: authorityValue, pool: poolAddress, custody: read.custody, collateralCustody: read.collateralCustody, side: read.side });
    if (expected !== positionAddress) fail('ACCOUNT_MISMATCH', 'Jupiter position address does not match its canonical PDA.');
    if (read.sizeUsdAtomic === 0n) {
      closedPositionCount += 1;
      continue;
    }
    const custody = custodyByAddress.get(read.custody);
    const collateral = custodyByAddress.get(read.collateralCustody);
    if (!custody || !collateral) fail('CUSTODY_UNVERIFIED', 'Jupiter position custody or collateral custody was not returned by the canonical Pool.');
    if (read.priceAtomic <= 0n) fail('INVALID_DATA', 'An open Jupiter position has a nonpositive entry price.');
    positions.push({
      id: `jupiter-${positionAddress}`,
      positionAccount: positionAddress,
      owner: authorityValue,
      pool: poolAddress,
      custody: custody.address,
      collateralCustody: collateral.address,
      direction: read.side,
      sizeUsd: decimalFromAtomic(read.sizeUsdAtomic, JUPITER_USD_DECIMALS),
      sizeUsdAtomic: read.sizeUsdAtomic.toString(),
      entryPriceUsd: decimalFromAtomic(read.priceAtomic, JUPITER_USD_DECIMALS),
      entryPriceAtomic: read.priceAtomic.toString(),
      collateralUsd: decimalFromAtomic(read.collateralUsdAtomic, JUPITER_USD_DECIMALS),
      collateralUsdAtomic: read.collateralUsdAtomic.toString(),
      realisedPnlUsd: decimalFromAtomic(read.realisedPnlUsdAtomic, JUPITER_USD_DECIMALS),
      realisedPnlUsdAtomic: read.realisedPnlUsdAtomic.toString(),
      // Jupiter documents lockedAmount as the token that is locked in the
      // collateral custody. A short SOL/USDC position therefore uses USDC's
      // six decimals even though its position custody is SOL (nine decimals).
      lockedAmountNative: decimalFromAtomic(read.lockedAmountAtomic, collateral.decimals),
      lockedAmountAtomic: read.lockedAmountAtomic.toString(),
      lockedAmountCustody: collateral.address,
      lockedAmountDecimals: collateral.decimals,
      openTime: iso(read.openTime, 'open'),
      updateTime: iso(read.updateTime, 'update'),
      accountReadSlot: read.accountSlot,
      custodyReadSlot: custody.readSlot,
      collateralCustodyReadSlot: collateral.readSlot,
      oracleAccount: custody.oracleAccount,
      oracleType: custody.oracleType,
      oracleMaxPriceAgeSec: custody.maxPriceAgeSec,
      currentPriceUsd: null,
      currentPriceReadSlot: null,
      modeled: false,
      inventoryOnly: true,
      exclusionReason: INVENTORY_ONLY_REASON,
    });
  }
  const retrieved = new Date(input.retrievedAt);
  if (!Number.isFinite(retrieved.getTime()) || retrieved.toISOString() !== input.retrievedAt) fail('INVALID_DATA', 'Jupiter retrieval timestamp is not canonical.');
  return {
    protocol: 'jupiter',
    source: 'live',
    network: 'mainnet-beta',
    authority: authorityValue,
    subaccount: { id: 0, name: 'Wallet account', address: authorityValue },
    retrievedAt: input.retrievedAt,
    expiresAt: new Date(retrieved.getTime() + JUPITER_INVENTORY_TTL_MS).toISOString(),
    accountSlot: null,
    observedSlot: input.observedSlot,
    pool: { address: poolAddress, name: input.pool.name, custodies: [...input.pool.custodies], readSlot: input.pool.readSlot },
    positions,
    custodies,
    closedPositionCount,
    inventoryAvailable: true,
    warnings: [
      'Jupiter Perps positions are inventory-only and are excluded from Buffer price-shock totals.',
      'No current oracle account bytes were decoded, so currentPriceUsd is intentionally null.',
      'USD fields use Jupiter’s six-decimal atomic units. USD accounting is not treated as USDC settlement.',
      'lockedAmount is preserved in the collateral custody’s native token units; its maximum-profit cap is not applied.',
      'Pool, custody, and position reads are separate confirmed reads and do not form an atomic same-slot snapshot.',
    ],
    provenance: [
      'Jupiter Perpetuals fixed mainnet program: PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu.',
      'Position account schema: https://developers.jup.ag/docs/perps/position-account.',
      'Custody account schema and oracle metadata: https://developers.jup.ag/docs/perps/custody-account.',
      'Pool account schema: https://developers.jup.ag/docs/perps/pool-account.',
      'Position discovery follows the official-doc-linked owner memcmp + Position discriminator example.',
      'No wallet signing, transaction, quote conversion, or trade permission is used.',
    ],
  };
}

export { decimalFromAtomic as jupiterDecimalFromAtomic };
