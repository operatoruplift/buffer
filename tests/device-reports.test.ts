import { describe, expect, it } from 'vitest';
import { createReport } from '../src/lib/report';
import { calculateScenario } from '../src/lib/scenario';
import { getSampleSnapshot } from '../src/lib/samples';
import { PROTOCOLS } from '../src/lib/protocols';
import {
  DEVICE_REPORTS_KEY, MAX_DEVICE_REPORT_BYTES, DeviceReportsError, decodeDeviceReports,
  deleteDeviceReport, encodeDeviceReports, listDeviceReports, saveDeviceReport,
  type DeviceReport, type DeviceReportStorage,
} from '../src/lib/device-reports';

class MemoryStorage implements DeviceReportStorage {
  entries = new Map<string, string>();
  getItem(key: string) { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string) { this.entries.set(key, value); }
}
function report() {
  const snapshot = getSampleSnapshot('partial-coverage');
  return createReport(snapshot, calculateScenario(snapshot, -10));
}
function record(index = 0): DeviceReport {
  return { id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, title: 'A saved perspective', created_at: `2026-09-11T12:00:${String(index).padStart(2, '0')}.000Z`, report: report() };
}

describe('device report library', () => {
  it('saves, reloads, and downloads the exact historical snapshot and shock without mutation', () => {
    const storage = new MemoryStorage();
    const original = report();
    const before = JSON.stringify(original);
    const saved = saveDeviceReport(original, '  Scenario at −10%  ', storage);
    expect(saved.title).toBe('Scenario at −10%');
    expect(saved.id).toMatch(/^[\da-f-]{36}$/);
    expect(Date.parse(saved.created_at)).not.toBeNaN();
    expect(saved.report).toEqual(original);
    expect(saved.report).not.toBe(original);
    saved.report.scenario.shockPercent = 20;
    expect(JSON.stringify(original)).toBe(before);
    const reloaded = listDeviceReports(storage);
    expect(reloaded[0].report.scenario.shockPercent).toBe(-10);
    expect(reloaded[0].report.snapshotTime).toBe('2026-09-11T12:00:00.000Z');
    expect(reloaded[0].report.scenario.totalsByQuoteCurrency).toEqual([{ quote: 'USDC', delta: '3500' }]);
    expect(JSON.parse(JSON.stringify(reloaded[0].report))).toEqual(original);
  });

  it('lists latest first and deletes only the requested report in its own namespace', () => {
    const storage = new MemoryStorage();
    const items = [record(1), record(3), record(2)];
    const before = JSON.stringify(items);
    storage.setItem(DEVICE_REPORTS_KEY, encodeDeviceReports(items));
    storage.setItem('another-app', 'keep me');
    expect(JSON.stringify(items)).toBe(before);
    expect(listDeviceReports(storage).map(item => item.id)).toEqual([items[1].id, items[2].id, items[0].id]);
    expect(deleteDeviceReport(items[2].id, storage)).toHaveLength(2);
    expect(listDeviceReports(storage).map(item => item.id)).not.toContain(items[2].id);
    expect(storage.getItem('another-app')).toBe('keep me');
    expect(deleteDeviceReport('unknown', storage)).toHaveLength(2);
  });

  it('keeps expired live reports historical instead of changing their values or dates', () => {
    const item = record();
    item.report.sourceMode = 'live'; item.report.network = 'mainnet-beta';
    item.report.snapshotExpiresAt = '2026-09-11T12:02:00.000Z';
    expect(decodeDeviceReports(encodeDeviceReports([item]))[0].report).toEqual(item.report);
  });

  it('round-trips both known protocols and rejects altered deployment identities or labels', () => {
    for (const protocol of Object.values(PROTOCOLS)) {
      const item = record();
      item.report.protocol = { ...protocol };
      expect(decodeDeviceReports(encodeDeviceReports([item]))[0].report.protocol).toEqual(protocol);
      item.report.protocol.programId = 'pretend-program';
      expect(() => encodeDeviceReports([item])).toThrow(DeviceReportsError);
      item.report.protocol = { ...protocol, label: 'x'.repeat(1000) };
      expect(() => encodeDeviceReports([item])).toThrow(DeviceReportsError);
    }
  });

  it('starts empty only when the key is absent; corrupt JSON cannot be overwritten or deleted', () => {
    const storage = new MemoryStorage();
    expect(listDeviceReports(storage)).toEqual([]);
    storage.setItem(DEVICE_REPORTS_KEY, '{broken');
    for (const action of [() => listDeviceReports(storage), () => saveDeviceReport(report(), 'New report', storage), () => deleteDeviceReport('anything', storage)]) {
      expect(action).toThrow(DeviceReportsError);
      expect(action).toThrow(/Existing data was kept/);
      expect(storage.getItem(DEVICE_REPORTS_KEY)).toBe('{broken');
    }
  });

  it.each([
    ['header', (item: DeviceReport) => { item.report.report = 'unrelated'; }],
    ['version', (item: DeviceReport) => { item.report.version = 2; }],
    ['source/network mismatch', (item: DeviceReport) => { item.report.network = 'mainnet-beta'; }],
    ['non-decimal value', (item: DeviceReport) => { item.report.scenario.totalsByQuoteCurrency[0].delta = 'NaN'; }],
    ['incorrect numeric type', (item: DeviceReport) => { (item.report.scenario.includedPositions[0] as unknown as Record<string, unknown>).size = 100; }],
    ['missing nested oracle', (item: DeviceReport) => { delete (item.report.positions[0] as unknown as Record<string, unknown>).oracle; }],
    ['invalid date', (item: DeviceReport) => { item.created_at = '2026-02-31T12:00:00.000Z'; }],
    ['invalid title', (item: DeviceReport) => { item.title = ' '; }],
    ['oversized title', (item: DeviceReport) => { item.title = 'a'.repeat(181); }],
    ['shock outside supported bounds', (item: DeviceReport) => { item.report.scenario.shockPercent = 21; }],
    ['wrong counts', (item: DeviceReport) => { item.report.scenario.modeledPositions = 0; }],
  ])('rejects untrusted stored %s before rendering or downloading', (_name, mutate) => {
    const item = record(); mutate(item);
    expect(() => decodeDeviceReports(JSON.stringify({ version: 1, reports: [item] }))).toThrow(/could not be read/);
  });

  it('rejects a duplicate ID and malformed or future library envelope', () => {
    expect(() => decodeDeviceReports(JSON.stringify({ version: 1, reports: [record(), record()] }))).toThrow(DeviceReportsError);
    for (const raw of ['null', '[]', '{}', '{"version":2,"reports":[]}', '{"version":1,"reports":{}}']) {
      expect(() => decodeDeviceReports(raw)).toThrow(DeviceReportsError);
    }
  });

  it('refuses the 21st report without silently evicting or modifying the existing 20', () => {
    const storage = new MemoryStorage();
    storage.setItem(DEVICE_REPORTS_KEY, encodeDeviceReports(Array.from({ length: 20 }, (_, index) => record(index))));
    const before = storage.getItem(DEVICE_REPORTS_KEY);
    expect(() => saveDeviceReport(report(), 'Overflow', storage)).toThrow(/20 reports/);
    expect(storage.getItem(DEVICE_REPORTS_KEY)).toBe(before);
  });

  it('counts UTF-8 serialized bytes and preserves the library when a save would exceed 1 MiB', () => {
    const storage = new MemoryStorage();
    saveDeviceReport(report(), 'Keep this', storage);
    const before = storage.getItem(DEVICE_REPORTS_KEY);
    const large = report();
    large.warnings = ['あ'.repeat(Math.ceil(MAX_DEVICE_REPORT_BYTES / 3))];
    expect(() => saveDeviceReport(large, 'Too large', storage)).toThrow(/1 MiB/);
    expect(storage.getItem(DEVICE_REPORTS_KEY)).toBe(before);
    expect(() => decodeDeviceReports(' '.repeat(MAX_DEVICE_REPORT_BYTES + 1))).toThrow(DeviceReportsError);
  });

  it('reports quota exhaustion without claiming the save succeeded', () => {
    const storage = new MemoryStorage();
    saveDeviceReport(report(), 'Keep this', storage);
    const before = storage.getItem(DEVICE_REPORTS_KEY);
    storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    expect(() => saveDeviceReport(report(), 'Will fail', storage)).toThrow(/storage is full/);
    expect(storage.getItem(DEVICE_REPORTS_KEY)).toBe(before);
  });

  it('validates serialized JSON before replacing valid storage', () => {
    const storage = new MemoryStorage();
    saveDeviceReport(report(), 'Keep this', storage);
    const before = storage.getItem(DEVICE_REPORTS_KEY);
    const unsafe = Object.assign(report(), { toJSON: () => ({ version: 999 }) });
    expect(() => saveDeviceReport(unsafe, 'Invalid serialized report', storage)).toThrow(/could not be saved as JSON/);
    expect(storage.getItem(DEVICE_REPORTS_KEY)).toBe(before);
  });

  it('explains blocked reads and writes without discarding other data', () => {
    const blocked = { getItem: () => { throw new DOMException('Denied', 'SecurityError'); }, setItem: () => {} };
    expect(() => listDeviceReports(blocked)).toThrow(/Allow site storage/);
    const storage = new MemoryStorage();
    storage.setItem = () => { throw new DOMException('Denied', 'SecurityError'); };
    expect(() => saveDeviceReport(report(), 'Will fail', storage)).toThrow(/Allow site storage/);
  });
});
