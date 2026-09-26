import Decimal from 'decimal.js';

/** Presentation-only rounding; scenario and report values retain their exact strings. */
export function formatDecimal(value: string | null, places = 2, signed = false): string {
  if (value === null || !/^[+-]?\d+(?:\.\d+)?$/.test(value)) return '—';
  if (!Number.isInteger(places) || places < 0 || places > 20) return '—';
  const D = Decimal.clone({ precision: Math.max(80, value.length + places + 2), rounding: Decimal.ROUND_HALF_UP });
  const rounded = new D(value).toDecimalPlaces(places);
  const absolute = rounded.abs().toFixed(places);
  const [integer, fraction] = absolute.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = rounded.isZero() ? '' : rounded.isNegative() ? '−' : signed ? '+' : '';
  return `${sign}${grouped}${fraction === undefined ? '' : `.${fraction}`}`;
}

/**
 * One timestamp format across the app: an explicit UTC instant.
 * Saved reports, snapshots, and monitoring observations are compared with each
 * other, so none of them is rendered in an unlabelled local zone.
 */
export function formatUtc(value: string | null | undefined): string {
  if (typeof value !== 'string') return '—';
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return '—';
  return `${at.toISOString().replace('T', ' · ').slice(0, 21)} UTC`;
}
