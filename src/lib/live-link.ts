import { PROTOCOLS, type ProtocolId } from './protocols';

export const PUBLIC_ACCOUNT_EXAMPLES: Partial<Record<ProtocolId, string>> = {
  velocity: 'DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2',
  jupiter: '8vXZp5DRsAKGv6QwfqKjZ2MQgMT6arfYYpoCqAN2b9aw',
  pacifica: 'Ep1d8JdFw4FnB85XDgXGVabYutro4JzK285HQqW6TZE2',
};
export const LIVE_RISK_EXAMPLE = { protocol: 'velocity' as const, authority: PUBLIC_ACCOUNT_EXAMPLES.velocity! };
export type LiveSelection = { protocol: ProtocolId; authority: string; subaccount?: number };
export type LiveLink = { state: 'none' } | { state: 'invalid'; message: string } | { state: 'ready'; selection: LiveSelection };

/** Validate the canonical 32-byte base58 public address without adding a browser SDK. */
export function isPublicAddress(value: string): boolean {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  let decoded = 0n;
  for (const character of value) decoded = decoded * 58n + BigInt(alphabet.indexOf(character));
  const bytes = decoded === 0n ? 0 : Math.ceil(decoded.toString(2).length / 8);
  const leadingZeros = value.match(/^1*/)?.[0].length ?? 0;
  return bytes + leadingZeros === 32;
}

export function parseLiveLink(params: URLSearchParams): LiveLink {
  const keys = ['protocol', 'authority', 'subaccount'];
  if (!keys.some(key => params.has(key))) return { state: 'none' };
  const invalid = (message: string): LiveLink => ({ state: 'invalid', message });
  if (keys.some(key => params.getAll(key).length > 1)) return invalid('The account link contains duplicate selections. Enter the public address below to start a new read.');
  const protocol = params.get('protocol') ?? 'velocity';
  if (!Object.hasOwn(PROTOCOLS, protocol)) return invalid('The account link names an unsupported protocol. Choose a supported protocol below.');
  const authority = params.get('authority') ?? '';
  if (!isPublicAddress(authority)) return invalid('The account link needs a valid Solana public address. Enter the address below to continue.');
  const id = params.get('subaccount');
  if (id !== null && (!/^(0|[1-9]\d{0,4})$/.test(id) || Number(id) > 65535)) return invalid('The linked subaccount must be a whole-number ID from 0 to 65535.');
  return { state: 'ready', selection: { protocol: protocol as ProtocolId, authority, ...(id === null ? {} : { subaccount: Number(id) }) } };
}

export function buildLiveLink(selection: LiveSelection): string {
  const params = new URLSearchParams({ protocol: selection.protocol, authority: selection.authority });
  if (selection.subaccount !== undefined) params.set('subaccount', String(selection.subaccount));
  if (parseLiveLink(params).state !== 'ready') throw new Error('Invalid live account selection');
  return `/app?${params}`;
}

export const LIVE_RISK_LINK = buildLiveLink(LIVE_RISK_EXAMPLE);
