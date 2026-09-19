import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonitoringOverview } from '../src/lib/monitoring';

const identity = { userId: '00000000-0000-4000-8000-000000000001', sessionId: 'session-a' };
const mocks = vi.hoisted(() => ({ session: vi.fn(), persisted: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ getSupabase: () => ({ auth: { getSession: mocks.session } }) }));
vi.mock('../src/lib/auth-storage', () => ({ persistedAuthSession: mocks.persisted,
  sameAuthSession: (a: unknown, b: unknown) => Boolean(a && b && JSON.stringify(a) === JSON.stringify(b)),
  sessionIdentity: (session: { identity: unknown }) => session.identity,
}));
import { parseMonitoringOverview, requestMonitoring } from '../src/lib/monitoring-client';

const id = '00000000-0000-4000-8000-000000000002';
function overview(): MonitoringOverview {
  const at = new Date().toISOString();
  return { capability: { configured: true, sendEnabled: false, destinationAvailable: true, message: 'Sending disabled.' },
    heartbeat: { lastRunAt: at, lastCompletedAt: at, status: 'healthy', mode: 'dry_run' },
    destinations: [{ id, label: 'Alerts', provider: 'discord', verifiedAt: at, enabled: true, maskedDestination: 'Channel …1234' }],
    rules: [{ id, version: 1, authority: '11111111111111111111111111111111', subaccountId: 0, provider: 'velocity', network: 'mainnet-beta', metric: 'maintenance_headroom', unit: 'USD', direction: 'below', threshold: '300', cadenceMinutes: 15, timezone: 'UTC', cooldownMinutes: 15, hysteresis: '10', destinationId: id, enabled: true, monitoringState: 'fresh', lastAttemptAt: at, lastFreshCheck: at, inputExpiresAt: at, nextCheckAt: at, lastError: null, breached: false, createdAt: at, updatedAt: at }],
    events: [{ id, ruleId: id, ruleVersion: 1, state: 'accepted_by_provider', observedAt: at, value: '250', threshold: '300', reason: 'Threshold crossed.', acceptedAt: at, deliveredAt: null, messageId: '123456789012345678', lastError: null, attempts: 1, preview: 'Buffer TEST alert' }],
  };
}

describe('monitoring response boundary', () => {
  it('keeps acceptance separate from a verified receipt and accepts exact fractional decimals', () => {
    const value = overview(); value.rules[0].hysteresis = '.5';
    expect(parseMonitoringOverview(value).events[0].state).toBe('accepted_by_provider');
  });
  it.each([
    (v: MonitoringOverview) => { v.events[0].state = 'delivered'; },
    (v: MonitoringOverview) => { v.events[0].state = ['delivered'] as unknown as 'delivered'; },
    (v: MonitoringOverview) => { v.heartbeat.status = ['healthy'] as unknown as 'healthy'; },
    (v: MonitoringOverview) => { v.heartbeat.lastRunAt = '42'; },
    (v: MonitoringOverview) => { v.events[0].messageId = null; },
    (v: MonitoringOverview) => { v.rules[0].hysteresis = '-1'; },
    (v: MonitoringOverview) => { v.rules[0].createdAt = null as unknown as string; },
    (v: MonitoringOverview) => { v.rules[0].threshold = 'Infinity'; },
    (v: MonitoringOverview) => { v.rules[0].threshold = '9'.repeat(129); },
    (v: MonitoringOverview) => { v.rules[0].network = 'fixture' as 'mainnet-beta'; },
    (v: MonitoringOverview) => { v.rules.push(v.rules[0]); },
    (v: MonitoringOverview) => { v.events[0].ruleVersion = 0; },
    (v: MonitoringOverview) => { v.heartbeat.lastRunAt = 'yesterday'; },
    (v: MonitoringOverview) => { v.destinations[0].id = 'https://evil.test'; },
  ])('rejects invalid state rather than replacing visible provenance', mutate => {
    const value = overview(); mutate(value); expect(() => parseMonitoringOverview(value)).toThrow();
  });
});

describe('session-bound monitoring requests', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    mocks.persisted.mockReturnValue(identity);
    mocks.session.mockResolvedValue({ data: { session: { identity, access_token: 'private-test-token' } }, error: null });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it('uses a Bearer header and bounded no-store same-origin request without owner payload', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(overview())); vi.stubGlobal('fetch', fetcher);
    await requestMonitoring('/api/monitoring', 'GET', undefined, identity, new AbortController().signal);
    const [path, options] = fetcher.mock.calls[0];
    expect(path).toBe('/api/monitoring'); expect(options).toMatchObject({ cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer private-test-token' } });
    expect(options.body).toBeUndefined();
  });
  it('rejects an account switch before obtaining credentials', async () => {
    mocks.persisted.mockReturnValue({ ...identity, sessionId: 'replacement' }); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(requestMonitoring('/api/monitoring', 'GET', undefined, identity, new AbortController().signal)).rejects.toThrow('Sign in again');
    expect(mocks.session).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects late data after a new session replaces its initiating owner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { mocks.persisted.mockReturnValue({ ...identity, sessionId: 'replacement' }); return Response.json(overview()); }));
    await expect(requestMonitoring('/api/monitoring', 'GET', undefined, identity, new AbortController().signal)).rejects.toThrow('session changed');
  });
  it('cancels a stalled credential lookup when the view unmounts', async () => {
    mocks.session.mockReturnValue(new Promise(() => {})); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController(); const pending = requestMonitoring('/api/monitoring', 'GET', undefined, identity, controller.signal); controller.abort();
    await expect(pending).rejects.toThrow('request ended'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects arbitrary URL paths before session access', async () => {
    await expect(requestMonitoring('https://evil.test', 'GET', undefined, identity, new AbortController().signal)).rejects.toThrow('Invalid monitoring');
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('bounds streamed response allocation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(131073))));
    await expect(requestMonitoring('/api/monitoring', 'GET', undefined, identity, new AbortController().signal)).rejects.toThrow('too much data');
  });
  it('does not expose remote HTML or unexpected error bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ token: 'do-not-show' }, { status: 502 })));
    await expect(requestMonitoring('/api/monitoring', 'GET', undefined, identity, new AbortController().signal)).rejects.toThrow('temporarily unavailable');
  });
});
