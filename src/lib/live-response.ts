import { isJupiterInventory } from './jupiter-inventory';
import { isCanonicalProtocol, type ProtocolId } from './protocols';
import type { Discovery, Snapshot } from './types';

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 4096;
const optionalText = (value: unknown) => value === null || text(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const slot = (value: unknown) => value === null || count(value);
const time = (value: unknown) => text(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const retrieved = (value: unknown) => time(value) && Date.parse(value as string) <= Date.now() + 5_000;
const decimal = (value: unknown) => typeof value === 'string' && value.length <= 128 && /^-?\d+(?:\.\d+)?$/.test(value);
const optionalDecimal = (value: unknown) => value === null || decimal(value);
const riskContext = (value: unknown) => object(value) && value.scope === 'cross-margin' &&
  optionalDecimal(value.totalCollateral) && optionalDecimal(value.maintenanceRequirement) && optionalDecimal(value.maintenanceHeadroom) &&
  (typeof value.canBeLiquidated === 'boolean' || value.canBeLiquidated === null) &&
  ['clear', 'maintenance', 'liquidating', 'unavailable'].includes(String(value.status)) && text(value.explanation);
const list = (value: unknown, check: (value: unknown) => boolean, max = 1024): value is unknown[] => Array.isArray(value) && value.length <= max && value.every(check);
const subaccount = (value: unknown) => object(value) && count(value.id) && value.id <= 65535 && text(value.name) && optionalText(value.address);
const identity = (value: RecordValue, authority: string, protocol: ProtocolId) => value.authority === authority && isCanonicalProtocol(value.protocol) && value.protocol.id === protocol;
const unique = (items: unknown[], key: string) => new Set(items.map(item => (item as RecordValue)[key])).size === items.length;

/** Reject wrong-account or malformed successful responses before committing UI state. */
export function isDiscoveryResponse(value: unknown, authority: string, protocol: ProtocolId): value is Discovery {
  return object(value) && identity(value, authority, protocol) && retrieved(value.retrievedAt) &&
    list(value.subaccounts, subaccount) && unique(value.subaccounts, 'id');
}

export function isSnapshotResponse(value: unknown, authority: string, protocol: ProtocolId, accountId: number, accountAddress: string | null): value is Snapshot {
  if (!object(value) || !identity(value, authority, protocol) || value.source !== 'live' || value.network !== 'mainnet-beta' ||
    value.catalog !== undefined || // A fixture catalog never describes a live account read.
    value.sampleName !== null || !subaccount(value.subaccount) || !object(value.subaccount) || value.subaccount.id !== accountId ||
    value.subaccount.address !== accountAddress || !retrieved(value.retrievedAt) || !(value.expiresAt === null || time(value.expiresAt)) ||
    !slot(value.accountSlot) || !slot(value.observedSlot) || typeof value.inventoryAvailable !== 'boolean' ||
    (value.risk !== undefined && (protocol !== 'velocity' || !riskContext(value.risk)))) return false;
  return list(value.positions, item => object(item) && text(item.id) && Number.isSafeInteger(item.marketIndex) &&
    text(item.market) && text(item.asset) && text(item.quote) && decimal(item.size) && optionalDecimal(item.price) && optionalDecimal(item.notional) &&
    (protocol === 'jupiter' ? isJupiterInventory(item.inventory) && item.modeled === false && item.price === null && item.size === '0' && item.quote === 'USD' : item.inventory === undefined) &&
    typeof item.modeled === 'boolean' && typeof item.isolated === 'boolean' && optionalText(item.exclusionReason) &&
    object(item.oracle) && slot(item.oracle.slot) && slot(item.oracle.readSlot) && typeof item.oracle.valid === 'boolean' && optionalText(item.oracle.reason) &&
    (item.oracle.observedAt === undefined || item.oracle.observedAt === null || time(item.oracle.observedAt)) &&
    (!item.oracle.valid || (protocol === 'pacifica' ? retrieved(item.oracle.observedAt) : count(item.oracle.slot) && count(item.oracle.readSlot)))) && unique(value.positions, 'id') &&
    list(value.metrics, item => object(item) && text(item.label) && optionalDecimal(item.value) && text(item.unit) && text(item.explanation), 50) &&
    list(value.spots, item => object(item) && text(item.market) && ['Collateral', 'Debt'].includes(String(item.kind)) && optionalDecimal(item.amount) &&
      (item.explanation === undefined || text(item.explanation))) &&
    list(value.orders, item => object(item) && text(item.market) && count(item.count)) &&
    list(value.warnings, text) && list(value.provenance, text);
}
