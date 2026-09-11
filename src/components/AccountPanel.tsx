'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import type { createReport } from '@/lib/report';
import styles from './AccountPanel.module.css';

type Report = ReturnType<typeof createReport>;
type SavedReport = { id: string; title: string; created_at: string; report: Report };

export default function AccountPanel({ report }: { report: Report | null }) {
  const [user, setUser] = useState<User | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const requests = generation;
    const db = getSupabase();
    if (!db) return;
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      const nextIdentity = session?.user.id ?? null;
      if (identity.current !== nextIdentity) {
        identity.current = nextIdentity;
        generation.current++;
        setReports([]);
        setMessage('');
        setBusy(false);
      }
      setUser(session?.user ?? null);
    });
    return () => { requests.current++; subscription.unsubscribe(); };
  }, []);
  async function load() {
    const db = getSupabase();
    if (!db || !user || identity.current !== user.id) return;
    const ticket = generation.current;
    setBusy(true);
    const { data, error } = await db.from('saved_reports').select('id,title,created_at,report').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    if (ticket !== generation.current) return;
    setBusy(false);
    if (error) setMessage('Saved reports could not be loaded. Please retry.');
    else { setReports((data ?? []) as SavedReport[]); setMessage(''); }
  }
  async function save() {
    const db = getSupabase();
    if (!db || !user || !report || busy || identity.current !== user.id) return;
    const ticket = generation.current;
    setBusy(true);
    const title = `${report.sampleName || 'Drift account'} · ${report.scenario.shockPercent}% move`;
    const { error } = await db.from('saved_reports').insert({ user_id: user.id, title, report });
    if (ticket !== generation.current) return;
    setBusy(false);
    if (error) setMessage('This report could not be saved. Please retry.');
    else { await load(); if (ticket === generation.current) setMessage('Scenario saved to your private library.'); }
  }
  async function remove(id: string) {
    const db = getSupabase();
    if (!db || busy || !user || identity.current !== user.id) return;
    const ticket = generation.current;
    setBusy(true);
    const { error } = await db.from('saved_reports').delete().eq('id', id);
    if (ticket !== generation.current) return;
    setBusy(false);
    if (error) setMessage('The report could not be deleted. Please retry.');
    else { setReports(current => current.filter(item => item.id !== id)); setMessage('Report deleted.'); }
  }
  function download(item: SavedReport) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(item.report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `buffer-saved-${item.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!user) return <a className="button subtle" href="/auth">Sign in</a>;
  return <>
    <button className="button subtle" ref={trigger} onClick={() => { dialog.current?.showModal(); void load(); }}>My reports</button>
    <dialog className={styles.dialog} ref={dialog} aria-labelledby="saved-reports-title" onClose={() => trigger.current?.focus()}>
      <div className={styles.heading}><div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="saved-reports-title">Saved perspectives.</h2></div><button className="button subtle" aria-label="Close saved reports" onClick={() => dialog.current?.close()}>×</button></div>
      <p className={styles.email}>{user.email}</p>
      <p>Keep a dated copy of a scenario. Saved reports are historical records; they do not refresh with the market.</p>
      <button className="button primary" disabled={!report || busy} onClick={() => void save()}>Save current scenario</button>
      <p role="status" aria-live="polite">{busy ? 'Working…' : message}</p>
      {!busy && reports.length === 0 && <p>No reports saved yet.</p>}
      <ul className={styles.list}>{reports.map(item => <li key={item.id}><div><strong>{item.title}</strong><small>{new Date(item.created_at).toLocaleString()}</small></div><div className={styles.actions}><button className="button subtle" onClick={() => download(item)}>Download JSON</button><button className="button subtle" disabled={busy} onClick={() => void remove(item.id)}>Delete</button></div></li>)}</ul>
      <p className={styles.note}>Your most recent 50 reports. Only your signed-in account can access them.</p>
      <button className="button subtle" disabled={busy} onClick={async () => { const { error } = await getSupabase()!.auth.signOut(); if (error) setMessage('Could not sign out. Please retry.'); else dialog.current?.close(); }}>Sign out</button>
    </dialog>
  </>;
}
