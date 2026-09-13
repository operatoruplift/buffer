import 'server-only';
import { PROTOCOLS } from '../lib/protocols';
import type { Snapshot } from '../lib/types';
import { ProviderFailure, type LiveProvider } from './boundary';
import { discoverJupiter, readJupiterInventory } from './jupiter';
import type { JupiterInventorySnapshot } from './jupiter-normalize';

// Mint identities and decimals verified against the captured canonical JLP custodies.
const TOKENS: Record<string, { symbol: string; decimals: number; marketIndex: number }> = {
  So11111111111111111111111111111111111111112: { symbol: 'SOL', decimals: 9, marketIndex: 0 },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': { symbol: 'ETH', decimals: 8, marketIndex: 1 },
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': { symbol: 'BTC', decimals: 8, marketIndex: 2 },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', decimals: 6, marketIndex: -1 },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', decimals: 6, marketIndex: -1 },
  JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD: { symbol: 'JupUSD', decimals: 6, marketIndex: -1 },
};

/** Adapt verified inventory to the existing UI contract without supplying linear inputs. */
export function toJupiterSnapshot(input: JupiterInventorySnapshot): Snapshot {
  const custodies = new Map(input.custodies.map(custody => [custody.address, custody]));
  return {
    protocol: PROTOCOLS.jupiter, source: 'live', network: 'mainnet-beta', authority: input.authority,
    sampleName: null, subaccount: input.subaccount, retrievedAt: input.retrievedAt, expiresAt: input.expiresAt,
    accountSlot: input.accountSlot, observedSlot: input.observedSlot,
    metrics: [], spots: [], orders: [], inventoryAvailable: false,
    positions: input.positions.map(position => {
      const custody = custodies.get(position.custody);
      const collateral = custodies.get(position.collateralCustody);
      const asset = custody && TOKENS[custody.mint];
      const token = collateral && TOKENS[collateral.mint];
      if (!custody || !collateral || !asset || !token || custody.decimals !== asset.decimals || collateral.decimals !== token.decimals || asset.marketIndex < 0 || position.lockedAmountCustody !== collateral.address || position.lockedAmountDecimals !== collateral.decimals) {
        throw new ProviderFailure('CUSTODY_UNVERIFIED', 'A Jupiter custody token identity or unit is outside the verified inventory reader.', 502, false);
      }
      return {
        id: position.id, marketIndex: asset.marketIndex, market: `${asset.symbol}-PERP`, asset: asset.symbol,
        size: '0', price: null, quote: 'USD', notional: position.sizeUsd,
        modeled: false, exclusionReason: position.exclusionReason, isolated: false,
        oracle: { slot: null, readSlot: null, valid: false, reason: 'Current Jupiter oracle prices are not decoded. Entry price is shown only as inventory.' },
        inventory: {
          kind: 'jupiter-perps', direction: position.direction, sizeUsd: position.sizeUsd,
          entryPriceUsd: position.entryPriceUsd, collateralUsd: position.collateralUsd,
          lockedAmount: position.lockedAmountNative, lockedAmountAtomic: position.lockedAmountAtomic,
          lockedToken: token.symbol, lockedTokenMint: collateral.mint,
          positionAddress: position.positionAccount, custody: position.custody, collateralCustody: position.collateralCustody,
          oracleAddress: position.oracleAccount, oracleType: position.oracleType, oracleMaxPriceAgeSec: position.oracleMaxPriceAgeSec,
          updatedAt: position.updateTime, positionSlot: position.accountReadSlot, custodySlot: position.custodyReadSlot,
          collateralCustodySlot: position.collateralCustodyReadSlot,
        },
      };
    }),
    warnings: [...input.warnings, 'Account equity, pending requests, fees, and aggregate collateral are not read by this inventory adapter.'],
    provenance: [...input.provenance, `Pool ${input.pool.address} read at slot ${input.pool.readSlot}; ${input.closedPositionCount} closed position accounts omitted.`],
  };
}

export const jupiterLiveProvider: LiveProvider = {
  async discover(authority) {
    const result = await discoverJupiter(authority);
    return { authority: result.authority, protocol: PROTOCOLS.jupiter, subaccounts: result.subaccounts, retrievedAt: result.retrievedAt };
  },
  async snapshot(authority, subaccount) {
    if (subaccount !== 0) throw new ProviderFailure('INVALID_SUBACCOUNT', 'Jupiter positions are grouped in wallet account #0.', 400, false);
    return toJupiterSnapshot(await readJupiterInventory(authority));
  },
};
