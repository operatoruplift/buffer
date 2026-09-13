import { accessTokenIdentity, markAuthSignInResponse, markSignOutResponse, persistedAuthSession, sameAuthSession, sessionIdentity, type AuthSessionIdentity } from './auth-storage';

export type AuthAction = 'signin' | 'signup' | 'forgot' | 'reset' | 'signout';
export const AUTH_REQUEST_TIMEOUT_MS = 12_000;
export const AUTH_OPERATION_TIMEOUT_MS = 20_000;
export const AUTH_RESPONSE_BYTES = 1_048_576;
const RECOVERY_STORAGE_KEY = 'buffer.auth-recovery.v1';
const RECOVERY_WINDOW_MS = 15 * 60_000;

export class AuthOperationError extends Error {
  constructor(public readonly code: 'cancelled' | 'timeout' | 'pending' | 'session') {
    super(code === 'session' ? 'The initiating authentication session changed.' : code === 'timeout' ? 'Authentication timed out.' : code === 'pending' ? 'An earlier authentication request is still finishing.' : 'Authentication was cancelled.');
    this.name = 'AuthOperationError';
  }
}

type ActiveOperation = { controller: AbortController; expectedSession?: AuthSessionIdentity };
const operations = new Map<AuthAction, ActiveOperation>();

/** A cancelled SDK call retains its aborted scope until it settles, so a later request cannot inherit a new action's signal. */
export function runAuthOperation<T>(action: AuthAction, work: (signal: AbortSignal) => Promise<T>, externalSignal?: AbortSignal, timeoutMs = AUTH_OPERATION_TIMEOUT_MS, expectedSession?: AuthSessionIdentity): Promise<T> {
  if (operations.has(action)) return Promise.reject(new AuthOperationError('pending'));
  const operation: ActiveOperation = { controller: new AbortController(), expectedSession: expectedSession ? { ...expectedSession } : undefined };
  operations.set(action, operation);
  const cancel = () => operation.controller.abort(new AuthOperationError('cancelled'));
  if (externalSignal?.aborted) cancel();
  else externalSignal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => operation.controller.abort(new AuthOperationError('timeout')), timeoutMs);

  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(operation.controller.signal.reason);
    operation.controller.signal.addEventListener('abort', aborted, { once: true });
    const finish = () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
      operation.controller.signal.removeEventListener('abort', aborted);
      if (operations.get(action) === operation) operations.delete(action);
    };
    if (operation.controller.signal.aborted) { finish(); reject(operation.controller.signal.reason); return; }
    let task: Promise<T>;
    try { task = work(operation.controller.signal); }
    catch (error) { finish(); reject(error); return; }
    task.then(result => {
      const reason = operation.controller.signal.aborted ? operation.controller.signal.reason : null;
      finish();
      if (reason) reject(reason);
      else resolve(result);
    }, error => { finish(); reject(error); });
  });
}

function actionForRequest(url: URL, method: string): AuthAction | null {
  if (method === 'POST' && url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password') return 'signin';
  if (method === 'POST' && url.pathname.endsWith('/auth/v1/signup')) return 'signup';
  if (method === 'POST' && url.pathname.endsWith('/auth/v1/recover')) return 'forgot';
  if (method === 'PUT' && url.pathname.endsWith('/auth/v1/user')) return 'reset';
  if (method === 'POST' && url.pathname.endsWith('/auth/v1/logout')) return 'signout';
  return null;
}

function logoutSessionAlreadyMissing(response: Response, bytes: Uint8Array): boolean {
  if (response.status !== 400) return false;
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || typeof payload !== 'object') return false;
    // Match the installed Auth SDK's versioned code/legacy error_code handling.
    const version = response.headers.get('X-Supabase-Api-Version') || '';
    const modern = /^2\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(version) && version >= '2024-01-01';
    const code = modern && 'code' in payload && typeof payload.code === 'string' ? payload.code : 'error_code' in payload ? payload.error_code : null;
    return code === 'session_not_found';
  } catch { return false; }
}

