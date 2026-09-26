import { isJupiterInventory } from './jupiter-inventory';
import type { createReport } from './report';
import { isReferencePerpCatalog } from './perp-markets';
import { isCanonicalProtocol } from './protocols';

export type Report = ReturnType<typeof createReport>;
export type DeviceReport = { id: string; title: string; created_at: string; report: Report };
export type DeviceReportStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const DEVICE_REPORTS_KEY = 'buffer.device-reports.v1';
export const MAX_DEVICE_REPORTS = 20;
export const MAX_DEVICE_REPORT_BYTES = 1024 * 1024;

type ErrorCode = 'corrupt' | 'unavailable' | 'quota' | 'limit' | 'invalid';
export class DeviceReportsError extends Error {
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
    this.name = 'DeviceReportsError';
  }
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nullableText = (value: unknown) => value === null || text(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const count = (value: unknown): value is number => integer(value) && value >= 0;
const slot = (value: unknown) => value === null || count(value);
const decimal = (value: unknown) => text(value) && value.length <= 128 && /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d{1,4})?$/i.test(value);
const nullableDecimal = (value: unknown) => value === null || decimal(value);
const riskContext = (value: unknown) => object(value) && value.scope === 'cross-margin' &&
  nullableDecimal(value.totalCollateral) && nullableDecimal(value.maintenanceRequirement) && nullableDecimal(value.maintenanceHeadroom) &&
  (typeof value.canBeLiquidated === 'boolean' || value.canBeLiquidated === null) &&
  ['clear', 'maintenance', 'liquidating', 'unavailable'].includes(String(value.status)) && text(value.explanation);
const array = (value: unknown, check: (item: unknown) => boolean): value is unknown[] => Array.isArray(value) && value.every(check);
const fields = (value: ObjectValue, names: string[], check: (item: unknown) => boolean) => names.every(name => check(value[name]));
const isoTime = (value: unknown) => text(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const nullableTime = (value: unknown) => value === null || isoTime(value);
const uuid = (value: unknown) => text(value) && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const title = (value: unknown) => text(value) && value.trim().length > 0 && value.length <= 180;

function protocol(value: unknown) {
  return value === undefined || isCanonicalProtocol(value);
}

/** A stored fixture may name the reference catalog it was built from, and nothing else. */
function catalog(value: unknown) {
  return value === undefined || isReferencePerpCatalog(value);
}

/** Validate stored JSON before it can be rendered or downloaded as a report. */
export function isReport(value: unknown): value is Report {
  if (!object(value) || value.report !== 'Buffer perpetual price scenario' || value.version !== 1 ||
      !['sample', 'live'].includes(String(value.sourceMode)) ||
      !['fixture', 'mainnet-beta'].includes(String(value.network)) ||
      (value.sourceMode === 'sample' ? value.network !== 'fixture' : value.network !== 'mainnet-beta') ||
      !nullableText(value.sampleName) || !nullableText(value.authority) || !isoTime(value.snapshotTime) ||
      !nullableTime(value.snapshotExpiresAt) || !text(value.numericEncoding) || !count(value.appFreshnessSeconds) ||
      !protocol(value.protocol) || !catalog(value.referenceCatalog) ||
      (value.referenceCatalog !== undefined && (value.sourceMode !== 'sample' || value.protocol !== undefined))) return false;
  const subaccount = value.selectedSubaccount;
  const slots = value.observedSlots;
  const scenario = value.scenario;
  const inventory = value.inventoryOutsideScenario;
  if (!object(subaccount) || !count(subaccount.id) || !text(subaccount.name) || !nullableText(subaccount.address) ||
      !object(slots) || !slot(slots.account) || !slot(slots.observed) || slots.atomicSameSlotRead !== false ||
      !object(scenario) || scenario.label !== 'Perp price P&L change' || !integer(scenario.shockPercent) ||
      scenario.shockPercent < -20 || scenario.shockPercent > 20 || !nullableText(scenario.disabledReason) ||
      !count(scenario.modeledPositions) || !count(scenario.totalPositions) || scenario.modeledPositions > scenario.totalPositions ||
      !object(inventory) || typeof inventory.available !== 'boolean') return false;
  return array(scenario.includedPositions, item => object(item) && fields(item, ['id', 'market', 'quote'], text) &&
      fields(item, ['size', 'baselinePrice', 'hypotheticalPrice', 'delta'], decimal)) &&
    array(scenario.excludedPositions, item => object(item) && fields(item, ['id', 'market', 'reason'], text)) &&
    array(scenario.totalsByQuoteCurrency, item => object(item) && text(item.quote) && decimal(item.delta)) &&
    scenario.modeledPositions === scenario.includedPositions.length &&
    array(value.baselineMetrics, item => object(item) && fields(item, ['label', 'unit', 'explanation'], text) && nullableDecimal(item.value)) &&
    (value.riskContext === undefined || riskContext(value.riskContext)) &&
    array(value.positions, item => object(item) && fields(item, ['id', 'market', 'asset', 'quote'], text) &&
      (item.inventory === undefined || isJupiterInventory(item.inventory)) &&
      integer(item.marketIndex) && decimal(item.size) && nullableDecimal(item.price) && nullableDecimal(item.notional) &&
      typeof item.modeled === 'boolean' && typeof item.isolated === 'boolean' && nullableText(item.exclusionReason) &&
      object(item.oracle) && slot(item.oracle.slot) && slot(item.oracle.readSlot) && typeof item.oracle.valid === 'boolean' && nullableText(item.oracle.reason) &&
      (item.oracle.observedAt === undefined || nullableTime(item.oracle.observedAt))) &&
    scenario.totalPositions === value.positions.length &&
    array(inventory.spotBalances, item => object(item) && text(item.market) && (item.kind === 'Collateral' || item.kind === 'Debt') &&
      nullableDecimal(item.amount) && (item.explanation === undefined || text(item.explanation))) &&
    array(inventory.openOrdersByMarket, item => object(item) && text(item.market) && count(item.count)) &&
    fields(value, ['assumptions', 'provenance', 'warnings'], items => array(items, text));
}

function isDeviceReport(value: unknown): value is DeviceReport {
  return object(value) && uuid(value.id) && title(value.title) && isoTime(value.created_at) && isReport(value.report);
}

function bytes(value: string) { return new TextEncoder().encode(value).byteLength; }
function corrupt(): never {
  throw new DeviceReportsError('corrupt', 'Saved reports on this device could not be read. Existing data was kept. Export a new report as JSON, or remove the Buffer report storage in browser settings to start a new library.');
}

/** No current-time checks: a saved report remains an unchanged historical record. */
export function decodeDeviceReports(raw: string | null): DeviceReport[] {
  if (raw === null) return [];
  if (bytes(raw) > MAX_DEVICE_REPORT_BYTES) return corrupt();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return corrupt(); }
  if (!object(parsed) || parsed.version !== 1 || !array(parsed.reports, isDeviceReport) || parsed.reports.length > MAX_DEVICE_REPORTS) return corrupt();
  const reports = parsed.reports as DeviceReport[];
  if (new Set(reports.map(item => item.id)).size !== reports.length) return corrupt();
  return reports.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function encodeDeviceReports(reports: readonly DeviceReport[]): string {
  if (reports.length > MAX_DEVICE_REPORTS) throw new DeviceReportsError('limit', 'This device holds 20 reports. Download and delete a report before saving another.');
  if (!reports.every(isDeviceReport) || new Set(reports.map(item => item.id)).size !== reports.length) {
    throw new DeviceReportsError('invalid', 'This scenario could not be saved because its report is invalid. Refresh the explorer and try again.');
  }
  let raw: string;
  try { raw = JSON.stringify({ version: 1, reports: [...reports].sort((a, b) => b.created_at.localeCompare(a.created_at)) }); }
  catch { throw new DeviceReportsError('invalid', 'This scenario could not be saved as JSON. Refresh the explorer and try again.'); }
  if (bytes(raw) > MAX_DEVICE_REPORT_BYTES) throw new DeviceReportsError('limit', 'Your device report library would exceed 1 MiB. Download and delete older reports before saving this one.');
  // Validate the actual serialized value too, before a write can replace a valid library.
  try { decodeDeviceReports(raw); }
  catch { throw new DeviceReportsError('invalid', 'This scenario could not be saved as JSON. Refresh the explorer and try again.'); }
  return raw;
}

function storageError(error: unknown): never {
  const name = object(error) ? error.name : undefined;
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    throw new DeviceReportsError('quota', 'Your browser storage is full. Download this scenario as JSON, or free browser storage and retry. Existing reports were kept.');
  }
  throw new DeviceReportsError('unavailable', 'Browser storage is unavailable. Allow site storage to save on this device, or download the scenario as JSON.');
}

