import type { SupabaseClient } from '@supabase/supabase-js';
import { alertRehearsalKey, alertStorageKey } from './alerts';
import { persistedAuthSession, sameAuthSession, sessionIdentity, type AuthSessionIdentity } from './auth-storage';
import { getSupabase } from './supabase';

/**
 * Self-service account deletion. The browser calls public.delete_own_account()
 * with the session the person confirmed in. The database deletes that auth user
 * and, by cascade, every row keyed to it. No service-role key is involved, and
 * the request carries no account identifier: the function acts on auth.uid().
 */
export const ACCOUNT_DELETION_RPC_PATH = '/rest/v1/rpc/delete_own_account';
export const ACCOUNT_DELETION_TIMEOUT_MS = 20_000;
const RESPONSE_BYTES = 4096;

export type AccountDeletionOutcome = 'deleted' | 'already-deleted';
export type AccountDeletionFailure = 'session' | 'cancelled' | 'unauthorized' | 'unconfirmed';

const MESSAGES: Record<AccountDeletionFailure, string> = {
  session: 'This sign-in could not be confirmed. Nothing was deleted. Reload the page and try again.',
  cancelled: 'Account deletion stopped before it started. Nothing was deleted.',
  unauthorized: 'Your session has expired. Nothing was deleted. Sign in again, then retry.',
  unconfirmed: 'Account deletion could not be confirmed. Try again; repeating it is safe.',
};

export class AccountDeletionError extends Error {
  constructor(public readonly code: AccountDeletionFailure) {
    super(MESSAGES[code]);
    this.name = 'AccountDeletionError';
  }
}

export function accountDeletionMessage(error: unknown): string {
  return error instanceof AccountDeletionError ? error.message : MESSAGES.unconfirmed;
}

export interface AccountDeletionOptions {
  projectUrl?: string;
  publishableKey?: string;
  client?: Pick<SupabaseClient, 'auth'> | null;
  fetcher?: typeof fetch;
  persisted?: () => AuthSessionIdentity | null;
  timeoutMs?: number;
}

async function readResult(response: Response): Promise<unknown> {
  if (!response.body) throw new AccountDeletionError('unconfirmed');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > RESPONSE_BYTES) { await reader.cancel().catch(() => undefined); throw new AccountDeletionError('unconfirmed'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new AccountDeletionError('unconfirmed'); }
}

/** Deletes the confirmed account. A replaced or missing session sends nothing. */
export async function deleteOwnAccount(expected: AuthSessionIdentity, signal: AbortSignal, options: AccountDeletionOptions = {}): Promise<AccountDeletionOutcome> {
  const projectUrl = (options.projectUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const publishableKey = options.publishableKey ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  const client = options.client === undefined ? getSupabase() : options.client;
  const persisted = options.persisted ?? (() => persistedAuthSession(projectUrl));
  const fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  if (signal.aborted) throw new AccountDeletionError('cancelled');
  if (!projectUrl || !publishableKey || !client || !sameAuthSession(persisted(), expected)) throw new AccountDeletionError('session');

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, options.timeoutMs ?? ACCOUNT_DELETION_TIMEOUT_MS);
  let sent = false;
  try {
    const stopped = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true });
    });
    const { data, error } = await Promise.race([client.auth.getSession(), stopped]);
    const session = data.session;
    if (error || !session || !sameAuthSession(sessionIdentity(session), expected) || !sameAuthSession(persisted(), expected)) {
      throw new AccountDeletionError('session');
    }
    controller.signal.throwIfAborted();
    sent = true;
    const response = await fetcher(`${projectUrl}${ACCOUNT_DELETION_RPC_PATH}`, {
      method: 'POST', cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: { apikey: publishableKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
    });
    // PostgREST rejects an expired token or a missing grant before the function runs.
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      throw new AccountDeletionError('unauthorized');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new AccountDeletionError('unconfirmed');
    }
    const removed = await readResult(response);
    if (removed === expected.userId) return 'deleted';
    // The function returns null when this account no longer exists.
    if (removed === null) return 'already-deleted';
    throw new AccountDeletionError('unconfirmed');
  } catch (error) {
    if (error instanceof AccountDeletionError) throw error;
    if (!sent) throw new AccountDeletionError(signal.aborted ? 'cancelled' : 'session');
    throw new AccountDeletionError('unconfirmed');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

/** Device-local example alert settings stored under the deleted account's ID. */
export function accountDeviceKeys(ownerId: string): string[] {
  return [alertRehearsalKey(ownerId), alertStorageKey(ownerId)];
}

/** Device reports are not account data and stay until the person deletes them. */
export function clearAccountDeviceData(ownerId: string, storage?: Pick<Storage, 'removeItem'>): void {
  for (const key of accountDeviceKeys(ownerId)) {
    try { (storage ?? window.localStorage).removeItem(key); }
    catch { /* Unavailable storage holds nothing to clear. */ }
  }
}

export interface AccountDeletionSteps {
  remove: () => Promise<AccountDeletionOutcome>;
  /** Runs once the database confirms the deletion: clear device data and record the result. */
  afterDelete: () => void;
  signOut: () => Promise<{ error: unknown }>;
}

/** Device data and the local session go only after the database confirms the account is gone. */
export async function runAccountDeletion(steps: AccountDeletionSteps): Promise<{ outcome: AccountDeletionOutcome; signedOut: boolean }> {
  const outcome = await steps.remove();
  try { steps.afterDelete(); }
  catch { /* Best effort: the account itself is already deleted. */ }
  let signedOut = false;
  try { signedOut = !(await steps.signOut()).error; }
  catch { signedOut = false; }
  return { outcome, signedOut };
}
