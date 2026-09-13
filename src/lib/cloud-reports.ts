import { isReport, type Report } from './device-reports';

export type SavedReport = { id: string; title: string; created_at: string; report: Report };
export const MAX_CLOUD_REPORTS = 50;
export const MAX_CLOUD_REPORT_BYTES = 262144;

/** Database timestamps may contain microseconds and a UTC offset. Keep them unchanged. */
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && Number.isFinite(Date.parse(value));
}

export function isCloudReportPayload(value: unknown): value is Report {
  if (!isReport(value)) return false;
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_CLOUD_REPORT_BYTES; }
  catch { return false; }
}

/** Treat a malformed response as a failed read, never as an empty library. */
export function decodeCloudReports(value: unknown): SavedReport[] {
  if (!Array.isArray(value) || value.length > MAX_CLOUD_REPORTS) throw new Error('Unreadable saved reports response');
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      typeof item.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id) ||
      ids.has(item.id) || typeof item.title !== 'string' || item.title.trim().length === 0 || item.title.length > 180 ||
      !timestamp(item.created_at) || !isCloudReportPayload(item.report)) throw new Error('Unreadable saved report record');
    ids.add(item.id);
  }
  return value as SavedReport[];
}
