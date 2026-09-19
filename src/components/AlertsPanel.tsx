'use client';

import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '@/lib/types';
import { PROTOCOLS } from '@/lib/protocols';
import { getSupabase } from '@/lib/supabase';
import { persistedAuthSession } from '@/lib/auth-storage';
import {
  alertStorageKey, createAlertRule, parseAlertStore, deleteAlertRule,
  emptyAlertStore, encodeAlertStore, evaluateFixtureAlerts,
  pauseAlertRule, runAlertWorker, updateAlertRule, type AlertStore,
} from '@/lib/alerts';
import Select from './Select';
import LiveMonitoringPanel from './LiveMonitoringPanel';
import styles from './AlertsPanel.module.css';

const DEVICE_OWNER = 'demo-local-owner';
const AUTH_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

const FIXTURE_AUTHORITY = 'DemoVelocityAuthority111111111111111111111111';

/** An explicit test input, never a replacement for unavailable live data. */
function fixtureSnapshot(): Snapshot {
  return {
    source: 'sample', network: 'fixture', protocol: PROTOCOLS.velocity,
    authority: FIXTURE_AUTHORITY, sampleName: 'Threshold pipeline fixture',
    subaccount: { id: 0, name: 'Local fixture', address: null },
    retrievedAt: new Date().toISOString(), expiresAt: null, accountSlot: null, observedSlot: null,
    metrics: [], positions: [], spots: [], orders: [], inventoryAvailable: true, warnings: [], provenance: ['Deterministic local alert test; no provider read.'],
    risk: { scope: 'cross-margin', totalCollateral: '1200', maintenanceRequirement: '950', maintenanceHeadroom: '250', canBeLiquidated: false, status: 'clear', explanation: 'Fixed test values for a local mock delivery.' },
  };
}

type Props = { snapshot: Snapshot | null; stale?: boolean; scopeChanged?: boolean };

export default function AlertsPanel(props: Props) {
  const [identity, setIdentity] = useState<{ ownerId: string; session: string } | null>(null);
  const [manageLive, setManageLive] = useState(false);
  useEffect(() => {
    let active = true;
    const db = getSupabase();
    // The callback includes INITIAL_SESSION and clears the view immediately on
    // sign-out/account changes. No late getUser request can restore an old owner.
    const reconcile = () => {
      const session = AUTH_URL ? persistedAuthSession(AUTH_URL) : null;
      if (active) setIdentity({ ownerId: session?.userId ?? DEVICE_OWNER, session: session?.sessionId ?? 'device' });
    };
    const subscription = db?.auth.onAuthStateChange(reconcile).data.subscription;
    const timer = window.setTimeout(() => {
      if (active) reconcile();
    }, db ? 12_000 : 0);
    return () => { active = false; window.clearTimeout(timer); subscription?.unsubscribe(); };
  }, []);
  const scope = `${props.snapshot?.source}:${props.snapshot?.protocol?.id}:${props.snapshot?.authority}:${props.snapshot?.subaccount.id}:${props.snapshot?.retrievedAt}:${props.stale}:${props.scopeChanged}`;
  return <>
    {props.snapshot?.source === 'sample' && <div className={styles.modeActions} aria-label="Alert mode"><button type="button" className="button small" aria-pressed={!manageLive} onClick={() => setManageLive(false)}>Example alerts</button><button type="button" className="button small" aria-pressed={manageLive} onClick={() => setManageLive(true)}>Manage live rules</button></div>}
    {identity
      ? props.snapshot?.source === 'sample' && !manageLive
        ? <RehearsalAlerts key={`example:${identity.ownerId}:${identity.session}:${scope}`} {...props} ownerId={identity.ownerId} sessionId={identity.session} />
        : <LiveMonitoringPanel key={`live:${identity.ownerId}:${identity.session}:${scope}`} {...props} snapshot={props.snapshot?.source === 'sample' ? null : props.snapshot} ownerId={identity.ownerId === DEVICE_OWNER ? null : identity.ownerId} sessionId={identity.session} />
      : <section className={`surface ${styles.panel}`} aria-busy="true"><h2>Know when headroom changes.</h2><p>Loading device settings…</p></section>}
  </>;
}

