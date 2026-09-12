import 'server-only';
import { PROTOCOLS } from '../lib/protocols';
import { ProviderFailure, validateAuthority, type LiveProvider } from './boundary';
import { normalizePacificaSnapshot, validatePacificaAccount } from './pacifica-normalize';

const API_ROOT = 'https://api.pacifica.fi/api/v1';
const REQUEST_TIMEOUT_MS = 18_000;
const MAX_RESPONSE_BYTES = 1_048_576;
type Endpoint = '/account' | '/account/loan' | '/positions' | '/info' | '/info/prices';
type Envelope = { success: unknown; data: unknown; error: unknown; code: unknown };

function apiFailure(): ProviderFailure {
  return new ProviderFailure('API_ERROR', 'Pacifica’s public data API could not complete the read. Please retry.');
}

async function readJson(response: Response): Promise<Envelope> {
  const length = response.headers.get('content-length');
  if ((length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) || !response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) throw apiFailure();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw apiFailure(); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw apiFailure(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw apiFailure();
  return parsed as Envelope;
}

async function withRequest<T>(authority: string, run: (read: (endpoint: Endpoint) => Promise<unknown>, startedAt: string) => Promise<T>): Promise<T> {
  const canonicalAuthority = validateAuthority(authority);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = new Date().toISOString();
  const read = async (endpoint: Endpoint): Promise<unknown> => {
    const url = new URL(API_ROOT + endpoint);
    if (endpoint === '/account' || endpoint === '/account/loan' || endpoint === '/positions') url.searchParams.set('account', canonicalAuthority);
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: controller.signal });
    const payload = await readJson(response);
    if (endpoint === '/account' && response.status === 404 && payload.success === false && payload.code === 404 && payload.data === null && payload.error === 'Account not found') {
      throw new ProviderFailure('ACCOUNT_NOT_FOUND', 'No Pacifica account was found for this wallet address.', 404, false);
    }
    if (response.status === 429) throw new ProviderFailure('RATE_LIMITED', 'Pacifica’s public API is busy. Wait a moment and retry.', 429, true);
    if (!response.ok || payload.success !== true || payload.error !== null || payload.code !== null) throw apiFailure();
    return payload.data;
  };
  try { return await run(read, startedAt); }
  catch (error) {
    if (controller.signal.aborted) throw new ProviderFailure('TIMEOUT', 'The Pacifica live read timed out. Please retry.', 504, true);
    if (error instanceof ProviderFailure) throw error;
    throw apiFailure();
  } finally { clearTimeout(timer); controller.abort(); }
}

export const pacificaProvider: LiveProvider = {
  discover: (authority) => withRequest(authority, async (read) => {
    try {
      validatePacificaAccount(await read('/account'), Date.now());
      return { authority, protocol: PROTOCOLS.pacifica, subaccounts: [{ id: 0, name: 'Wallet account', address: authority }], retrievedAt: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ProviderFailure && error.code === 'ACCOUNT_NOT_FOUND') return { authority, protocol: PROTOCOLS.pacifica, subaccounts: [], retrievedAt: new Date().toISOString() };
      throw error;
    }
  }),
  snapshot: (authority, subaccount) => withRequest(authority, async (read, startedAt) => {
    if (subaccount !== 0) throw new ProviderFailure('SUBACCOUNT_NOT_FOUND', 'Select the Pacifica wallet account. Signed subaccount discovery is outside this read-only integration.', 404, false);
    const account = await read('/account');
    validatePacificaAccount(account, Date.now());
    const [positions, info, prices, loan] = await Promise.all([read('/positions'), read('/info'), read('/info/prices'), read('/account/loan')]);
    return normalizePacificaSnapshot({ authority, account, positions, info, prices, loan, startedAt, retrievedAt: new Date().toISOString() });
  }),
};
