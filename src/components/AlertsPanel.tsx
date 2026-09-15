'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Snapshot } from '@/lib/types';
import { PROTOCOLS } from '@/lib/protocols';
import { getSupabase } from '@/lib/supabase';
import { alertStorageKey, createAlertRule, decodeAlertStore, deleteAlertRule, emptyAlertStore, encodeAlertStore, evaluateAlerts, runAlertWorker, type AlertStore } from '@/lib/alerts';
import styles from './AlertsPanel.module.css';

const DEMO_OWNER = 'demo-local-owner';
const DEMO_AUTHORITY = 'DemoVelocityAuthority111111111111111111111111';

function demoSnapshot(snapshot: Snapshot | null): Snapshot {
  if (snapshot?.source === 'live' && snapshot.protocol?.id === 'velocity' && snapshot.risk?.maintenanceHeadroom !== null && snapshot.risk?.maintenanceHeadroom !== undefined) return snapshot;
  const base = snapshot ? structuredClone(snapshot) : null;
  const useLocalScope = !snapshot || snapshot.source !== 'live' || snapshot.protocol?.id !== 'velocity';
  return {
    ...(base ?? { source: 'live', network: 'mainnet-beta', authority: DEMO_AUTHORITY, sampleName: null, subaccount: { id: 0, name: 'Local fixture', address: DEMO_AUTHORITY }, retrievedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString(), accountSlot: null, observedSlot: null, metrics: [], positions: [], spots: [], orders: [], inventoryAvailable: true, warnings: [], provenance: [] }),
    source: 'live', network: 'mainnet-beta', protocol: { ...PROTOCOLS.velocity },
    authority: useLocalScope ? DEMO_AUTHORITY : (base?.authority ?? DEMO_AUTHORITY),
    subaccount: useLocalScope ? { id: 0, name: 'Local fixture', address: DEMO_AUTHORITY } : (base?.subaccount ?? { id: 0, name: 'Local fixture', address: DEMO_AUTHORITY }),
    retrievedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString(),
    risk: { scope: 'cross-margin', totalCollateral: '1200', maintenanceRequirement: '950', maintenanceHeadroom: '250', canBeLiquidated: false, status: 'clear', explanation: 'Deterministic local fixture for proving the threshold event, outbox and mock delivery path. It is not a live account.', },
  };
}

