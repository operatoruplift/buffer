'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '@/lib/types';
import { ALERT_METRICS, alertInputProblem, alertMetricValue, type AlertMetric } from '@/lib/alerts';
import { estimateLiquidationPrices } from '@/lib/risk/liquidation';
import { formatUtc } from '@/lib/format';
import type { MonitoringOverview, MonitoringRuleInput, MonitoringDeliveryState } from '@/lib/monitoring';
import { requestMonitoring } from '@/lib/monitoring-client';
import Select from './Select';
import styles from './AlertsPanel.module.css';

type Props = { snapshot: Snapshot | null; stale?: boolean; scopeChanged?: boolean; ownerId: string | null; sessionId: string };
// One timestamp format across the app: explicit UTC, never an unlabelled local zone.
const time = formatUtc;
const labels: Record<MonitoringDeliveryState, string> = {
  queued: 'Queued', sending: 'Sending', accepted_by_provider: 'Accepted by Discord', delivered: 'Receipt verified',
  failed: 'Failed', suppressed: 'Suppressed', unknown_outcome: 'Outcome unknown',
};

/** Live monitoring uses authenticated hosted APIs. It never reads rehearsal storage. */
export default function LiveMonitoringPanel({ snapshot, stale = false, scopeChanged = false, ownerId, sessionId }: Props) {
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now);
  const [metric, setMetric] = useState<AlertMetric>('maintenance_headroom');
  const [market, setMarket] = useState('');
  const [threshold, setThreshold] = useState('300');
  const [direction, setDirection] = useState<'below' | 'above'>('below');
  const [cadence, setCadence] = useState('15');
  const [timezone, setTimezone] = useState('UTC');
  const [cooldown, setCooldown] = useState('15');
  const [hysteresis, setHysteresis] = useState('10');
  const [destination, setDestination] = useState('');
  const [managedId, setManagedId] = useState('');
  const pending = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const rule = overview?.rules.find(item => item.id === managedId) ?? overview?.rules.find(item => snapshot?.source === 'live' && snapshot.protocol?.id === 'velocity' &&
    item.authority === snapshot.authority && item.subaccountId === snapshot.subaccount.id);

  const request = useCallback(async (path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown, notice?: string) => {
    const controller = lifetime.current;
    if (!ownerId || !controller || controller.signal.aborted || pending.current) return;
    pending.current = true; setBusy(true); setMessage('');
    try {
      const next = await requestMonitoring(path, method, body, { userId: ownerId, sessionId }, controller.signal);
      if (!controller.signal.aborted) { setOverview(next); setVerified(true); setMessage(notice ?? ''); }
    } catch (error) {
      if (!controller.signal.aborted) { setVerified(false); setMessage(error instanceof Error ? error.message : 'Monitoring could not be verified.'); }
    } finally {
      if (!controller.signal.aborted) { pending.current = false; setBusy(false); }
    }
  }, [ownerId, sessionId]);

  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller; pending.current = false;
    const timer = window.setTimeout(() => { if (ownerId) void request('/api/monitoring', 'GET'); }, 0);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => { controller.abort(); window.clearTimeout(timer); window.clearInterval(clock); };
  }, [ownerId, request]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMetric(rule?.metric ?? 'maintenance_headroom'); setMarket(rule?.market ?? '');
      setThreshold(rule?.threshold ?? (rule?.metric === 'liquidation_distance' ? '5' : '300')); setDirection(rule?.direction ?? 'below'); setCadence(String(rule?.cadenceMinutes ?? 15));
      setTimezone(rule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC');
      setCooldown(String(rule?.cooldownMinutes ?? 15)); setHysteresis(rule?.hysteresis ?? ALERT_METRICS[rule?.metric ?? 'maintenance_headroom'].defaultHysteresis);
      setDestination(rule?.destinationId ?? overview?.destinations.find(item => item.enabled && item.verifiedAt)?.id ?? '');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rule, overview?.destinations]);

  const inputProblem = scopeChanged ? 'Finish selecting and reading the current account.' : !snapshot ? 'Read a Velocity account to configure monitoring.'
    : stale ? 'Refresh the selected account before configuring a rule.' : alertInputProblem(snapshot);
  const eligibleDestination = overview?.destinations.find(item => item.id === destination && item.enabled && item.verifiedAt);
  const unit = ALERT_METRICS[metric].unit;
  // Markets with a current liquidation estimate for this observation; the saved rule keeps its own market.
  const markets = snapshot && !inputProblem ? estimateLiquidationPrices(snapshot).estimates.filter(item => item.distancePercent !== null).map(item => item.market) : [];
  const metricProblem = rule || metric !== 'liquidation_distance' || !snapshot || inputProblem ? null
    : !market ? 'Choose one perpetual market with a current liquidation estimate.' : (() => { const observed = alertMetricValue({ metric, market }, snapshot); return 'problem' in observed ? observed.problem : null; })();
  const ready = verified && overview?.capability.configured && Boolean(eligibleDestination) && !busy;
  const unitFor = (ruleId: string | null) => overview?.rules.find(item => item.id === ruleId)?.unit ?? '';
  // Webhook destinations have no message read-back: their 2xx acknowledgement is the receipt.
  const viaWebhook = (ruleId: string | null) => overview?.destinations.find(item => item.id === overview.rules.find(rule => rule.id === ruleId)?.destinationId)?.provider === 'webhook';
  const stateLabel = (event: { state: MonitoringDeliveryState; ruleId: string | null }) => event.state === 'delivered' && viaWebhook(event.ruleId) ? 'Acknowledged by webhook' : labels[event.state];
  const events = overview?.events.filter(item => !rule || item.ruleId === rule.id) ?? [];
  const latest = events[0];
  const heartbeatAge = overview?.heartbeat.lastRunAt ? now - Date.parse(overview.heartbeat.lastRunAt) : Infinity;
  const workerHealthy = verified && overview?.heartbeat.status === 'healthy' && heartbeatAge >= -5000 && heartbeatAge < 180_000;
  const scope = rule ? `Saved Velocity rule · ${rule.authority.slice(0, 5)}…${rule.authority.slice(-5)} · subaccount ${rule.subaccountId}` : snapshot?.source === 'live' && snapshot.protocol?.id === 'velocity' && snapshot.authority
    ? `Velocity · ${snapshot.authority.slice(0, 5)}…${snapshot.authority.slice(-5)} · subaccount ${snapshot.subaccount.id}` : 'Velocity account monitoring';
  const status = !ownerId ? 'Sign in to save' : !verified ? (busy ? 'Checking configuration' : 'Unavailable')
    : !overview?.capability.configured ? 'Awaiting activation' : !rule ? 'Not configured' : !rule.enabled ? 'Paused'
      : rule.monitoringState === 'unavailable' ? 'Input unavailable' : workerHealthy ? 'Checks active' : 'Awaiting worker';

  function save() {
    if (!ready) return;
    const config = { direction, threshold, cadenceMinutes: Number(cadence), timezone,
      cooldownMinutes: Number(cooldown), hysteresis, destinationId: destination, enabled: rule?.enabled ?? true };
    if (!rule && metricProblem) return;
    if (rule) {
      void request(`/api/monitoring/rules/${rule.id}`, 'PATCH', config, 'Rule updated. Earlier pending work has been invalidated.');
    } else if (snapshot?.authority && !inputProblem && snapshot.source === 'live') {
      const input: MonitoringRuleInput = { authority: snapshot.authority, subaccountId: snapshot.subaccount.id, ...config, metric, ...(metric === 'liquidation_distance' ? { market } : {}) };
      void request('/api/monitoring/rules', 'POST', input, 'Rule saved. Delivery status appears only after a real event.');
    }
  }

  return <section className={`surface ${styles.panel}`} aria-labelledby="alerts-heading">
    <div className={styles.heading}><div><div className={styles.eyebrow}>LIVE MONITORING</div><h2 id="alerts-heading">Know when margin risk changes.</h2><p>{scope}</p></div><span className={styles.state}>{status}</span></div>
    <p className={styles.note}>Monitor observed maintenance headroom in USD, or the unsigned distance from the current oracle price to one position’s estimated liquidation price in percent (model cross-margin-hold-others-v1). These checks use fresh account data, independently of the price-shock calculator.</p>
    {inputProblem && <p className={styles.note} role="status">{rule ? 'Current page observation unavailable' : 'Monitoring unavailable'}: {inputProblem} {rule && 'You can still manage this saved rule independently.'}</p>}
    {!ownerId ? <p className={styles.note}><a href="/auth">Sign in</a> to save a monitoring rule and use a verified Discord or signed webhook destination. Account lookup and the calculator stay available without signing in.</p> : <>
      {overview && <p className={styles.note}>{overview.capability.message} {!overview.capability.sendEnabled && 'Outbound sends are disabled. Checks cannot deliver a notification until sending is activated.'}</p>}
      {Boolean(overview?.rules.length) && <div className={`${styles.field} ${styles.savedRules}`}><label htmlFor="saved-live-rule">Saved live rule</label><Select id="saved-live-rule" label="Saved live rule" value={rule?.id ?? ''} placeholder="Choose a saved rule to manage" options={(overview?.rules ?? []).map(item => ({ value: item.id, label: `${item.authority.slice(0, 5)}…${item.authority.slice(-5)} · #${item.subaccountId} · ${item.enabled ? 'Enabled' : 'Paused'}`, description: `${ALERT_METRICS[item.metric].label}${item.market ? ` ${item.market}` : ''} ${item.direction} ${item.threshold} ${item.unit}` }))} onChange={setManagedId} /></div>}
      <div className={styles.form}>
        <div className={styles.field}><label htmlFor="live-alert-metric">Metric</label><Select id="live-alert-metric" label="Metric" value={metric} disabled={Boolean(rule)} options={[{ value: 'maintenance_headroom', label: 'Maintenance headroom (USD)', description: 'Observed collateral minus maintenance requirement.' }, { value: 'liquidation_distance', label: 'Liquidation distance (%)', description: 'Unsigned move from the current oracle to one position’s estimated boundary.' }]} onChange={value => { const next = value as AlertMetric; setMetric(next); setHysteresis(ALERT_METRICS[next].defaultHysteresis); setThreshold(next === 'liquidation_distance' ? '5' : '300'); }} /></div>
        {metric === 'liquidation_distance' && <div className={styles.field}><label htmlFor="live-alert-market">Perpetual market</label><Select id="live-alert-market" label="Perpetual market" value={market} disabled={Boolean(rule)} placeholder={rule ? rule.market ?? '' : markets.length ? 'Choose a market' : 'No current liquidation estimate'} options={(rule?.market ? [rule.market] : markets).map(item => ({ value: item, label: item }))} onChange={setMarket} /></div>}
        <div className={styles.field}><label htmlFor="live-alert-threshold">{metric === 'liquidation_distance' ? 'Distance threshold (%)' : 'Headroom threshold (USD)'}</label><input id="live-alert-threshold" inputMode="decimal" value={threshold} onChange={event => setThreshold(event.target.value)} /></div>
        <div className={styles.field}><label htmlFor="live-alert-direction">Trigger</label><Select id="live-alert-direction" label="Trigger" value={direction} options={[{ value: 'below', label: 'At or below' }, { value: 'above', label: 'At or above' }]} onChange={value => setDirection(value as 'below' | 'above')} /></div>
        <div className={styles.field}><label htmlFor="live-alert-cadence">Minimum check interval (minutes)</label><input id="live-alert-cadence" type="number" min="1" max="1440" step="1" value={cadence} onChange={event => setCadence(event.target.value)} /></div>
        <div className={styles.field}><label htmlFor="live-alert-timezone">Timezone</label><input id="live-alert-timezone" maxLength={80} value={timezone} onChange={event => setTimezone(event.target.value)} /></div>
        <div className={styles.field}><label htmlFor="live-alert-cooldown">Cooldown (minutes)</label><input id="live-alert-cooldown" type="number" min="1" max="1440" step="1" value={cooldown} onChange={event => setCooldown(event.target.value)} /></div>
        <div className={styles.field}><label htmlFor="live-alert-hysteresis">Recovery distance ({unit})</label><input id="live-alert-hysteresis" inputMode="decimal" value={hysteresis} onChange={event => setHysteresis(event.target.value)} /></div>
        <div className={styles.field}><label htmlFor="live-alert-destination">Destination</label><Select id="live-alert-destination" label="Destination" value={destination} placeholder="No verified destination" options={(overview?.destinations ?? []).filter(item => item.enabled && item.verifiedAt).map(item => ({ value: item.id, label: `${item.provider === 'webhook' ? 'Webhook' : 'Discord'} · ${item.label} · ${item.maskedDestination}` }))} onChange={setDestination} /></div>
        {metricProblem && <p className={styles.note} role="status">{metricProblem}</p>}
        <button type="button" className="button primary" disabled={!ready || !rule && Boolean(inputProblem || metricProblem)} onClick={save}>{rule ? 'Update live rule' : 'Configure live rule'}</button>
      </div>
      {rule && <div className={styles.rule}><div><strong>{ALERT_METRICS[rule.metric].label}{rule.market ? ` ${rule.market}` : ''} {rule.direction} {rule.threshold} {rule.unit}</strong><small>{rule.enabled ? 'Configured' : 'Paused'} · {rule.cadenceMinutes} min · {rule.timezone} · version {rule.version}</small></div><div className={styles['rule-actions']}>
        <button type="button" className="button small" disabled={busy || !verified || !rule.enabled || scopeChanged && !managedId} onClick={() => void request(`/api/monitoring/rules/${rule.id}/check`, 'POST', undefined, 'Fresh-check request completed. See the observation and delivery status below.')}>Run fresh check</button>
        <button type="button" className="button small" disabled={busy || !verified} onClick={() => void request(`/api/monitoring/rules/${rule.id}`, 'PATCH', { enabled: !rule.enabled }, rule.enabled ? 'Rule paused. Pending work has been cancelled.' : 'Rule resumed. A new observation is required.')}>{rule.enabled ? 'Pause' : 'Resume'}</button>
        <button type="button" className="button small" disabled={busy || !verified} onClick={() => void request(`/api/monitoring/rules/${rule.id}`, 'DELETE', undefined, 'Rule deleted. Delivery history is retained for audit.')}>Delete</button>
      </div></div>}
      <div className={styles.metrics}>
        <div className={styles.metric}><span>Hosted worker</span><strong>{!verified ? 'Unverified' : workerHealthy ? `Running · ${overview?.heartbeat.mode === 'send' ? 'sending enabled' : 'sends disabled'}` : overview?.heartbeat.status === 'awaiting_activation' ? 'Awaiting activation' : 'Unavailable'}</strong><small>Last run: {time(overview?.heartbeat.lastRunAt ?? null)}<br />Completed: {time(overview?.heartbeat.lastCompletedAt ?? null)}</small></div>
        <div className={styles.metric}><span>Account observation</span><strong>{time(rule?.lastFreshCheck ?? null)}</strong><small>Last attempt: {time(rule?.lastAttemptAt ?? null)}<br />Next check: {time(rule?.nextCheckAt ?? null)}</small></div>
        <div className={styles.metric}><span>Latest delivery</span><strong>{latest ? stateLabel(latest) : 'No event yet'}</strong><small>{latest?.deliveredAt ? `Receipt: ${time(latest.deliveredAt)}` : latest?.acceptedAt ? `Accepted: ${time(latest.acceptedAt)}` : 'A saved rule is not a delivery receipt.'}</small></div>
      </div>
      {rule?.lastError && <p className={styles.note} role="status">Latest check: {rule.lastError}</p>}
      {events.length > 0 && <details className={styles.history}><summary>Delivery history ({events.length})</summary>{events.map(event => <article key={event.id} className={styles.delivery}>
        <strong>{stateLabel(event)}</strong> · {time(event.observedAt)}<p>{event.value} {unitFor(event.ruleId)} observed · threshold {event.threshold} {unitFor(event.ruleId)} · rule version {event.ruleVersion}</p><p>{event.reason}</p>
        {event.state === 'unknown_outcome' && <p>{viaWebhook(event.ruleId) ? 'The webhook may have received this message.' : 'Discord may have accepted this message.'} It will not be posted again automatically.</p>}
        {event.lastError && <p>{event.lastError}</p>}{event.messageId && <p>{viaWebhook(event.ruleId) ? 'Webhook receipt' : 'Discord message'}: {event.messageId}</p>}
        {event.preview && <details><summary>Message preview</summary><pre>{event.preview}</pre></details>}
      </article>)}</details>}
      <div className={styles['rule-actions']}><button type="button" className="button small" disabled={busy} onClick={() => void request('/api/monitoring', 'GET')}>{busy ? 'Checking…' : 'Refresh monitoring status'}</button></div>
      {message && <p className={styles.note} role="status" aria-live="polite">{message}</p>}
    </>}
  </section>;
}
