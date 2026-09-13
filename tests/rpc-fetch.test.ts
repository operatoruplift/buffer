import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createRpcFetch } from '../src/server/rpc-fetch';
const endpoint = 'https://rpc.example.test/private-credential';
afterEach(() => vi.unstubAllGlobals());

describe('shared bounded RPC transport', () => {
  it('pins endpoint, disables caching and redirects, and preserves JSON bytes', async () => {
    const mock = vi.fn().mockResolvedValue(new Response('{"result":123}', { headers: { 'Content-Encoding': 'gzip' } }));
    vi.stubGlobal('fetch', mock);
    const read = createRpcFetch(endpoint, new AbortController().signal);
    const response = await read(endpoint, { method: 'POST', body: '{}' });
    expect(await response.json()).toEqual({ result: 123 });
    expect(mock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', redirect: 'error', method: 'POST' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('content-encoding')).toBe(false);
    await expect(read('https://different.example.test')).rejects.toMatchObject({ code: 'INVALID_CONFIGURATION' });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])('bounds decoded response bytes with declared length=%s', async declared => {
    const cancelled = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(17)); }, cancel: cancelled });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: declared ? { 'content-length': '17' } : {} })));
    await expect(createRpcFetch(endpoint, new AbortController().signal, 16)(endpoint)).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE', retryable: false });
    expect(cancelled).toHaveBeenCalled();
  });
  it.each([429, 500])('sanitizes HTTP %s without retries or upstream details', async status => {
    const mock = vi.fn().mockResolvedValue(new Response('private-credential upstream dump', { status }));
    vi.stubGlobal('fetch', mock);
    await expect(createRpcFetch(endpoint, new AbortController().signal)(endpoint)).rejects.toMatchObject({ code: status === 429 ? 'RATE_LIMITED' : 'RPC_ERROR' });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('enforces the shared deadline and redacts thrown network failures', async () => {
    const abort = new AbortController();
    abort.abort();
    const mock = vi.fn().mockRejectedValue(new Error(endpoint));
    vi.stubGlobal('fetch', mock);
    await expect(createRpcFetch(endpoint, abort.signal)(endpoint)).rejects.toMatchObject({ code: 'TIMEOUT', status: 504 });
    expect(mock).not.toHaveBeenCalled();
    const failure = await createRpcFetch(endpoint, new AbortController().signal)(endpoint).catch(error => error);
    expect(failure.message).not.toContain('private-credential');
    expect(failure.code).toBe('RPC_ERROR');
  });
  it('redacts body read failures and always releases the reader', async () => {
    const body = new ReadableStream({ start(controller) { controller.error(new Error(endpoint)); } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const error = await createRpcFetch(endpoint, new AbortController().signal)(endpoint).catch(error => error);
    expect(error).toMatchObject({ code: 'RPC_ERROR' });
    expect(error.message).not.toContain(endpoint);
    expect(body.locked).toBe(false);
  });
});