export default function AlertsPanel({ snapshot }: { snapshot: Snapshot | null }) {
  const [ownerId, setOwnerId] = useState(DEMO_OWNER);
  const [authenticated, setAuthenticated] = useState(false);
  const [store, setStore] = useState<AlertStore>(() => emptyAlertStore());
  const [threshold, setThreshold] = useState('300');
  const [direction, setDirection] = useState<'below' | 'above'>('below');
  const [cadence, setCadence] = useState('15');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const db = getSupabase();
    if (!db) return () => { active = false; };
    void db.auth.getUser().then(({ data }) => {
      if (active && data.user?.id) { setAuthenticated(true); setOwnerId(data.user.id); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      try { setStore(decodeAlertStore(localStorage.getItem(alertStorageKey(ownerId)))); } catch { setStore(emptyAlertStore()); }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [ownerId]);

  function persist(next: AlertStore) {
    setStore(next);
    try { localStorage.setItem(alertStorageKey(ownerId), encodeAlertStore(next)); } catch { setMessage('Browser storage is unavailable; this local monitor cannot persist changes.'); }
  }

  const activeSnapshot = useMemo(() => demoSnapshot(snapshot), [snapshot]);
  const rule = store.rules[0];
  const latestEvent = store.events[store.events.length - 1];
  const latestDelivery = store.deliveries[store.deliveries.length - 1];
  const activeAuthority = activeSnapshot.authority ?? DEMO_AUTHORITY;
  const scopeLabel = activeAuthority === DEMO_AUTHORITY ? 'Deterministic local fixture · Velocity · subaccount 0' : `Velocity · ${activeAuthority.slice(0, 5)}…${activeAuthority.slice(-5)} · subaccount ${activeSnapshot.subaccount.id}`;

  function saveRule() {
    setBusy(true); setMessage('');
    try {
      const nextRule = createAlertRule({ ownerId, authority: activeAuthority, subaccountId: activeSnapshot.subaccount.id, direction, threshold, cadenceMinutes: Number(cadence), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
      const next = { ...store, rules: [nextRule, ...store.rules.filter(item => item.id !== rule?.id)] };
      persist(next); setMessage(authenticated ? 'Monitoring configured for your owner session.' : 'Local demo monitoring configured on this device.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The threshold could not be saved.'); }
    finally { setBusy(false); }
  }

  function run() {
    setBusy(true); setMessage('');
    const evaluated = evaluateAlerts(store, activeSnapshot, ownerId, new Date());
    const delivered = runAlertWorker(evaluated, ownerId, 'local-mock-worker', new Date());
    persist(delivered);
    setMessage(delivered.deliveries.length > store.deliveries.length ? 'Fresh check crossed the threshold; mock delivery recorded.' : 'Fresh check completed. No new threshold event.');
    setBusy(false);
  }

  function pause() {
    if (!rule) return;
    const next = { ...store, rules: store.rules.map(item => item.id === rule.id ? { ...item, enabled: false, updatedAt: new Date().toISOString() } : item) };
    persist(next); setMessage('Monitoring paused. Queued work will not be evaluated.');
  }

  function remove() {
    if (!rule) return;
    persist(deleteAlertRule(store, rule.id, ownerId));
    setMessage('Monitoring and its queued work were deleted.');
  }

  return <section className={`surface ${styles.panel}`} aria-labelledby="alerts-heading">
    <div className={styles.heading}>
      <div><div className={styles.eyebrow}>LOCAL THRESHOLD MONITOR</div><h2 id="alerts-heading">Know when headroom changes.</h2><p>{scopeLabel}</p></div>
      <span className={`${styles.state} ${latestDelivery ? styles.delivered : latestEvent ? styles.pending : ''}`}>{latestDelivery ? 'Delivered · mock sink' : latestEvent ? 'Event queued' : rule ? 'Configured' : 'Not configured'}</span>
    </div>
    {!authenticated && <p className={styles.note}>Guest demo uses a deterministic fixture and stays on this device. <Link href="/auth">Sign in</Link> to bind settings to an owner session when cloud auth is ready.</p>}
    <div className={styles.form}>
      <div className={styles.field}><label htmlFor="alert-threshold">Headroom threshold (USD)</label><input id="alert-threshold" inputMode="decimal" value={threshold} onChange={event => setThreshold(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="alert-direction">Trigger</label><select id="alert-direction" value={direction} onChange={event => setDirection(event.target.value as 'below' | 'above')}><option value="below">At or below</option><option value="above">At or above</option></select></div>
      <div className={styles.field}><label htmlFor="alert-cadence">Cadence (minutes)</label><input id="alert-cadence" type="number" min="1" max="1440" value={cadence} onChange={event => setCadence(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="alert-destination">Destination</label><select id="alert-destination" value="mock" disabled><option value="mock">Local mock sink</option></select></div>
      <button className="button primary" type="button" disabled={busy} onClick={saveRule}>{rule ? 'Update rule' : 'Configure rule'}</button>
    </div>
    {rule && <div className={styles.rule}><div><strong>{rule.metric.replace('_', ' ')} {rule.direction} {rule.threshold} USD</strong><small>{rule.enabled ? 'Worker can evaluate fresh snapshots.' : 'Paused'} · {rule.cadenceMinutes} min · {rule.timezone}</small></div><div className={styles['rule-actions']}><button className="button small" type="button" disabled={busy || !rule.enabled} onClick={run}>Run fresh check</button><button className="button small" type="button" disabled={busy || !rule.enabled} onClick={pause}>Pause</button><button className="button small" type="button" disabled={busy} onClick={remove}>Delete</button></div></div>}
    <div className={styles.metrics}><div className={styles.metric}><span>Worker status</span><strong>{store.worker.running ? 'Running · local mock' : 'Ready to run'}</strong></div><div className={styles.metric}><span>Last fresh check</span><strong>{store.lastFreshCheck ? new Date(store.lastFreshCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</strong></div><div className={styles.metric}><span>Delivery state</span><strong>{latestDelivery ? 'Delivered' : latestEvent ? 'Pending' : 'No event yet'}</strong></div></div>
    {latestDelivery && <div className={styles.delivery}><strong>Mock delivery recorded.</strong> {latestDelivery.message}</div>}
    {message && <p className={styles.note} role="status" aria-live="polite">{message}</p>}
  </section>;
}
