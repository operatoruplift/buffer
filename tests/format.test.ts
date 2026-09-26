import { describe, expect, it } from 'vitest';
import { formatDecimal, formatUtc } from '../src/lib/format';
import { getSampleSnapshot } from '../src/lib/samples';

describe('presentation formatting', () => {
  it('renders every timestamp as one explicit UTC format, regardless of the device zone', () => {
    const zone = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Asia/Saigon', 'America/Los_Angeles']) {
        process.env.TZ = tz;
        expect(formatUtc('2026-09-26T13:15:04.123Z')).toBe('2026-09-26 · 13:15:04 UTC');
        // Database timestamps may carry microseconds or an offset; the instant is unchanged.
        expect(formatUtc('2026-09-26T20:15:04.123456+07:00')).toBe('2026-09-26 · 13:15:04 UTC');
        expect(formatUtc(getSampleSnapshot('sol-long').retrievedAt)).toBe('2026-09-11 · 12:00:00 UTC');
      }
    } finally {
      if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone;
    }
  });

  it('shows a placeholder instead of a wrong or invented instant', () => {
    for (const value of [null, undefined, '', 'not-a-timestamp', '2026-13-45T99:99:99Z']) {
      expect(formatUtc(value)).toBe('—');
    }
  });

  it('keeps decimal rounding and grouping presentation-only', () => {
    expect(formatDecimal('1234567.891')).toBe('1,234,567.89');
    expect(formatDecimal('-0.004', 2, true)).toBe('0.00');
    expect(formatDecimal('1520', 2, true)).toBe('+1,520.00');
    expect(formatDecimal(null)).toBe('—');
  });
});
