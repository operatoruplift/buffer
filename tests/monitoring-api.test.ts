import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocked = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocked.createClient }));
import { authenticateMonitoring, monitoringFetch, ownerRpc, workerRepository } from '../src/server/monitoring/repository';
import { scheduledMonitoring, validCronAuthorization } from '../src/server/monitoring/http';
import { readRuleBody, validateRuleInput } from '../src/server/monitoring/validation';

const owner = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const token = 'header.payload.signature'.repeat(4);
const body = { authority: '11111111111111111111111111111111', subaccountId: 0, direction: 'below', threshold: '300.00000001', cadenceMinutes: 15, timezone: 'UTC', cooldownMinutes: 15, hysteresis: '10', destinationId: id, enabled: true };
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://buffer-test.supabase.co'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key');
  mocked.createClient.mockReturnValue({ auth: { getUser: mocked.getUser }, rpc: mocked.rpc });
  mocked.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null }); mocked.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('monitoring owner and payload boundary', () => {
  it('protects scheduled GET and POST with a separate constant-time credential gate', async () => {
    vi.stubEnv('CRON_SECRET', 'c'.repeat(48));
    for (const method of ['GET', 'POST']) {
      const result = await scheduledMonitoring(new Request('https://buffer.test/api/monitoring/worker', { method, headers: { Authorization: `Bearer ${'é'.repeat(48)}` } }));
      expect(result.status).toBe(401); expect(result.headers.get('Cache-Control')).toContain('no-store');
    }
    expect(mocked.rpc).not.toHaveBeenCalled();
    expect(validCronAuthorization(new Request('https://buffer.test/api/monitoring/worker', { headers: { Authorization: `Bearer ${'c'.repeat(48)}` } }))).toBe(true);
    vi.stubEnv('CRON_SECRET', ''); expect(validCronAuthorization(new Request('https://buffer.test/api/monitoring/worker'))).toBe(false);
  });
  it('requires validated bearer sessions and takes owner identity only from Supabase', async () => {
    await expect(authenticateMonitoring(new Request('https://buffer.test/api/monitoring'))).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(mocked.getUser).not.toHaveBeenCalled();
    const session = await authenticateMonitoring(new Request('https://buffer.test/api/monitoring?ownerId=attacker', { headers: { Authorization: `Bearer ${token}` } }));
    expect(session.ownerId).toBe(owner); expect(mocked.getUser).toHaveBeenCalledWith(token);
  });
  it('rejects revoked/invalid sessions despite a browser bearer value', async () => {
    mocked.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Token revoked' } });
    await expect(authenticateMonitoring(new Request('https://buffer.test/api/monitoring', { headers: { Authorization: `Bearer ${token}` } }))).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
  });
  it('accepts exact decimals but rejects owner injection, partial create, fractions and arbitrary destinations', () => {
    expect(validateRuleInput(body)).toEqual(body);
    for (const invalid of [{ ...body, ownerId: owner }, { ...body, webhook: 'https://evil.test' }, { ...body, cadenceMinutes: 1.5 }, { ...body, threshold: 'NaN' }, { ...body, threshold: '1000000000000000000' }, { ...body, hysteresis: '-1' }, { ...body, destinationId: 'https://discord.com' }, { ...body, timezone: 'Invalid/Timezone' }, { ...body, enabled: 'true' }, { threshold: '1' }]) expect(() => validateRuleInput(invalid)).toThrow();
    expect(validateRuleInput({ enabled: false }, true)).toEqual({ enabled: false });
    expect(() => validateRuleInput({ authority: body.authority }, true)).toThrow();
  });
  it('bounds JSON input and rejects cross-origin browser mutations', async () => {
    await expect(readRuleBody(new Request('https://buffer.test/api/monitoring', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://elsewhere.test' }, body: '{}' }))).rejects.toMatchObject({ code: 'ORIGIN_REJECTED' });
    await expect(readRuleBody(new Request('https://buffer.test/api/monitoring', { method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(4097) }))).rejects.toMatchObject({ code: 'INVALID_RULE' });
  });
  it('hides raw database errors and never uses a service-role credential', async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: { code: 'UNKNOWN', message: 'private-destination-token' } });
    const session = await authenticateMonitoring(new Request('https://buffer.test/api/monitoring', { headers: { Authorization: `Bearer ${token}` } }));
    await expect(ownerRpc(session.client, 'buffer_monitor_status')).rejects.toMatchObject({ message: 'Cloud monitoring storage is temporarily unavailable.' });
    expect(mocked.createClient.mock.calls[0][1]).toBe('public-key');
  });
  it('reports duplicate account rules as a conflict instead of silently creating a hidden monitor', async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: { code: '23505' } });
    const session = await authenticateMonitoring(new Request('https://buffer.test/api/monitoring', { headers: { Authorization: `Bearer ${token}` } }));
    await expect(ownerRpc(session.client, 'buffer_monitor_mutate')).rejects.toMatchObject({ code: 'RULE_ALREADY_EXISTS', status: 409 });
  });
  it('uses the server-only scoped secret for a fixed RPC and rejects missing configuration', async () => {
    vi.stubEnv('BUFFER_ALERT_WORKER_SECRET', ''); expect(() => workerRepository()).toThrow();
    vi.stubEnv('BUFFER_ALERT_WORKER_SECRET', 'a'.repeat(48));
    const repository = workerRepository(); await repository.command('start', { runKey: 'cron:1', mode: 'dry_run' });
    expect(mocked.rpc).toHaveBeenCalledWith('buffer_monitor_worker', { p_secret: 'a'.repeat(48), p_action: 'start', p_data: { runKey: 'cron:1', mode: 'dry_run' } });
  });
  it('forbids redirects/caching and bounds upstream JSON response bodies', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('x'.repeat(262145), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetcher);
    await expect(monitoringFetch('https://buffer-test.supabase.co/rest/v1/rpc/buffer_monitor_status')).rejects.toThrow('bound');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store', redirect: 'error' });
  });
});
