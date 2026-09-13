import { describe, expect, it, vi } from 'vitest';
import { accessTokenIdentity, authStorageKey, createIdentityBoundAuthStorage, markAuthSignInResponse, markSignOutResponse, sameAuthSession, sessionIdentity, withIdentityBoundAuthSignIn, withIdentityBoundAuthUpdate, withIdentityBoundSignOut } from '../src/lib/auth-storage';

const project = 'https://buffer-storage-test.supabase.co';
const key = authStorageKey(project);
const expected = { userId: 'person-a', sessionId: 'session-a' };
function session(userId = 'person-a', sessionId = 'session-a') {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { user: { id: userId }, access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: userId, session_id: sessionId })}.signature` };
}
function store() {
  const entries = new Map<string, string>([[key, JSON.stringify(session())]]);
  const raw = { getItem: (name: string) => entries.get(name) ?? null, setItem: (name: string, value: string) => { entries.set(name, value); }, removeItem: (name: string) => { entries.delete(name); } };
  return { entries, raw, storage: createIdentityBoundAuthStorage(project, raw) };
}

describe('identity-bound auth storage removal', () => {
  it('allows a successful logout of the initiating session', async () => {
    const { storage } = store();
    await withIdentityBoundSignOut(project, expected, async () => {
      expect(sessionIdentity(JSON.parse((await storage.getItem(key))!))).toEqual(expected);
      markSignOutResponse(project, true);
      await storage.removeItem(key);
    });
    expect(await storage.getItem(key)).toBeNull();
  });

  it.each([
    ['another user', session('person-b', 'session-b')],
    ['a new session for the same user', session('person-a', 'session-new')],
  ])('blocks %s before SDK reads credentials and before deletion', async (_name, replacement) => {
    const { storage, raw } = store();
    await withIdentityBoundSignOut(project, expected, async () => {
      raw.setItem(key, JSON.stringify(replacement));
      expect(() => storage.getItem(key)).toThrow(/changed/);
      markSignOutResponse(project, true);
      expect(() => storage.removeItem(key)).toThrow();
    });
    expect(JSON.parse((await storage.getItem(key))!)).toEqual(replacement);
  });

  it('keeps the existing session after a rejected or absent logout response', async () => {
    for (const confirmed of [false, undefined]) {
      const { storage } = store();
      await expect(withIdentityBoundSignOut(project, expected, async () => {
        if (confirmed !== undefined) markSignOutResponse(project, confirmed);
        await storage.removeItem(key);
      })).rejects.toThrow();
      expect(sessionIdentity(JSON.parse((await storage.getItem(key))!))).toEqual(expected);
    }
  });

  it('keeps an aborted scope until the raw SDK promise settles', async () => {
    const { storage } = store();
    const controller = new AbortController();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const pending = withIdentityBoundSignOut(project, expected, async () => {
      await held;
      markSignOutResponse(project, true);
      await storage.removeItem(key);
    }, controller.signal);
    controller.abort();
    await expect(withIdentityBoundSignOut(project, expected, async () => {})).rejects.toThrow(/earlier/);
    release();
    await expect(pending).rejects.toThrow();
    expect(sessionIdentity(JSON.parse((await storage.getItem(key))!))).toEqual(expected);
  });

  it('preserves unrelated keys and ordinary SDK session cleanup outside logout', async () => {
    const { storage, raw } = store();
    raw.setItem('unrelated', 'keep');
    await storage.removeItem(key);
    expect(await storage.getItem(key)).toBeNull();
    expect(await storage.getItem('unrelated')).toBe('keep');
  });
});

describe('session identity claim binding', () => {
  it('extracts identity without retaining tokens, and distinguishes a fresh login by the same user', () => {
    expect(sessionIdentity(session())).toEqual(expected);
    expect(accessTokenIdentity(session().access_token)).toEqual(expected);
    expect(sameAuthSession(expected, sessionIdentity(session('person-a', 'session-new')))).toBe(false);
    expect(sameAuthSession(expected, sessionIdentity(session()))).toBe(true);
  });

  it('rejects malformed tokens, missing session IDs and mismatched user/sub claims', () => {
    expect(sessionIdentity({ ...session(), user: { id: 'person-b' } })).toBeNull();
    expect(sessionIdentity(session('person-a', ''))).toBeNull();
    expect(sessionIdentity({ user: { id: 'person-a' } })).toBeNull();
    for (const token of [undefined, '', 'a.b.c', 'a.%%%25.c', 'x'.repeat(65_537)]) expect(accessTokenIdentity(token)).toBeNull();
  });
});

describe('identity-bound auth update commit', () => {
  it.each([
    ['another user', session('person-b', 'session-b')],
    ['a new session for the same user', session('person-a', 'session-new')],
  ])('does not overwrite %s after the response was accepted', async (_name, replacement) => {
    const { storage, raw } = store();
    await withIdentityBoundAuthUpdate(project, expected, async () => {
      const original = (await storage.getItem(key))!;
      raw.setItem(key, JSON.stringify(replacement));
      expect(() => storage.getItem(key)).toThrow(/changed/);
      expect(() => storage.setItem(key, original)).toThrow(/before its update was stored/);
      expect(() => storage.removeItem(key)).toThrow(/replacement session/);
    });
    expect(JSON.parse((await storage.getItem(key))!)).toEqual(replacement);
  });

  it('allows unrelated replacement login writes and prevents the old update from following them', async () => {
    const { storage } = store();
    const replacement = JSON.stringify(session('person-b', 'session-b'));
    await withIdentityBoundAuthUpdate(project, expected, async () => {
      await storage.setItem(key, replacement);
      expect(() => storage.setItem(key, JSON.stringify(session()))).toThrow();
    });
    expect(await storage.getItem(key)).toBe(replacement);
  });

  it('allows updated user fields and rotated tokens within the same session', async () => {
    const { storage } = store();
    const updated = { ...session(), user: { id: 'person-a', changed: true } };
    updated.access_token = updated.access_token.replace('.signature', '.rotated');
    await withIdentityBoundAuthUpdate(project, expected, async () => { await storage.setItem(key, JSON.stringify(updated)); });
    expect(JSON.parse((await storage.getItem(key))!)).toEqual(updated);
  });

  it('holds an aborted update guard until the raw SDK promise settles', async () => {
    const { storage } = store();
    const controller = new AbortController();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const pending = withIdentityBoundAuthUpdate(project, expected, async () => {
      await held;
      await storage.setItem(key, JSON.stringify(session()));
    }, controller.signal);
    controller.abort();
    await expect(withIdentityBoundAuthUpdate(project, expected, async () => {})).rejects.toThrow(/earlier/);
    release();
    await expect(pending).rejects.toThrow();
    expect(sessionIdentity(JSON.parse((await storage.getItem(key))!))).toEqual(expected);
  });
});

describe('identity-bound sign-in commit', () => {
  it.each(['signin', 'signup'] as const)('does not store a cancelled %s response after it was parsed', async action => {
    const { storage, raw } = store();
    const controller = new AbortController();
    vi.stubGlobal('window', { localStorage: raw });
    try {
      await withIdentityBoundAuthSignIn(project, action, async () => {
        markAuthSignInResponse(project, action, { userId: 'person-b', sessionId: 'session-b' });
        controller.abort();
        expect(() => storage.setItem(key, JSON.stringify(session('person-b', 'session-b')))).toThrow();
      }, controller.signal);
      expect(sessionIdentity(JSON.parse((await storage.getItem(key))!))).toEqual(expected);
    } finally { vi.unstubAllGlobals(); }
  });

  it('allows a replacement sign-in write while blocking the older candidate commit', async () => {
    const { storage, raw } = store();
    vi.stubGlobal('window', { localStorage: raw });
    const replacement = JSON.stringify(session('person-a', 'session-new'));
    try {
      await withIdentityBoundAuthSignIn(project, 'signin', async () => {
        markAuthSignInResponse(project, 'signin', { userId: 'person-b', sessionId: 'session-b' });
        await storage.setItem(key, replacement);
        expect(() => storage.setItem(key, JSON.stringify(session('person-b', 'session-b')))).toThrow();
      });
      expect(await storage.getItem(key)).toBe(replacement);
    } finally { vi.unstubAllGlobals(); }
  });

  it('commits a guest sign-in and permits same-session token rotation afterward', async () => {
    const { storage, raw } = store();
    raw.removeItem(key);
    vi.stubGlobal('window', { localStorage: raw });
    try {
      await withIdentityBoundAuthSignIn(project, 'signin', async () => {
        markAuthSignInResponse(project, 'signin', expected);
        await storage.setItem(key, JSON.stringify(session()));
        const rotated = { ...session(), access_token: session().access_token.replace('.signature', '.rotated') };
        await storage.setItem(key, JSON.stringify(rotated));
        expect(await storage.getItem(key)).toBe(JSON.stringify(rotated));
      });
    } finally { vi.unstubAllGlobals(); }
  });
});
