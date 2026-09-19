'use client';

import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '@/lib/types';
import { PROTOCOLS } from '@/lib/protocols';
import { getSupabase } from '@/lib/supabase';
import { persistedAuthSession } from '@/lib/auth-storage';
import {
  alertInputProblem, alertStorageKey, createAlertRule, parseAlertStore, deleteAlertRule,
  emptyAlertStore, encodeAlertStore, evaluateAlerts, evaluateFixtureAlerts,
  pauseAlertRule, runAlertWorker, updateAlertRule, type AlertStore,
} from '@/lib/alerts';
import Select from './Select';
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

type Props = { snapshot: Snapshot | null; stale?: boolean };

export default function AlertsPanel(props: Props) {
  const [identity, setIdentity] = useState<{ ownerId: string; session: string } | null>(null);
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
  const scope = `${props.snapshot?.source}:${props.snapshot?.protocol?.id}:${props.snapshot?.authority}:${props.snapshot?.subaccount.id}:${props.snapshot?.retrievedAt}:${props.stale}`;
  return identity
    ? <OwnerAlerts key={`${identity.ownerId}:${identity.session}:${scope}`} {...props} ownerId={identity.ownerId} sessionId={identity.session} />
    : <section className={`surface ${styles.panel}`} aria-busy="true"><h2>Know when headroom changes.</h2><p>Loading device settings…</p></section>;
}