function RehearsalAlerts({ ownerId, sessionId }: Props & { ownerId: string; sessionId: string }) {
  const [store, setStore] = useState<AlertStore>(emptyAlertStore);
  const [ready, setReady] = useState(false);
  const [threshold, setThreshold] = useState('300');
  const [direction, setDirection] = useState<'below' | 'above'>('below');
  const [cadence, setCadence] = useState('15');
  const [timezone, setTimezone] = useState('UTC');
  const [cooldown, setCooldown] = useState('15');
  const [hysteresis, setHysteresis] = useState('10');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const inFlight = useRef(false);
  const key = `buffer.alerts.rehearsal.v2:${ownerId}`;
  const [legacyAvailable, setLegacyAvailable] = useState(false);

  useEffect(() => {
    active.current = true;
    function load() {
      try { const raw = localStorage.getItem(key); setStore(raw === null ? emptyAlertStore() : parseAlertStore(raw)); setReady(true); setLegacyAvailable(localStorage.getItem(alertStorageKey(ownerId)) !== null); }
      catch { setStore(emptyAlertStore()); setMessage('Device settings could not be read. Stored data is preserved; restore a valid backup before making changes.'); setReady(false); }
    }
    const timer = window.setTimeout(load, 0);
    const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) load(); };
    window.addEventListener('storage', changed);
    return () => { active.current = false; window.clearTimeout(timer); window.removeEventListener('storage', changed); };
  }, [key, ownerId]);

  // This component only handles example data and has no network send path.
  const authority = FIXTURE_AUTHORITY;
  const subaccountId = 0;
  const rule = store.rules.find(item => item.ownerId === ownerId && item.authority === authority && item.subaccountId === subaccountId);
  const scopeKey = `${authority}:${subaccountId}:fixture`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setThreshold(rule?.threshold ?? '300'); setDirection(rule?.direction ?? 'below');
      setCadence(String(rule?.cadenceMinutes ?? 15)); setTimezone(rule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC');
      setCooldown(String(rule?.cooldownMinutes ?? 15)); setHysteresis(rule?.hysteresis ?? '10');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rule?.id, rule?.version, rule?.threshold, rule?.direction, rule?.cadenceMinutes, rule?.timezone, rule?.cooldownMinutes, rule?.hysteresis, scopeKey]);


  const latestEvent = store.events.filter(event => event.ownerId === ownerId && event.ruleId === rule?.id).at(-1);
  const latestDelivery = store.deliveries.find(item => item.ownerId === ownerId && item.eventId === latestEvent?.id);
  const monitor = store.monitors.find(item => item.ruleId === rule?.id);
  const deliveryLabel = latestEvent?.state === 'delivered' ? 'Delivered' : latestEvent?.state === 'suppressed' ? 'Cancelled' : latestEvent?.state === 'failed' ? 'Retry pending' : latestEvent ? 'Pending' : 'No event yet';
  const scopeLabel = 'Local example · fixed 250 USD headroom · subaccount 0';

  async function mutate(change: (current: AlertStore) => { next: AlertStore; notice: string }) {
    if (!ready || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      if (!navigator.locks) throw new Error('This browser cannot safely coordinate device settings across tabs. Use a current browser.');
      await navigator.locks.request(key, () => {
        if (!active.current) return;
        const currentSession = AUTH_URL ? persistedAuthSession(AUTH_URL) : null;
        if ((currentSession?.userId ?? DEVICE_OWNER) !== ownerId || (currentSession?.sessionId ?? 'device') !== sessionId) throw new Error('The account session changed. Reload these settings.');
        const raw = localStorage.getItem(key);
        const current = raw === null ? emptyAlertStore() : parseAlertStore(raw);
        const result = change(current);
        localStorage.setItem(key, encodeAlertStore(result.next));
        if (active.current) { setStore(result.next); setMessage(result.notice); }
      });
    } catch (error) {
      if (active.current) setMessage(error instanceof Error ? error.message : 'Settings could not be saved.');
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  function saveRule() {
    if (!ready) return;
    void mutate(current => {
      const existing = current.rules.find(item => item.ownerId === ownerId && item.authority === authority && item.subaccountId === subaccountId);
      const config = { direction, threshold, cadenceMinutes: Number(cadence), timezone, cooldownMinutes: Number(cooldown), hysteresis, enabled: true };
      const next = existing ? updateAlertRule(current, existing.id, ownerId, config)
        : { ...current, rules: [...current.rules, createAlertRule({ ownerId, authority, subaccountId, ...config })] };
      return { next, notice: 'Local example rule configured on this device.' };
    });
  }

  function run() {
    if (!rule) return;
    void mutate(current => {
      const evaluated = evaluateFixtureAlerts(current, fixtureSnapshot(), ownerId);
      const next = runAlertWorker(evaluated, ownerId, 'device-mock-worker');
      return { next, notice: next.deliveries.length > current.deliveries.length
        ? 'Example threshold crossed; mock delivery recorded.'
        : 'Check completed. No new delivery; cadence, cooldown and recovery rules apply.' };
    });
  }

  return <section className={`surface ${styles.panel}`} aria-labelledby="alerts-heading">
    <div className={styles.heading}>
      <div><div className={styles.eyebrow}>ALERT REHEARSAL</div><h2 id="alerts-heading">Know when headroom changes.</h2><p>{scopeLabel}</p></div>
      <span className={`${styles.state} ${latestDelivery ? styles.delivered : latestEvent ? styles.pending : ''}`}>{!rule ? 'Not configured' : !rule.enabled ? 'Paused' : latestDelivery ? 'Delivered · mock sink' : latestEvent ? deliveryLabel : 'Configured'}</span>
    </div>
    <p className={styles.note}>Try a local example of threshold alerts. No live account is read and no message is sent. Settings stay on this device. Checks run only when requested here; this rehearsal is separate from live Discord monitoring.</p>
    <div className={styles.form}>
      <div className={styles.field}><label htmlFor="alert-threshold">Headroom threshold (USD)</label><input id="alert-threshold" inputMode="decimal" value={threshold} onChange={event => setThreshold(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="alert-direction">Trigger</label><Select id="alert-direction" label="Trigger" value={direction} options={[{ value: 'below', label: 'At or below' }, { value: 'above', label: 'At or above' }]} onChange={value => setDirection(value as 'below' | 'above')} /></div>
      <div className={styles.field}><label htmlFor="alert-cadence">Minimum check interval (minutes)</label><input id="alert-cadence" type="number" min="1" max="1440" step="1" value={cadence} onChange={event => setCadence(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="alert-timezone">Timezone</label><input id="alert-timezone" value={timezone} onChange={event => setTimezone(event.target.value)} maxLength={80} /></div>
      <div className={styles.field}><label htmlFor="alert-cooldown">Cooldown (minutes)</label><input id="alert-cooldown" type="number" min="1" max="1440" step="1" value={cooldown} onChange={event => setCooldown(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="alert-hysteresis">Recovery distance (USD)</label><input id="alert-hysteresis" inputMode="decimal" value={hysteresis} onChange={event => setHysteresis(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="alert-destination">Destination</label><input id="alert-destination" value="Local mock sink" readOnly /></div>
      <button className="button primary" type="button" disabled={busy || !ready} onClick={saveRule}>{rule ? 'Update rule' : 'Configure rule'}</button>
    </div>
    {rule && <div className={styles.rule}><div><strong>Maintenance headroom {rule.direction} {rule.threshold} USD</strong><small>{rule.enabled ? 'Configured · manual checks' : 'Paused'} · {rule.cadenceMinutes} min · {rule.timezone}</small></div><div className={styles['rule-actions']}><button className="button small" type="button" disabled={busy || !rule.enabled} onClick={run}>Run example check</button><button className="button small" type="button" disabled={busy || !rule.enabled} onClick={() => void mutate(current => ({ next: pauseAlertRule(current, rule.id, ownerId), notice: 'Monitoring paused. Pending deliveries cancelled.' }))}>Pause</button><button className="button small" type="button" disabled={busy} onClick={() => void mutate(current => ({ next: deleteAlertRule(current, rule.id, ownerId), notice: 'Rule deleted. Delivery history retained; pending work cancelled.' }))}>Delete</button></div></div>}
    <div className={styles.metrics}><div className={styles.metric}><span>Worker status</span><strong>{busy ? 'Checking now' : 'Idle · manual checks'}</strong></div><div className={styles.metric}><span>Last example check</span><strong>{monitor?.lastFreshCheck ? new Date(monitor.lastFreshCheck).toLocaleString() : '—'}</strong></div><div className={styles.metric}><span>Delivery state</span><strong>{deliveryLabel}</strong></div></div>
    {latestDelivery && <div className={styles.delivery}><strong>Mock delivery recorded.</strong> {latestDelivery.message}</div>}
    {legacyAvailable && <details className={styles.note}><summary>Earlier device history is preserved</summary><p>Earlier local records are kept in their original storage namespace. They are never imported into live monitoring.</p></details>}
    <button className="button small" type="button" disabled={!ready || busy} onClick={() => {
      const blob = new Blob([JSON.stringify({ version: 1, mode: 'rehearsal', network: 'fixture', store }, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = 'buffer-alert-rehearsal.json'; link.click(); window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    }}>Download example history</button>
    {message && <p className={styles.note} role="status" aria-live="polite">{message}</p>}
  </section>;
}