function getStorage(storage?: DeviceReportStorage): DeviceReportStorage {
  if (storage) return storage;
  try {
    if (typeof window === 'undefined') throw new Error('No browser storage');
    return window.localStorage;
  } catch (error) { return storageError(error); }
}

export function listDeviceReports(storage?: DeviceReportStorage): DeviceReport[] {
  let raw: string | null;
  try { raw = getStorage(storage).getItem(DEVICE_REPORTS_KEY); }
  catch (error) { if (error instanceof DeviceReportsError) throw error; return storageError(error); }
  return decodeDeviceReports(raw);
}

function write(storage: DeviceReportStorage, reports: DeviceReport[]): DeviceReport[] {
  const raw = encodeDeviceReports(reports);
  try { storage.setItem(DEVICE_REPORTS_KEY, raw); } catch (error) { return storageError(error); }
  // Return detached JSON values, never references to the current scenario or caller's objects.
  return decodeDeviceReports(raw);
}

export function saveDeviceReport(report: Report, reportTitle: string, storage?: DeviceReportStorage): DeviceReport {
  const target = getStorage(storage);
  const reports = listDeviceReports(target);
  let id: string;
  try { id = crypto.randomUUID(); }
  catch { throw new DeviceReportsError('unavailable', 'This browser could not create a report ID. Open Buffer over HTTPS in a supported browser, or download the scenario as JSON.'); }
  const saved: DeviceReport = { id, title: reportTitle.trim(), created_at: new Date().toISOString(), report };
  return write(target, [saved, ...reports]).find(item => item.id === saved.id)!;
}

export function deleteDeviceReport(id: string, storage?: DeviceReportStorage): DeviceReport[] {
  const target = getStorage(storage);
  const reports = listDeviceReports(target);
  if (!reports.some(item => item.id === id)) return reports;
  return write(target, reports.filter(item => item.id !== id));
}