/** Auth-only transport bounds. Report queries retain their own AbortSignal and background token refresh never inherits a form action's cancellation. */
export function createSupabaseFetch(projectUrl: string, fetcher: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  const project = new URL(projectUrl);
  const authPath = `${project.pathname.replace(/\/$/, '')}/auth/v1/`;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== project.origin || !url.pathname.startsWith(authPath)) return fetcher(input, init);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const action = actionForRequest(url, method);
    const operation = action ? operations.get(action) : undefined;
    const actionSignal = operation?.controller.signal;
    const boundWrite = action === 'reset' || action === 'signout';
    const requestHeaders = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const bearer = requestHeaders.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    const rejectSession = () => {
      const error = new AuthOperationError('session');
      operation?.controller.abort(error);
      throw error;
    };
    const assertSession = () => {
      if (boundWrite && (!operation?.expectedSession || !sameAuthSession(operation.expectedSession, persistedAuthSession(projectUrl)) || !sameAuthSession(operation.expectedSession, accessTokenIdentity(bearer)))) rejectSession();
    };
    const controller = new AbortController();
    const signals = [init?.signal, input instanceof Request ? input.signal : undefined, actionSignal].filter((signal): signal is AbortSignal => Boolean(signal));
    const relay = (event: Event) => controller.abort((event.target as AbortSignal).reason);
    for (const signal of signals) {
      if (signal.aborted) controller.abort(signal.reason);
      else signal.addEventListener('abort', relay, { once: true });
    }
    const timer = setTimeout(() => controller.abort(new AuthOperationError('timeout')), AUTH_REQUEST_TIMEOUT_MS);
    try {
      controller.signal.throwIfAborted();
      assertSession();
      const response = await fetcher(input, { ...init, cache: 'no-store', signal: controller.signal });
      controller.signal.throwIfAborted();
      assertSession();
      const markLogout = (alreadyMissing = false) => { if (action === 'signout') markSignOutResponse(projectUrl, response.ok || [401, 403, 404].includes(response.status) || alreadyMissing); };
      if (!response.body || response.status === 204 || response.status === 205 || response.status === 304) {
        if (action === 'reset' && response.ok) rejectSession();
        markLogout();
        return response;
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      const abortReader = () => { void reader.cancel().catch(() => undefined); };
      controller.signal.addEventListener('abort', abortReader, { once: true });
      try {
        for (;;) {
          const { done, value } = await reader.read();
          controller.signal.throwIfAborted();
          if (done) break;
          length += value.byteLength;
          if (length > AUTH_RESPONSE_BYTES) { await reader.cancel(); throw new Error('Authentication response exceeded the size limit.'); }
          chunks.push(value);
        }
      } finally {
        controller.signal.removeEventListener('abort', abortReader);
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      controller.signal.throwIfAborted();
      assertSession();
      if (action === 'reset' && response.ok) {
        let user: unknown;
        try { user = JSON.parse(new TextDecoder().decode(bytes)); } catch { rejectSession(); }
        if (!user || typeof user !== 'object' || !('id' in user) || user.id !== operation?.expectedSession?.userId) rejectSession();
      }
      if ((action === 'signin' || action === 'signup') && operation && response.ok) {
        let payload: unknown;
        try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('The authentication response was invalid.'); }
        const incoming = sessionIdentity(payload);
        if (incoming) markAuthSignInResponse(projectUrl, action, incoming);
        else if (action === 'signin' || (payload && typeof payload === 'object' && 'access_token' in payload)) throw new Error('The authentication session could not be verified.');
      }
      markLogout(action === 'signout' && logoutSessionAlreadyMissing(response, bytes));
      return new Response(bytes, { status: response.status, statusText: response.statusText, headers });
    } finally {
      clearTimeout(timer);
      signals.forEach(signal => signal.removeEventListener('abort', relay));
    }
  };
}

export function inspectAuthCallback(href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const callbackKeys = ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'type', 'code', 'error', 'error_code', 'error_description'];
  const parameter = (name: string) => hash.get(name) || url.searchParams.get(name);
  const present = callbackKeys.some(key => hash.has(key) || url.searchParams.has(key));
  const error = Boolean(parameter('error') || parameter('error_code') || parameter('error_description'));
  const recovery = parameter('type') === 'recovery';
  if (present) {
    callbackKeys.forEach(key => { url.searchParams.delete(key); hash.delete(key); });
    url.hash = hash.toString();
  }
  return { present, error, recovery, cleanUrl: `${url.pathname}${url.search}${url.hash}` };
}

export function rememberRecovery(identity: AuthSessionIdentity, sessionExpiresAt: number | undefined, storage?: Storage, now = Date.now()) {
  if (!sessionExpiresAt || !Number.isFinite(sessionExpiresAt) || sessionExpiresAt * 1000 <= now) return;
  try { (storage ?? sessionStorage).setItem(RECOVERY_STORAGE_KEY, JSON.stringify({ ...identity, expiresAt: Math.min(sessionExpiresAt * 1000, now + RECOVERY_WINDOW_MS) })); } catch { /* The active recovery form still works when storage is unavailable. */ }
}

export function recoveryDeadline(identity: AuthSessionIdentity | null, storage?: Storage, now = Date.now()): number | null {
  try {
    const target = storage ?? sessionStorage;
    const marker = JSON.parse(target.getItem(RECOVERY_STORAGE_KEY) || 'null');
    if (sameAuthSession(identity, marker) && Number.isFinite(marker.expiresAt) && marker.expiresAt > now && marker.expiresAt <= now + RECOVERY_WINDOW_MS) return marker.expiresAt;
    target.removeItem(RECOVERY_STORAGE_KEY);
  } catch { /* A malformed or unavailable local marker cannot enable recovery. */ }
  return null;
}

export function clearRecovery(storage?: Storage) {
  try { (storage ?? sessionStorage).removeItem(RECOVERY_STORAGE_KEY); } catch { /* Storage is optional. */ }
}

export function authErrorMessage(error: unknown, mode: AuthAction) {
  if (error instanceof AuthOperationError) {
    if (error.code === 'timeout') return 'That request timed out. Check your connection and try again.';
    if (error.code === 'pending') return 'The previous request is finishing. Please try again in a moment.';
    if (error.code === 'session') return 'Your account session changed. Open the recovery link again before changing a password.';
    return '';
  }
  const status = error && typeof error === 'object' && 'status' in error ? error.status : 0;
  if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AuthRetryableFetchError') return 'Authentication is temporarily unavailable. Check your connection and try again.';
  if (mode === 'signin') return 'Sign-in failed. Check your email, password, and email confirmation, then retry.';
  if (mode === 'reset' && (status === 401 || status === 403)) return 'Your recovery session has expired. Request a new recovery link.';
  return 'That request could not be completed. Please check your details and retry.';
}
