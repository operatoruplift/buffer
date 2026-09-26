'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { runAuthOperation } from '@/lib/auth-flow';
import { persistedAuthSession, sessionIdentity, sameAuthSession, withIdentityBoundSignOut, type AuthSessionIdentity } from '@/lib/auth-storage';
import { decodeCloudReports, isCloudReportPayload, type SavedReport } from '@/lib/cloud-reports';
import { formatUtc } from '@/lib/format';
import type { createReport } from '@/lib/report';
import styles from './AccountPanel.module.css';
import DeviceReportsPanel from './DeviceReportsPanel';

type Report = ReturnType<typeof createReport>;
type Operation = { identity: string; controller: AbortController };
const REQUEST_TIMEOUT_MS = 15_000;
const AUTH_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const AUTH_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

/** Bound even SDK promises that do not settle promptly after a transport abort. */
async function bounded<T>(work: PromiseLike<T>, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const stopped = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error('Request stopped'));
    controller.signal.addEventListener('abort', abort, { once: true });
    if (controller.signal.aborted) abort();
    timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  });
  try { return await Promise.race([Promise.resolve(work), stopped]); }
  finally { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); }
}

export default function AccountPanel({ report }: { report: Report | null }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!AUTH_CONFIGURED);
  const [authError, setAuthError] = useState(false);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState<'idle' | 'loaded' | 'error'>('idle');
  const [writeUncertain, setWriteUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const identity = useRef<string | null>(null);
  const acceptedSession = useRef<AuthSessionIdentity | null>(null);
  const operation = useRef<Operation | null>(null);
  const authAttempt = useRef<AbortController | null>(null);

  const acceptSession = useCallback((session: Session | null) => {
    const nextIdentity = session?.user.id ?? null;
    const nextSession = sessionIdentity(session);
    if (identity.current !== nextIdentity || (acceptedSession.current !== null && !sameAuthSession(acceptedSession.current, nextSession))) {
      operation.current?.controller.abort();
      operation.current = null;
      identity.current = nextIdentity;
      setReports([]);
      setMessage('');
      setBusy(false);
      setLoadState('idle');
      setWriteUncertain(false);
      if (!nextIdentity) dialog.current?.close();
    }
    acceptedSession.current = nextSession;
    setUser(session?.user ?? null);
    setAuthReady(true);
    setAuthError(false);
  }, []);

  useEffect(() => {
    const db = getSupabase();
    if (!db) return;
    let active = true;
    let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => { if (active) setAuthError(true); }, REQUEST_TIMEOUT_MS);
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      clearTimeout(timer);
      clearTimeout(reconcileTimer);
      // Invalidate an earlier read now, before the replacement timer can run.
      authAttempt.current?.abort();
      authAttempt.current = null;
      const persisted = persistedAuthSession(AUTH_URL);
      if ((event === 'SIGNED_OUT' && persisted) || (session && !sameAuthSession(sessionIdentity(session), persisted))) {
        // A queued SDK event may describe a session replaced after its commit.
        // Reconcile after the SDK action settles, outside its callback/lock.
        reconcileTimer = setTimeout(() => {
          if (!active) return;
          const controller = new AbortController();
          authAttempt.current?.abort();
          authAttempt.current = controller;
          void bounded(db.auth.getSession(), controller).then(({ data, error }) => {
            if (active && authAttempt.current === controller && !error) acceptSession(data.session);
          }).catch(() => { if (active && authAttempt.current === controller) setAuthError(true); }).finally(() => {
            if (authAttempt.current === controller) authAttempt.current = null;
          });
        }, 0);
        return;
      }
      acceptSession(session);
    });
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(reconcileTimer);
      operation.current?.controller.abort();
      operation.current = null;
      authAttempt.current?.abort();
      authAttempt.current = null;
      subscription.unsubscribe();
    };
  }, [acceptSession]);

  async function retryAccount() {
    const db = getSupabase();
    if (!db) { setAuthReady(true); setAuthError(true); return; }
    authAttempt.current?.abort();
    const controller = new AbortController();
    authAttempt.current = controller;
    setAuthError(false);
    try {
      const { data, error } = await bounded(db.auth.getSession(), controller);
      if (authAttempt.current !== controller) return;
      if (error) throw error;
      acceptSession(data.session);
    } catch {
      if (authAttempt.current === controller) setAuthError(true);
    } finally {
      if (authAttempt.current === controller) authAttempt.current = null;
    }
  }

  function begin(): Operation | null {
    if (!user || identity.current !== user.id) return null;
    operation.current?.controller.abort();
    const next = { identity: user.id, controller: new AbortController() };
    operation.current = next;
    setBusy(true);
    setMessage('');
    return next;
  }
  function current(ticket: Operation) {
    return operation.current === ticket && identity.current === ticket.identity;
  }
  function finish(ticket: Operation) {
    if (current(ticket)) { operation.current = null; setBusy(false); }
  }
  async function fetchReports(ticket: Operation) {
    const db = getSupabase()!;
    const { data, error } = await bounded(db.from('saved_reports').select('id,title,created_at,report')
      .eq('user_id', ticket.identity).order('created_at', { ascending: false }).limit(50).abortSignal(ticket.controller.signal), ticket.controller);
    if (error) throw error;
    return decodeCloudReports(data);
  }
  async function load() {
    if (!getSupabase()) return;
    const ticket = begin();
    if (!ticket) return;
    try {
      const items = await fetchReports(ticket);
      if (!current(ticket)) return;
      setReports(items); setLoadState('loaded'); setWriteUncertain(false);
    } catch {
      if (current(ticket)) { setLoadState('error'); setMessage('Saved reports could not be loaded or read. Your existing data was kept. Please retry.'); }
    } finally { finish(ticket); }
  }
  async function save() {
    const db = getSupabase();
    if (!db || !report || busy || writeUncertain) return;
    if (!isCloudReportPayload(report)) { setMessage('This scenario could not be saved because its report is invalid or too large. Refresh the explorer and try again.'); return; }
    const ticket = begin();
    if (!ticket) return;
    let saved = false;
    try {
      const title = `${report.sampleName || 'Public account'} · ${report.scenario.shockPercent}% move`.slice(0, 180);
      const { error } = await bounded(db.from('saved_reports').insert({ user_id: ticket.identity, title, report }).abortSignal(ticket.controller.signal), ticket.controller);
      if (error) throw error;
      if (!current(ticket)) return;
      saved = true;
      const items = await fetchReports(ticket);
      if (!current(ticket)) return;
      setReports(items); setLoadState('loaded'); setWriteUncertain(false);
      setMessage('Scenario saved to your private library.');
    } catch {
      if (current(ticket)) {
        setLoadState('error'); setWriteUncertain(true);
        setMessage(saved ? 'Scenario saved, but the library could not be refreshed. Reload reports to see it.' : 'Saving could not be confirmed. Reload reports before trying again.');
      }
    } finally { finish(ticket); }
  }
  async function remove(id: string) {
    const db = getSupabase();
    if (!db || busy || writeUncertain || !reports.some(item => item.id === id)) return;
    const ticket = begin();
    if (!ticket) return;
    try {
      const { error } = await bounded(db.from('saved_reports').delete().eq('id', id).eq('user_id', ticket.identity).abortSignal(ticket.controller.signal), ticket.controller);
      if (error) throw error;
      if (!current(ticket)) return;
      setReports(items => items.filter(item => item.id !== id)); setMessage('Report deleted.');
    } catch {
      if (current(ticket)) { setLoadState('error'); setWriteUncertain(true); setMessage('Deletion could not be confirmed. Reload reports before trying again.'); }
    } finally { finish(ticket); }
  }
  async function signOut() {
    const db = getSupabase();
    if (!db || busy) return;
    const expected = acceptedSession.current;
    if (!expected || expected.userId !== user?.id) { setMessage('This session could not be verified. Reload the page before signing out.'); return; }
    const ticket = begin();
    if (!ticket) return;
    try {
      const { error } = await runAuthOperation('signout', signal => withIdentityBoundSignOut(AUTH_URL, expected,
        () => db.auth.signOut({ scope: 'local' }), signal), ticket.controller.signal, REQUEST_TIMEOUT_MS, expected);
      if (error) throw error;
      if (current(ticket)) dialog.current?.close();
    } catch {
      if (current(ticket)) setMessage('Could not sign out. Please retry.');
    } finally { finish(ticket); }
  }
  function download(item: SavedReport) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(item.report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `buffer-saved-${item.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function close() {
    operation.current?.controller.abort();
    operation.current = null;
    setBusy(false);
    trigger.current?.focus();
  }
  if (!user) return <><DeviceReportsPanel report={report} />{authReady ? <a className="button subtle cloud-sign-in" href="/auth">Sign in</a> : authError ? <button className="button subtle" onClick={() => void retryAccount()}>Retry account</button> : <span role="status">Checking account…</span>}</>;
  return <>
    <button className="button subtle" data-report-storage="cloud" data-session-state={authError ? 'error' : 'ready'} ref={trigger} disabled={busy} onClick={() => { dialog.current?.showModal(); void load(); }}>My reports</button>
    <dialog className={styles.dialog} ref={dialog} aria-labelledby="saved-reports-title" onClose={close}>
      <div className={styles.heading}><div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="saved-reports-title">Saved perspectives.</h2></div><button className="button subtle" aria-label="Close saved reports" onClick={() => dialog.current?.close()}>×</button></div>
      <p className={styles.email}>{user.email}</p>
      <p>Keep a dated copy of a scenario. Saved reports are historical records; they do not refresh with the market.</p>
      <button className="button primary" disabled={!report || busy || writeUncertain} onClick={() => void save()}>Save current scenario</button>
      <p role="status" aria-live="polite">{busy ? 'Working…' : message}</p>
      {!busy && loadState !== 'loaded' && <button className="button subtle" onClick={() => void load()}>{loadState === 'error' ? 'Reload reports' : 'Load reports'}</button>}
      {!busy && loadState === 'loaded' && reports.length === 0 && <p>No reports saved yet.</p>}
      <ul className={styles.list}>{reports.map(item => <li key={item.id}><div><strong>{item.title}</strong><small>{formatUtc(item.created_at)}</small></div><div className={styles.actions}><button className="button subtle" onClick={() => download(item)}>Download JSON</button><button className="button subtle" disabled={busy || writeUncertain} onClick={() => void remove(item.id)}>Delete</button></div></li>)}</ul>
      <p className={styles.note}>Your most recent 50 reports. Only your signed-in account can access them.</p>
      <button className="button subtle" disabled={busy} onClick={() => void signOut()}>Sign out</button>
    </dialog>
  </>;
}
