/** Browser-safe Jupiter inventory metadata. It is never a linear payoff input. */
export interface JupiterInventory {
  kind: 'jupiter-perps'; direction: 'long' | 'short';
  sizeUsd: string; entryPriceUsd: string; collateralUsd: string;
  lockedAmount: string; lockedAmountAtomic: string; lockedToken: string; lockedTokenMint: string;
  positionAddress: string; custody: string; collateralCustody: string;
  oracleAddress: string; oracleType: string; oracleMaxPriceAgeSec: number;
  updatedAt: string; positionSlot: number; custodySlot: number; collateralCustodySlot: number;
}

export function isJupiterInventory(value: unknown): value is JupiterInventory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 128 && value.length > 0;
  const address = (value: unknown) => text(value) && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
  const decimal = (value: unknown) => text(value) && /^\d+(?:\.\d+)?$/.test(value);
  const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  return item.kind === 'jupiter-perps' && (item.direction === 'long' || item.direction === 'short') &&
    ['sizeUsd', 'entryPriceUsd', 'collateralUsd', 'lockedAmount'].every(key => decimal(item[key])) &&
    text(item.lockedAmountAtomic) && /^\d+$/.test(item.lockedAmountAtomic) && text(item.lockedToken) &&
    ['lockedTokenMint', 'positionAddress', 'custody', 'collateralCustody', 'oracleAddress'].every(key => address(item[key])) &&
    text(item.oracleType) && ['oracleMaxPriceAgeSec', 'positionSlot', 'custodySlot', 'collateralCustodySlot'].every(key => count(item[key])) &&
    text(item.updatedAt) && Number.isFinite(Date.parse(item.updatedAt)) && new Date(item.updatedAt).toISOString() === item.updatedAt;
}
