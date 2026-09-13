import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';

/**
 * Jupiter Perpetuals' fixed mainnet deployment. These values are protocol
 * identities, not user supplied configuration.
 */
export const JUPITER_PERPS_PROGRAM_ID = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu';
export const JUPITER_PERPS_EVENT_AUTHORITY = '37hJBDnntwqhGbK7L6M1bLyvccj4u55CCUiLPdYkiqBN';
export const JUPITER_JLP_POOL = '5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq';

/**
 * Reference custody addresses captured from the current JLP pool. The pool
 * account remains the runtime source of truth because the official docs now
 * list JupUSD in addition to the older USDC/USDT position table.
 */
export const JUPITER_REFERENCE_CUSTODIES = {
  SOL: '7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz',
  ETH: 'AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn',
  BTC: '5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm',
  USDC: 'G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa',
  USDT: '4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk',
  JUPUSD: 'DdwY1ELc9rRK7xNL3hTXabSFBmVrTPpfsUZSv2Y3LL1U',
} as const;

/** Account data allocation sizes observed from mainnet confirmed reads. */
export const JUPITER_POSITION_ACCOUNT_SIZE = 216;
export const JUPITER_POSITION_FIELDS_SIZE = 202;
export const JUPITER_CUSTODY_MIN_SIZE = 151;

const POSITION_DISCRIMINATOR = createHash('sha256').update('account:Position').digest().subarray(0, 8);
const CUSTODY_DISCRIMINATOR = createHash('sha256').update('account:Custody').digest().subarray(0, 8);
const POOL_DISCRIMINATOR = createHash('sha256').update('account:Pool').digest().subarray(0, 8);
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  const leadingZeroes = [...bytes].findIndex((value) => value !== 0);
  const zeroCount = leadingZeroes === -1 ? bytes.length : leadingZeroes;
  const encoded = digits.length === 1 && digits[0] === 0 ? '' : digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join('');
  return '1'.repeat(zeroCount) + encoded;
}

export const JUPITER_POSITION_DISCRIMINATOR_BASE58 = base58Encode(POSITION_DISCRIMINATOR);
export const JUPITER_CUSTODY_DISCRIMINATOR_BASE58 = base58Encode(CUSTODY_DISCRIMINATOR);
export const JUPITER_POOL_DISCRIMINATOR_BASE58 = base58Encode(POOL_DISCRIMINATOR);

export type JupiterSide = 'none' | 'long' | 'short';
export type JupiterOracleType = 'none' | 'test' | 'pyth';

export interface DecodedJupiterPosition {
  owner: string;
  pool: string;
  custody: string;
  collateralCustody: string;
  openTime: bigint;
  updateTime: bigint;
  side: JupiterSide;
  priceAtomic: bigint;
  sizeUsdAtomic: bigint;
  collateralUsdAtomic: bigint;
  realisedPnlUsdAtomic: bigint;
  cumulativeInterestSnapshot: bigint;
  lockedAmountAtomic: bigint;
  bump: number;
}

export interface DecodedJupiterCustody {
  pool: string;
  mint: string;
  tokenAccount: string;
  decimals: number;
  isStable: boolean;
  oracleAccount: string;
  oracleType: JupiterOracleType;
  oracleBufferAtomic: bigint;
  maxPriceAgeSec: number;
  accountDataLength: number;
}

export interface DecodedJupiterPool {
  name: string;
  custodies: string[];
  accountDataLength: number;
}

export class JupiterDecodeError extends Error {
  constructor(public readonly code: 'INVALID_DATA' | 'UNSUPPORTED_ACCOUNT_VERSION', message: string) {
    super(message);
    this.name = 'JupiterDecodeError';
  }
}

class Reader {
  private offset = 0;

  constructor(private readonly data: Buffer) {}

  get position(): number { return this.offset; }

  private ensure(size: number): void {
    if (!Number.isInteger(size) || size < 0 || this.offset + size > this.data.length) {
      throw new JupiterDecodeError('INVALID_DATA', 'Jupiter account data ended before the canonical fields were decoded.');
    }
  }

  bytes(size: number): Buffer {
    this.ensure(size);
    const value = this.data.subarray(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }

  u8(): number { return this.bytes(1)[0]; }

  u32(): number {
    const value = this.bytes(4).readUInt32LE(0);
    if (!Number.isSafeInteger(value)) throw new JupiterDecodeError('INVALID_DATA', 'Jupiter account data contains an invalid integer.');
    return value;
  }

  u64(): bigint { return this.bytes(8).readBigUInt64LE(0); }

  i64(): bigint { return this.bytes(8).readBigInt64LE(0); }

  u128(): bigint {
    const low = this.bytes(8).readBigUInt64LE(0);
    const high = this.bytes(8).readBigUInt64LE(0);
    return low | (high << 64n);
  }

  publicKey(): string {
    try { return new PublicKey(this.bytes(32)).toBase58(); }
    catch { throw new JupiterDecodeError('INVALID_DATA', 'Jupiter account data contains an invalid public key.'); }
  }
}

function checkDiscriminator(data: Buffer, expected: Buffer, account: string): void {
  if (data.length < 8 || !data.subarray(0, 8).equals(expected)) {
    throw new JupiterDecodeError('INVALID_DATA', `Jupiter ${account} account discriminator is not canonical.`);
  }
}

function decodeUtf8(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new JupiterDecodeError('INVALID_DATA', 'Jupiter pool account name is not valid UTF-8.');
  }
}

function side(value: number): JupiterSide {
  if (value === 0) return 'none';
  if (value === 1) return 'long';
  if (value === 2) return 'short';
  throw new JupiterDecodeError('INVALID_DATA', 'Jupiter position direction is not a canonical Side variant.');
}

