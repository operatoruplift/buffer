import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocked = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../src/server/monitoring/coordinator', () => ({ runMonitoringWorker: mocked.run, notificationEvent: vi.fn() }));
vi.mock('../src/server/monitoring/repository', async importOriginal => ({
  ...await importOriginal<typeof import('../src/server/monitoring/repository')>(),
  workerRepository: () => ({ command: vi.fn() }),
}));
import { HEAD } from '../src/app/api/monitoring/worker/route';
const secret = 'local-head-contract-test-credential-00000000';
const outcome = { duplicate: false, mode: 'dry_run', checked: false, available: null, delivery: null, receipt: null };
function request(authorized = true) { return new Request('https://buffer.test/api/monitoring/worker', { method: 'HEAD', headers: authorized ? { Authorization: `Bearer ${secret}` } : {} }); }
beforeEach(() => { vi.stubEnv('CRON_SECRET', secret); vi.stubEnv('BUFFER_DISCORD_DESTINATIONS_JSON', ''); vi.stubEnv('BUFFER_ALERT_SEND_ENABLED', 'false'); mocked.run.mockResolvedValue(outcome); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('authenticated scheduler HEAD envelope', () => {
  it('runs the same protected worker and emits only the six-key bounded result header', async () => {
    const result = await HEAD(request());
    expect(result.status).toBe(200); expect(await result.text()).toBe(''); expect(result.body).toBeNull();
    expect(result.headers.get('Cache-Control')).toContain('no-store');
    const header = result.headers.get('X-Buffer-Monitoring-Result')!;
    expect(Buffer.byteLength(header)).toBeLessThanOrEqual(512); expect(JSON.parse(header)).toEqual(outcome);
    expect(header).not.toContain(secret);
    expect(mocked.run).toHaveBeenCalledTimes(1);
    expect(mocked.run.mock.calls[0][1]).toMatchObject({ runKey: expect.stringMatching(/^cron:\d+$/) });
  });
  it('preserves replay/no-op results without starting a separate worker path', async () => {
    mocked.run.mockResolvedValue({ ...outcome, duplicate: true });
    const result = await HEAD(request());
    expect(JSON.parse(result.headers.get('X-Buffer-Monitoring-Result')!)).toMatchObject({ duplicate: true });
    expect(mocked.run).toHaveBeenCalledTimes(1); expect(result.body).toBeNull();
  });
  it('returns bodyless 401 without a result header when scheduler authorization is missing', async () => {
    const result = await HEAD(request(false));
    expect(result.status).toBe(401); expect(result.headers.has('X-Buffer-Monitoring-Result')).toBe(false);
    expect(await result.text()).toBe(''); expect(mocked.run).not.toHaveBeenCalled();
  });
  it('returns bodyless 503 without a result header on worker failure', async () => {
    mocked.run.mockRejectedValue(new Error('Private internal detail'));
    const result = await HEAD(request());
    expect(result.status).toBe(503); expect(result.headers.has('X-Buffer-Monitoring-Result')).toBe(false); expect(await result.text()).toBe('');
  });
  it.each([
    { ...outcome, available: 'true' }, { ...outcome, mode: ['send'] }, { ...outcome, mode: 'fixture' }, { ...outcome, delivery: 'delivered' },
    { ...outcome, receipt: 'unverified' }, { ...outcome, secret: 'must-not-leak' },
    { ...outcome, delivery: 'x'.repeat(1000) },
  ])('rejects an invalid result rather than reflecting it into headers', async invalid => {
    mocked.run.mockResolvedValue(invalid);
    const result = await HEAD(request());
    expect(result.status).toBe(503); expect(result.headers.has('X-Buffer-Monitoring-Result')).toBe(false); expect(result.body).toBeNull();
  });
});
