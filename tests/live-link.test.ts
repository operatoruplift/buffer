import { describe, expect, it } from 'vitest';
import { buildLiveLink, isPublicAddress, LIVE_RISK_EXAMPLE, parseLiveLink } from '../src/lib/live-link';

const authority = LIVE_RISK_EXAMPLE.authority;
const parse = (query: string) => parseLiveLink(new URLSearchParams(query));
describe('public live-account links', () => {
  it('keeps the default app unselected and round-trips canonical account identities', () => {
    expect(parse('')).toEqual({ state: 'none' });
    for (const subaccount of [undefined, 0, 65535]) {
      const selection = { ...LIVE_RISK_EXAMPLE, ...(subaccount === undefined ? {} : { subaccount }) };
      expect(parse(buildLiveLink(selection).split('?')[1])).toEqual({ state: 'ready', selection });
    }
  });
  it('validates actual 32-byte public addresses, including leading zero bytes', () => {
    expect(isPublicAddress(authority)).toBe(true);
    expect(isPublicAddress('11111111111111111111111111111111')).toBe(true);
    expect(isPublicAddress('So11111111111111111111111111111111111111112')).toBe(true);
    for (const value of ['2'.repeat(32), '1'.repeat(33), 'z'.repeat(44), `${authority} `, 'invalid', '0'.repeat(32)]) expect(isPublicAddress(value)).toBe(false);
  });
  it.each(['-1', '65536', '1.5', '1e2', '01', '', 'NaN'])('rejects invalid subaccount %s', id => {
    expect(parse(`protocol=velocity&authority=${authority}&subaccount=${id}`).state).toBe('invalid');
  });
  it('rejects duplicate selections, unknown providers and missing identities before any read', () => {
    for (const query of [`authority=${authority}&authority=${authority}`, `authority=${authority}&protocol=velocity&protocol=jupiter`, `authority=${authority}&subaccount=0&subaccount=1`, `authority=${authority}&protocol=unknown`, 'protocol=velocity', 'subaccount=0']) expect(parse(query).state).toBe('invalid');
    expect(() => buildLiveLink({ ...LIVE_RISK_EXAMPLE, subaccount: -1 })).toThrow();
  });
});
