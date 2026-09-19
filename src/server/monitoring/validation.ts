import { MONITORING_UUID, type MonitoringRuleInput, type MonitoringRulePatch } from '@/lib/monitoring';
import { validateAuthority } from '@/server/boundary';
import { MonitoringFailure } from './repository';

const FIELDS = ['authority', 'subaccountId', 'direction', 'threshold', 'cadenceMinutes', 'timezone', 'cooldownMinutes', 'hysteresis', 'destinationId', 'enabled'];
const DECIMAL = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,8})?$/;
const POSITIVE = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,8})?$/;
const bad = () => new MonitoringFailure('INVALID_RULE', 'Use a complete Velocity rule, valid numeric bounds, timezone, and verified destination.', 400);
export function validateRuleId(value: string) { if (!MONITORING_UUID.test(value)) throw bad(); return value; }
export function validateRuleInput(value: unknown, partial = false): MonitoringRuleInput | MonitoringRulePatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad();
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (!keys.length || keys.some(key => !FIELDS.includes(key)) || (!partial && FIELDS.some(field => !(field in input))) || (partial && ('authority' in input || 'subaccountId' in input))) throw bad();
  if ('authority' in input) { if (typeof input.authority !== 'string') throw bad(); try { if (validateAuthority(input.authority) !== input.authority) throw bad(); } catch { throw bad(); } }
  if ('subaccountId' in input && (!Number.isSafeInteger(input.subaccountId) || Number(input.subaccountId) < 0 || Number(input.subaccountId) > 65535)) throw bad();
  if ('direction' in input && input.direction !== 'above' && input.direction !== 'below') throw bad();
  if ('threshold' in input && (typeof input.threshold !== 'string' || !DECIMAL.test(input.threshold))) throw bad();
  if ('hysteresis' in input && (typeof input.hysteresis !== 'string' || !POSITIVE.test(input.hysteresis))) throw bad();
  for (const field of ['cadenceMinutes', 'cooldownMinutes']) if (field in input && (!Number.isSafeInteger(input[field]) || Number(input[field]) < 1 || Number(input[field]) > 1440)) throw bad();
  if ('enabled' in input && typeof input.enabled !== 'boolean') throw bad();
  if ('destinationId' in input && (typeof input.destinationId !== 'string' || !MONITORING_UUID.test(input.destinationId))) throw bad();
  if ('timezone' in input) { try { if (typeof input.timezone !== 'string' || input.timezone.length > 80) throw bad(); new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { throw bad(); } }
  return input as unknown as MonitoringRuleInput | MonitoringRulePatch;
}
export async function readRuleBody(request: Request): Promise<unknown> {
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) throw bad();
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new MonitoringFailure('ORIGIN_REJECTED', 'This request did not originate from Buffer.', 403);
  const reader = request.body?.getReader();
  if (!reader) throw bad();
  let bytes = 0; let content = '';
  const decoder = new TextDecoder();
  try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 4096) throw bad(); content += decoder.decode(chunk.value, { stream: true }); } content += decoder.decode(); return JSON.parse(content); }
  catch { throw bad(); } finally { await reader.cancel().catch(() => undefined); }
}