function OwnerAlerts({ snapshot, stale = false, ownerId, sessionId }: Props & { ownerId: string; sessionId: string }) {
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
  const key = alertStorageKey(ownerId);

  useEffect(() => {
    active.current = true;
    function load() {
      try { const raw = localStorage.getItem(key); setStore(raw === null ? emptyAlertStore() : parseAlertStore(raw)); setReady(true); }
      catch { setStore(emptyAlertStore()); setMessage('Device settings could not be read. Stored data is preserved; restore a valid backup before making changes.'); setReady(false); }
    }
    const timer = window.setTimeout(load, 0);
    const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) load(); };
    window.addEventListener('storage', changed);
    return () => { active.current = false; window.clearTimeout(timer); window.removeEventListener('storage', changed); };
  }, [key]);

  const fixture = snapshot?.source === 'sample';
  const authority = fixture ? FIXTURE_AUTHORITY : snapshot?.authority;
  const subaccountId = fixture ? 0 : snapshot?.subaccount.id;
  const rule = store.rules.find(item => item.ownerId === ownerId && item.authority === authority && item.subaccountId === subaccountId);
  const scopeKey = `${authority}:${subaccountId}:${fixture}`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setThreshold(rule?.threshold ?? '300'); setDirection(rule?.direction ?? 'below');
      setCadence(String(rule?.cadenceMinutes ?? 15)); setTimezone(rule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC');
      setCooldown(String(rule?.cooldownMinutes ?? 15)); setHysteresis(rule?.hysteresis ?? '10');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rule?.id, rule?.version, rule?.threshold, rule?.direction, rule?.cadenceMinutes, rule?.timezone, rule?.cooldownMinutes, rule?.hysteresis, scopeKey]);

  const inputProblem = stale ? 'Refresh the selected account before checking its threshold.'
    : fixture ? null : snapshot ? alertInputProblem(snapshot) : 'Select a fresh Velocity account to configure a rule.';
  const latestEvent = store.events.filter(event => event.ownerId === ownerId && event.ruleId === rule?.id).at(-1);
  const latestDelivery = store.deliveries.find(item => item.ownerId === ownerId && item.eventId === latestEvent?.id);
  const monitor = store.monitors.find(item => item.ruleId === rule?.id);
  const deliveryLabel = latestEvent?.state === 'delivered' ? 'Delivered' : latestEvent?.state === 'suppressed' ? 'Cancelled' : latestEvent?.state === 'failed' ? 'Retry pending' : latestEvent ? 'Pending' : 'No event yet';
  const scopeLabel = fixture ? 'Deterministic local fixture · 250 USD headroom · subaccount 0'
    : snapshot?.protocol?.id === 'velocity' && authority ? `Velocity · ${authority.slice(0, 5)}…${authority.slice(-5)} · subaccount ${subaccountId}`
      : 'Velocity account required';

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
    if (!authority || subaccountId === undefined || inputProblem) return;
    void mutate(current => {
      const existing = current.rules.find(item => item.ownerId === ownerId && item.authority === authority && item.subaccountId === subaccountId);
      const config = { direction, threshold, cadenceMinutes: Number(cadence), timezone, cooldownMinutes: Number(cooldown), hysteresis, enabled: true };
      const next = existing ? updateAlertRule(current, existing.id, ownerId, config)
        : { ...current, rules: [...current.rules, createAlertRule({ ownerId, authority, subaccountId, ...config })] };
      return { next, notice: fixture ? 'Local fixture rule configured on this device.' : 'Device rule configured for the selected Velocity account.' };
    });
  }

  function run() {
    if (!rule || inputProblem) return;
    void mutate(current => {
      // Freshness is checked again after waiting for the cross-tab lock.
      const observed = fixture ? fixtureSnapshot() : snapshot;
      const problem = !observed ? 'No current snapshot.' : fixture ? null : alertInputProblem(observed);
      if (problem) throw new Error(problem);
      const evaluated = fixture ? evaluateFixtureAlerts(current, observed!, ownerId) : evaluateAlerts(current, observed!, ownerId);
      const next = runAlertWorker(evaluated, ownerId, 'device-mock-worker');
      return { next, notice: next.deliveries.length > current.deliveries.length
        ? `${fixture ? 'Fixture' : 'Observed headroom'} crossed the threshold; mock delivery recorded.`
        : 'Check completed. No new delivery; cadence, cooldown and recovery rules apply.' };
    });
  }

  return <section className={`surface ${styles.panel}`} aria-labelledby="alerts-heading">
    <div className={styles.heading}>
      <div><div className={styles.eyebrow}>LOCAL THRESHOLD MONITOR</div><h2 id="alerts-heading">Know when headroom changes.</h2><p>{scopeLabel}</p></div>
      <span className={`${styles.state} ${latestDelivery ? styles.delivered : latestEvent ? styles.pending : ''}`}>{!rule ? 'Not configured' : !rule.enabled ? 'Paused' : latestDelivery ? 'Delivered · mock sink' : latestEvent ? deliveryLabel : 'Configured'}</span>
    </div>
    <p className={styles.note}>{fixture ? 'Run a clearly labeled fixture to try threshold alerts. No live account is read.' : 'Checks use the current account observation. Refresh the account to fetch a new observation.'} Settings stay on this device. Checks run only when requested here; background scheduling and external delivery are not enabled.</p>
    {inputProblem && <p className={styles.note} role="status">Monitoring unavailable: {inputProblem}</p>}
    <div className={styles.form}>
      <div className={styles.field}><label htmlFor="alert-threshold">Headroom threshold (USD)</label><input id="alert-threshold" inputMode="decimal" value={threshold} onChange={event => setThreshold(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="alert-direction">Trigger</label><Select id="alert-direction" label="Trigger" value={direction} options={[{ value: 'below', label: 'At or below' }, { value: 'above', label: 'At or above' }]} onChange={value => setDirection(value as 'below' | 'above')} /></div>
      <div className={styles.field}><label htmlFor="alert-cadence">Minimum check interval (minutes)</label><input id="alert-cadence" type="number" min="1" max="1440" step="1" value={cadence} onChange={event => setCadence(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="alert-timezone">Timezone</label><input id="alert-timezone" value={timezone} onChange={event => setTimezone(event.target.value)} maxLength={80} /></div>
      <div className={styles.field}><label htmlFor="alert-cooldown">Cooldown (minutes)</label><input id="alert-cooldown" type="number" min="1" max="1440" step="1" value={cooldown} onChange={event => setCooldown(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="alert-hysteresis">Recovery distance (USD)</label><input id="alert-hysteresis" inputMode="decimal" value={hysteresis} onChange={event => setHysteresis(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="alert-destination">Destination</label><input id="alert-destination" value="Local mock sink" readOnly /></div>
      <button className="button primary" type="button" disabled={busy || !ready || Boolean(inputProblem)} onClick={saveRule}>{rule ? 'Update rule' : 'Configure rule'}</button>
    </div>
    {rule && <div className={styles.rule}><div><strong>Maintenance headroom {rule.direction} {rule.threshold} USD</strong><small>{rule.enabled ? 'Configured · manual checks' : 'Paused'} · {rule.cadenceMinutes} min · {rule.timezone}</small></div><div className={styles['rule-actions']}><button className="button small" type="button" disabled={busy || !rule.enabled || Boolean(inputProblem)} onClick={run}>{fixture ? 'Run fixture check' : 'Check current snapshot'}</button><button className="button small" type="button" disabled={busy || !rule.enabled} onClick={() => void mutate(current => ({ next: pauseAlertRule(current, rule.id, ownerId), notice: 'Monitoring paused. Pending deliveries cancelled.' }))}>Pause</button><button className="button small" type="button" disabled={busy} onClick={() => void mutate(current => ({ next: deleteAlertRule(current, rule.id, ownerId), notice: 'Rule deleted. Delivery history retained; pending work cancelled.' }))}>Delete</button></div></div>}
    <div className={styles.metrics}><div className={styles.metric}><span>Worker status</span><strong>{busy ? 'Checking now' : 'Idle · manual checks'}</strong></div><div className={styles.metric}><span>{fixture ? 'Last fixture check' : 'Last fresh observation'}</span><strong>{monitor?.lastFreshCheck ? new Date(monitor.lastFreshCheck).toLocaleString() : '—'}</strong></div><div className={styles.metric}><span>Delivery state</span><strong>{deliveryLabel}</strong></div></div>
    {latestDelivery && <div className={styles.delivery}><strong>Mock delivery recorded.</strong> {latestDelivery.message}</div>}
    {message && <p className={styles.note} role="status" aria-live="polite">{message}</p>}
  </section>;
}
