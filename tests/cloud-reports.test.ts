import { describe, expect, it } from 'vitest';
import { decodeCloudReports, isCloudReportPayload, MAX_CLOUD_REPORT_BYTES } from '../src/lib/cloud-reports';
import { createReport } from '../src/lib/report';
import { getSampleSnapshot } from '../src/lib/samples';
import { calculateScenario } from '../src/lib/scenario';

function fixture() {
  const snapshot = getSampleSnapshot('partial-coverage');
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Partial coverage · -10% move',
    created_at: '2026-09-11T12:05:01.123456+00:00',
    report: createReport(snapshot, calculateScenario(snapshot, -10)),
  };
}

describe('cloud report response boundary', () => {
  it('preserves historical decimal strings, timestamps, scope and source without refresh', () => {
    const row = fixture();
    const before = JSON.stringify(row);
    const decoded = decodeCloudReports([row]);
    expect(JSON.stringify(decoded[0])).toBe(before);
    expect(decoded[0].report.scenario.totalsByQuoteCurrency).toEqual([{ quote: 'USDC', delta: '3500' }]);
    expect(decoded[0].report.scenario.excludedPositions).toHaveLength(1);
    expect(decoded[0].created_at).toBe('2026-09-11T12:05:01.123456+00:00');
  });

  it('accepts an explicitly empty array but rejects missing data, duplicate IDs and more than 50 rows', () => {
    expect(decodeCloudReports([])).toEqual([]);
    for (const data of [null, undefined, {}, { data: [] }, [fixture(), fixture()], Array.from({ length: 51 }, fixture)]) {
      expect(() => decodeCloudReports(data)).toThrow();
    }
  });

  it.each([
    ['missing report', (row: ReturnType<typeof fixture>) => { (row as { report?: unknown }).report = undefined; }],
    ['invalid ID', (row: ReturnType<typeof fixture>) => { row.id = '../../wrong'; }],
    ['blank title', (row: ReturnType<typeof fixture>) => { row.title = ' '; }],
    ['oversized title', (row: ReturnType<typeof fixture>) => { row.title = 'x'.repeat(181); }],
    ['invalid timestamp', (row: ReturnType<typeof fixture>) => { row.created_at = '2026-02-31T12:00:00+00:00'; }],
    ['invalid decimal', (row: ReturnType<typeof fixture>) => { row.report.scenario.totalsByQuoteCurrency[0].delta = 'NaN'; }],
    ['missing nested value', (row: ReturnType<typeof fixture>) => { (row.report.positions[0] as { oracle?: unknown }).oracle = undefined; }],
    ['future version', (row: ReturnType<typeof fixture>) => { row.report.version = 2; }],
    ['inconsistent count', (row: ReturnType<typeof fixture>) => { row.report.scenario.modeledPositions = 99; }],
  ])('rejects %s for the whole read before rendering or download', (_name, change) => {
    const row = fixture(); change(row);
    expect(() => decodeCloudReports([row])).toThrow();
  });

  it('checks the cloud JSON byte limit and rejects malformed current saves without changing device limits', () => {
    const report = fixture().report;
    expect(isCloudReportPayload(report)).toBe(true);
    report.warnings = ['é'.repeat(MAX_CLOUD_REPORT_BYTES / 2)];
    expect(isCloudReportPayload(report)).toBe(false);
    expect(isCloudReportPayload({ report: 'Buffer perpetual price scenario', version: 1 })).toBe(false);
  });
});