function decodeOracleType(value: number): JupiterOracleType {
  if (value === 0) return 'none';
  if (value === 1) return 'test';
  if (value === 2) return 'pyth';
  throw new JupiterDecodeError('INVALID_DATA', 'Jupiter custody oracle type is not canonical.');
}

/** Decode the Position account defined by the official Jupiter Perps IDL. */
export function decodeJupiterPosition(data: Buffer): DecodedJupiterPosition {
  // The current on-chain allocation is 216 bytes: 8 discriminator + 202 IDL
  // fields + six zero reserved bytes. Rejecting another size prevents a future
  // account layout from being interpreted as the current layout.
  if (data.length !== JUPITER_POSITION_ACCOUNT_SIZE) {
    throw new JupiterDecodeError('UNSUPPORTED_ACCOUNT_VERSION', 'Jupiter Position account size is not the verified mainnet layout.');
  }
  checkDiscriminator(data, POSITION_DISCRIMINATOR, 'Position');
  const reader = new Reader(data);
  reader.bytes(8);
  const decoded: DecodedJupiterPosition = {
    owner: reader.publicKey(),
    pool: reader.publicKey(),
    custody: reader.publicKey(),
    collateralCustody: reader.publicKey(),
    openTime: reader.i64(),
    updateTime: reader.i64(),
    side: side(reader.u8()),
    priceAtomic: reader.u64(),
    sizeUsdAtomic: reader.u64(),
    collateralUsdAtomic: reader.u64(),
    realisedPnlUsdAtomic: reader.i64(),
    cumulativeInterestSnapshot: reader.u128(),
    lockedAmountAtomic: reader.u64(),
    bump: reader.u8(),
  };
  if (reader.position !== JUPITER_POSITION_FIELDS_SIZE + 8 || !reader.bytes(6).every((value) => value === 0)) {
    throw new JupiterDecodeError('UNSUPPORTED_ACCOUNT_VERSION', 'Jupiter Position reserved bytes are not the verified mainnet layout.');
  }
  return decoded;
}

/** Decode the canonical custody prefix needed to verify token/oracle identity. */
export function decodeJupiterCustody(data: Buffer): DecodedJupiterCustody {
  if (data.length < JUPITER_CUSTODY_MIN_SIZE) {
    throw new JupiterDecodeError('UNSUPPORTED_ACCOUNT_VERSION', 'Jupiter Custody account is shorter than the verified IDL prefix.');
  }
  checkDiscriminator(data, CUSTODY_DISCRIMINATOR, 'Custody');
  const reader = new Reader(data);
  reader.bytes(8);
  const pool = reader.publicKey();
  const mint = reader.publicKey();
  const tokenAccount = reader.publicKey();
  const decimals = reader.u8();
  const stableByte = reader.u8();
  if (stableByte !== 0 && stableByte !== 1) throw new JupiterDecodeError('INVALID_DATA', 'Jupiter custody stable flag is not canonical.');
  const oracleAccount = reader.publicKey();
  const oracleType = decodeOracleType(reader.u8());
  const oracleBufferAtomic = reader.u64();
  const maxPriceAgeSec = reader.u32();
  if (decimals > 18) throw new JupiterDecodeError('INVALID_DATA', 'Jupiter custody token decimals exceed the supported bound.');
  return { pool, mint, tokenAccount, decimals, isStable: stableByte === 1, oracleAccount, oracleType, oracleBufferAtomic, maxPriceAgeSec, accountDataLength: data.length };
}

/** Decode only the Pool prefix; the remaining economics are intentionally not modeled. */
export function decodeJupiterPool(data: Buffer): DecodedJupiterPool {
  checkDiscriminator(data, POOL_DISCRIMINATOR, 'Pool');
  const reader = new Reader(data);
  reader.bytes(8);
  const nameLength = reader.u32();
  if (nameLength > 64) throw new JupiterDecodeError('INVALID_DATA', 'Jupiter pool name exceeds the supported bound.');
  const name = decodeUtf8(reader.bytes(nameLength));
  const custodyCount = reader.u32();
  if (custodyCount === 0 || custodyCount > 16) throw new JupiterDecodeError('INVALID_DATA', 'Jupiter pool custody list is outside the supported bound.');
  const custodies = Array.from({ length: custodyCount }, () => reader.publicKey());
  if (new Set(custodies).size !== custodies.length) throw new JupiterDecodeError('INVALID_DATA', 'Jupiter pool custody list contains duplicates.');
  return { name, custodies, accountDataLength: data.length };
}

export function deriveJupiterPositionPda(input: { owner: string | PublicKey; pool?: string | PublicKey; custody: string | PublicKey; collateralCustody: string | PublicKey; side: Exclude<JupiterSide, 'none'> }): string {
  const toKey = (value: string | PublicKey): PublicKey => value instanceof PublicKey ? value : new PublicKey(value);
  const [address] = PublicKey.findProgramAddressSync([
    Buffer.from('position'),
    toKey(input.owner).toBuffer(),
    toKey(input.pool ?? JUPITER_JLP_POOL).toBuffer(),
    toKey(input.custody).toBuffer(),
    toKey(input.collateralCustody).toBuffer(),
    Buffer.from([input.side === 'long' ? 1 : 2]),
  ], new PublicKey(JUPITER_PERPS_PROGRAM_ID));
  return address.toBase58();
}

/** Exact RPC filters used by the official wallet discovery example. */
export function jupiterPositionFilters(authority: string): readonly [{ memcmp: { offset: 8; bytes: string } }, { memcmp: { offset: 0; bytes: string } }] {
  return [
    { memcmp: { offset: 8, bytes: new PublicKey(authority).toBase58() } },
    { memcmp: { offset: 0, bytes: JUPITER_POSITION_DISCRIMINATOR_BASE58 } },
  ];
}
