import Decimal from 'decimal.js';
import type { Snapshot } from './types';
import { isCanonicalProtocol } from './protocols.ts';

// Two 128-character decimal inputs may require 256 significant digits when
// their integer and fractional scales differ. Never round a recovery boundary.
const Exact = Decimal.clone({ precision: 260 });

export const ALERT_STORAGE_VERSION = 1;
export const ALERT_STORAGE_PREFIX = 'buffer.alerts.v1:';
export const ALERT_LEASE_MS = 30_000;
export const ALERT_MAX_INPUT_AGE_MS = 120_000;
export const ALERT_MAX_ATTEMPTS = 3;

export type AlertMetric = 'maintenance_headroom';
export type AlertDirection = 'below' | 'above';
export type AlertEventState = 'queued' | 'claimed' | 'delivered' | 'failed' | 'suppressed';

export interface AlertRule {
  id: string; version: number; ownerId: string; authority: string; subaccountId: number;
  metric: AlertMetric; direction: AlertDirection; threshold: string; cadenceMinutes: number;
  timezone: string; destination: 'mock'; enabled: boolean; createdAt: string; updatedAt: string;
  cooldownMinutes?: number; hysteresis?: string;
}
export interface AlertEvent {
  id: string; key: string; ruleId: string; ruleVersion: number; ownerId: string; state: AlertEventState;
  observedAt: string; value: string; threshold: string; reason: string;
  claimedBy?: string; claimedUntil?: string; deliveredAt?: string;
}
export interface AlertOutboxItem {
  id: string; eventId: string; ownerId: string; state: 'pending' | 'claimed' | 'delivered' | 'failed' | 'suppressed';
  attempts: number; leaseUntil?: string; leaseToken?: string; nextAttemptAt?: string; lastError?: string; deliveredAt?: string;
}
export interface AlertDelivery {
  id: string; eventId: string; ownerId: string; destination: 'mock'; deliveredAt: string; message: string;
}
export interface AlertMonitor {
  ruleId: string; ruleVersion: number; ownerId: string; status: 'ready' | 'breached' | 'unavailable';
  breached: boolean; episode: number; triggeredEpisode: number; lastFreshCheck: string | null;
  inputExpiresAt?: string | null; nextCheckAt: string | null; lastTriggeredAt: string | null; reason: string | null;
}
export interface AlertStore {
  version: 1; rules: AlertRule[]; events: AlertEvent[]; outbox: AlertOutboxItem[]; deliveries: AlertDelivery[];
  monitors: AlertMonitor[]; lastFreshCheck: string | null;
  worker: { running: boolean; lastRunAt: string | null; workerId: string | null };
}
export const emptyAlertStore = (): AlertStore => ({
  version: ALERT_STORAGE_VERSION, rules: [], events: [], outbox: [], deliveries: [], monitors: [], lastFreshCheck: null,
  worker: { running: false, lastRunAt: null, workerId: null },
});
const iso = (value: unknown): value is string => typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
const text = (value: unknown, max = 4096): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const decimal = (value: unknown): value is string => text(value, 128) && /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const uuid = (value: unknown): value is string => text(value, 80) && /^[a-z0-9-]{8,80}$/i.test(value);
const nullableIso = (value: unknown) => value === null || iso(value);
const minutes = (value: unknown): value is number => integer(value) && value >= 1 && value <= 1440;
const timezone = (value: unknown) => { try { return text(value, 80) && !!new Intl.DateTimeFormat('en-US', { timeZone: value }); } catch { return false; } };
function validRule(value: unknown): value is AlertRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Record<string, unknown>;
  return uuid(rule.id) && integer(rule.version) && rule.version > 0 && text(rule.ownerId, 160) && text(rule.authority, 64) &&
    integer(rule.subaccountId) && rule.subaccountId >= 0 && rule.subaccountId <= 65535 && rule.metric === 'maintenance_headroom' &&
    (rule.direction === 'below' || rule.direction === 'above') && decimal(rule.threshold) && minutes(rule.cadenceMinutes) &&
    timezone(rule.timezone) && rule.destination === 'mock' && typeof rule.enabled === 'boolean' && iso(rule.createdAt) && iso(rule.updatedAt) &&
    (rule.cooldownMinutes === undefined || minutes(rule.cooldownMinutes)) &&
    (rule.hysteresis === undefined || (decimal(rule.hysteresis) && new Exact(rule.hysteresis).gte(0)));
}
function validEvent(value: unknown): value is AlertEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return uuid(event.id) && text(event.key, 220) && uuid(event.ruleId) && integer(event.ruleVersion) && event.ruleVersion > 0 &&
    text(event.ownerId, 160) && ['queued', 'claimed', 'delivered', 'failed', 'suppressed'].includes(String(event.state)) &&
    iso(event.observedAt) && decimal(event.value) && decimal(event.threshold) && text(event.reason) &&
    (event.claimedBy === undefined || text(event.claimedBy, 160)) && (event.claimedUntil === undefined || iso(event.claimedUntil)) &&
    (event.deliveredAt === undefined || iso(event.deliveredAt));
}
function validOutbox(value: unknown): value is AlertOutboxItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return uuid(item.id) && uuid(item.eventId) && text(item.ownerId, 160) && ['pending', 'claimed', 'delivered', 'failed', 'suppressed'].includes(String(item.state)) &&
    integer(item.attempts) && item.attempts >= 0 && item.attempts <= 20 && (item.leaseUntil === undefined || iso(item.leaseUntil)) &&
    (item.leaseToken === undefined || uuid(item.leaseToken)) && (item.nextAttemptAt === undefined || iso(item.nextAttemptAt)) &&
    (item.lastError === undefined || text(item.lastError, 512)) && (item.deliveredAt === undefined || iso(item.deliveredAt));
}
function validDelivery(value: unknown): value is AlertDelivery {
  if (!value || typeof value !== 'object') return false;
  const delivery = value as Record<string, unknown>;
  return uuid(delivery.id) && uuid(delivery.eventId) && text(delivery.ownerId, 160) && delivery.destination === 'mock' && iso(delivery.deliveredAt) && text(delivery.message, 4096);
}
function validMonitor(value: unknown): value is AlertMonitor {
  if (!value || typeof value !== 'object') return false;
  const monitor = value as Record<string, unknown>;
  return uuid(monitor.ruleId) && integer(monitor.ruleVersion) && monitor.ruleVersion > 0 && text(monitor.ownerId, 160) &&
    ['ready', 'breached', 'unavailable'].includes(String(monitor.status)) && typeof monitor.breached === 'boolean' &&
    integer(monitor.episode) && monitor.episode >= 0 && integer(monitor.triggeredEpisode) && monitor.triggeredEpisode >= 0 && monitor.triggeredEpisode <= monitor.episode &&
    nullableIso(monitor.lastFreshCheck) && (monitor.inputExpiresAt === undefined || nullableIso(monitor.inputExpiresAt)) && nullableIso(monitor.nextCheckAt) && nullableIso(monitor.lastTriggeredAt) && (monitor.reason === null || text(monitor.reason));
}
/** The worker uses the strict parser: damaged persistence must never silently reset deduplication. */
export function parseAlertStore(raw: string): AlertStore {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid alert store.');
  const store = value as Record<string, unknown>;
  const arrays = [['rules', validRule, 20], ['events', validEvent, 10000], ['outbox', validOutbox, 10000], ['deliveries', validDelivery, 10000]] as const;
  if (store.version !== 1 || !nullableIso(store.lastFreshCheck)) throw new Error('Invalid alert store version or timestamp.');
  for (const [key, validate, limit] of arrays) {
    const list = store[key];
    if (!Array.isArray(list) || list.length > limit || !list.every(validate)) throw new Error(`Invalid or full alert store: ${key}.`);
    if (new Set(list.map(item => item.id)).size !== list.length) throw new Error(`Duplicate ${key} identifiers.`);
  }
  if (store.monitors === undefined) {
    // Legacy cadence events establish an already-triggered episode rather than sending again after an upgrade.
    store.monitors = (store.rules as AlertRule[]).flatMap(rule => {
      const previous = (store.events as AlertEvent[]).filter(event => event.ruleId === rule.id && event.ruleVersion === rule.version && event.ownerId === rule.ownerId).at(-1);
      return previous ? [{ ruleId: rule.id, ruleVersion: rule.version, ownerId: rule.ownerId, status: 'unavailable', breached: true, episode: 1, triggeredEpisode: 1,
        lastFreshCheck: store.lastFreshCheck, nextCheckAt: null, lastTriggeredAt: previous.observedAt, reason: 'Waiting for a fresh check after upgrade.' }] : [];
    });
  }
  if (!Array.isArray(store.monitors) || store.monitors.length > 20 || !store.monitors.every(validMonitor)) throw new Error('Invalid alert monitors.');
  const worker = store.worker as Record<string, unknown> | undefined;
  if (!worker || typeof worker.running !== 'boolean' || !nullableIso(worker.lastRunAt) || !(worker.workerId === null || text(worker.workerId, 160))) throw new Error('Invalid alert worker state.');
  const typed = store as unknown as AlertStore;
  if (new Set(typed.events.map(event => event.key)).size !== typed.events.length || new Set(typed.outbox.map(item => item.eventId)).size !== typed.outbox.length ||
      new Set(typed.deliveries.map(item => item.eventId)).size !== typed.deliveries.length) throw new Error('Duplicate alert event or delivery keys.');
  return typed;
}
export function decodeAlertStore(raw: string | null): AlertStore {
  try { return raw ? parseAlertStore(raw) : emptyAlertStore(); } catch { return emptyAlertStore(); }
}
export function encodeAlertStore(store: AlertStore): string { return JSON.stringify(parseAlertStore(JSON.stringify(store))); }
const copy = (store: AlertStore): AlertStore => structuredClone(store);
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const at = (now: Date) => now.toISOString();

/** A provider observation must itself be fresh; an absent expiry never grants unlimited freshness. */
export function alertInputProblem(snapshot: Snapshot, now = new Date()): string | null {
  if (snapshot.source !== 'live' || snapshot.network !== 'mainnet-beta' || snapshot.protocol?.id !== 'velocity' || !isCanonicalProtocol(snapshot.protocol)) return 'A supported Velocity observation is required.';
  const observed = Date.parse(snapshot.retrievedAt);
  if (!Number.isFinite(observed) || observed > now.getTime() + 5_000 || now.getTime() - observed >= ALERT_MAX_INPUT_AGE_MS ||
      (snapshot.expiresAt !== null && (!iso(snapshot.expiresAt) || Date.parse(snapshot.expiresAt) <= now.getTime()))) return 'The account observation is stale or has an invalid timestamp.';
  const risk = snapshot.risk;
  if (snapshot.inventoryAvailable !== true || !risk || risk.scope !== 'cross-margin' || !['clear', 'maintenance', 'liquidating'].includes(risk.status) ||
      !decimal(risk.maintenanceHeadroom) || !decimal(risk.totalCollateral) || !decimal(risk.maintenanceRequirement) || new Exact(risk.maintenanceRequirement).lt(0) || typeof risk.canBeLiquidated !== 'boolean' ||
      snapshot.positions.some(position => position.isolated !== false || position.oracle.valid !== true || !decimal(position.price) || new Exact(position.price).lte(0))) return 'Complete, available account risk and valid oracle inputs are required.';
  if (new Exact(risk.maintenanceRequirement!).lt(0) || !new Exact(risk.totalCollateral!).minus(risk.maintenanceRequirement!).eq(risk.maintenanceHeadroom!)) return 'Headroom must equal verified collateral minus maintenance requirement.';
  return null;
}
function monitorFor(store: AlertStore, rule: AlertRule): AlertMonitor {
  store.monitors ??= [];
  let monitor = store.monitors.find(item => item.ruleId === rule.id && item.ownerId === rule.ownerId && item.ruleVersion === rule.version);
  if (!monitor) {
    store.monitors = store.monitors.filter(item => item.ruleId !== rule.id || item.ownerId !== rule.ownerId);
    monitor = { ruleId: rule.id, ruleVersion: rule.version, ownerId: rule.ownerId, status: 'unavailable', breached: false, episode: 0, triggeredEpisode: 0, lastFreshCheck: null, nextCheckAt: null, lastTriggeredAt: null, reason: 'Waiting for a fresh check.' };
    store.monitors.push(monitor);
  }
  return monitor;
}
export function evaluateAlerts(input: AlertStore, snapshot: Snapshot, ownerId: string, now = new Date()): AlertStore {
  const store = copy(input);
  const problem = alertInputProblem(snapshot, now);
  for (const rule of store.rules.filter(item => item.ownerId === ownerId && item.enabled && item.authority === snapshot.authority && item.subaccountId === snapshot.subaccount.id)) {
    const monitor = monitorFor(store, rule);
    if (problem) { monitor.status = 'unavailable'; monitor.reason = problem; continue; }
    if (monitor.lastFreshCheck && Date.parse(snapshot.retrievedAt) < Date.parse(monitor.lastFreshCheck)) continue;
    store.lastFreshCheck = snapshot.retrievedAt;
    monitor.lastFreshCheck = snapshot.retrievedAt;
    monitor.inputExpiresAt = new Date(Math.min(Date.parse(snapshot.retrievedAt) + ALERT_MAX_INPUT_AGE_MS, snapshot.expiresAt ? Date.parse(snapshot.expiresAt) : Infinity)).toISOString();
    monitor.status = monitor.breached ? 'breached' : 'ready'; monitor.reason = null;
    if (monitor.nextCheckAt && Date.parse(monitor.nextCheckAt) > now.getTime()) continue;
    monitor.nextCheckAt = new Date(now.getTime() + rule.cadenceMinutes * 60_000).toISOString();
    const value = new Exact(snapshot.risk!.maintenanceHeadroom!);
    const threshold = new Exact(rule.threshold);
    const crossed = rule.direction === 'below' ? value.lte(threshold) : value.gte(threshold);
    const gap = new Exact(rule.hysteresis ?? '10');
    const recovered = rule.direction === 'below' ? value.gt(threshold.plus(gap)) : value.lt(threshold.minus(gap));
    if (monitor.breached && recovered) monitor.breached = false;
    if (!monitor.breached && crossed) { monitor.breached = true; monitor.episode += 1; }
    monitor.status = monitor.breached ? 'breached' : 'ready';
    if (!monitor.breached || monitor.triggeredEpisode === monitor.episode ||
        (monitor.lastTriggeredAt && now.getTime() - Date.parse(monitor.lastTriggeredAt) < (rule.cooldownMinutes ?? rule.cadenceMinutes) * 60_000)) continue;
    const key = `${rule.id}:${rule.version}:episode-${monitor.episode}:${rule.metric}:${rule.direction}`;
    if (store.events.some(event => event.key === key)) { monitor.triggeredEpisode = monitor.episode; continue; }
    const eventId = id('event');
    store.events.push({ id: eventId, key, ruleId: rule.id, ruleVersion: rule.version, ownerId, state: 'queued', observedAt: snapshot.retrievedAt, value: value.toFixed(), threshold: threshold.toFixed(), reason: `${rule.metric} is ${rule.direction} the configured threshold.` });
    store.outbox.push({ id: id('outbox'), eventId, ownerId, state: 'pending', attempts: 0 });
    monitor.triggeredEpisode = monitor.episode; monitor.lastTriggeredAt = at(now);
  }
  return store;
}
/** Explicit fixture entry point; never upgrades an unsupported live account into a valid observation. */
export function evaluateFixtureAlerts(input: AlertStore, snapshot: Snapshot, ownerId: string, now = new Date()): AlertStore {
  if (snapshot.source !== 'sample' || snapshot.network !== 'fixture') throw new Error('An explicit deterministic fixture is required.');
  const store = evaluateAlerts(input, { ...snapshot, source: 'live', network: 'mainnet-beta' }, ownerId, now);
  for (const event of store.events.filter(event => !input.events.some(previous => previous.id === event.id))) event.reason = `Deterministic fixture: ${event.reason}`;
  return store;
}
function invalidateQueued(store: AlertStore, ownerId: string) {
  for (const item of store.outbox.filter(item => item.ownerId === ownerId && !['delivered', 'suppressed'].includes(item.state))) {
    const event = store.events.find(event => event.id === item.eventId && event.ownerId === ownerId);
    const rule = event && store.rules.find(rule => rule.id === event.ruleId && rule.ownerId === ownerId && rule.version === event.ruleVersion && rule.enabled);
    if (rule) continue;
    item.state = 'suppressed'; item.lastError = 'The owning rule was paused, changed, deleted, or is missing.';
    delete item.leaseUntil; delete item.leaseToken;
    if (event) { event.state = 'suppressed'; delete event.claimedUntil; }
  }
}
function freshMonitor(store: AlertStore, event: AlertEvent, now: Date) {
  const monitor = store.monitors?.find(item => item.ruleId === event.ruleId && item.ruleVersion === event.ruleVersion && item.ownerId === event.ownerId);
  return monitor && monitor.status !== 'unavailable' && monitor.inputExpiresAt && Date.parse(monitor.inputExpiresAt) > now.getTime() && monitor.lastFreshCheck && now.getTime() - Date.parse(monitor.lastFreshCheck) < ALERT_MAX_INPUT_AGE_MS && Date.parse(monitor.lastFreshCheck) <= now.getTime() + 5_000;
}
export interface AlertClaim { outboxId: string; leaseToken: string; event: AlertEvent }
/** Call inside a persistence transaction; persist the returned claim before attempting completion. */
export function claimAlertWork(input: AlertStore, ownerId: string, workerId: string, now = new Date()): { store: AlertStore; claim: AlertClaim | null } {
  const store = copy(input);
  invalidateQueued(store, ownerId);
  store.worker = { running: false, lastRunAt: at(now), workerId };
  for (const item of store.outbox.filter(item => item.ownerId === ownerId)) {
    const available = item.state === 'pending' || item.state === 'failed' || (item.state === 'claimed' && (!item.leaseUntil || Date.parse(item.leaseUntil) <= now.getTime()));
    if (!available) continue;
    if (item.attempts >= ALERT_MAX_ATTEMPTS) {
      item.state = 'failed'; item.lastError = 'The local delivery attempt limit was reached.';
      delete item.leaseUntil; delete item.leaseToken;
      const exhausted = store.events.find(event => event.id === item.eventId && event.ownerId === ownerId);
      if (exhausted) { exhausted.state = 'failed'; delete exhausted.claimedUntil; }
      continue;
    }
    if (item.nextAttemptAt && Date.parse(item.nextAttemptAt) > now.getTime()) continue;
    const event = store.events.find(event => event.id === item.eventId && event.ownerId === ownerId);
    if (!event || !freshMonitor(store, event, now)) continue;
    item.state = 'claimed'; item.attempts += 1; item.leaseToken = id('lease'); item.leaseUntil = new Date(now.getTime() + ALERT_LEASE_MS).toISOString();
    event.state = 'claimed'; event.claimedBy = workerId; event.claimedUntil = item.leaseUntil;
    store.worker.running = true;
    return { store, claim: { outboxId: item.id, leaseToken: item.leaseToken, event: structuredClone(event) } };
  }
  return { store, claim: null };
}
/** The local mock sink journal and completion are committed in the same transaction. No external delivery happens here. */
export function finishAlertWork(input: AlertStore, ownerId: string, claim: AlertClaim, accepted: boolean, now = new Date()): AlertStore {
  const store = copy(input);
  invalidateQueued(store, ownerId);
  const item = store.outbox.find(item => item.id === claim.outboxId && item.ownerId === ownerId && item.state === 'claimed' && item.leaseToken === claim.leaseToken);
  if (!item || !item.leaseUntil || Date.parse(item.leaseUntil) <= now.getTime()) return store;
  const event = store.events.find(event => event.id === item.eventId && event.ownerId === ownerId);
  if (!event) return store;
  store.worker.running = false;
  delete item.leaseUntil; delete item.leaseToken; delete event.claimedUntil;
  if (!freshMonitor(store, event, now)) {
    item.state = 'pending'; item.attempts -= 1; event.state = 'queued'; item.lastError = 'Waiting for a fresh supported observation before delivery.'; return store;
  }
  if (!accepted) {
    item.state = 'failed'; event.state = 'failed'; item.lastError = 'The local mock sink rejected this attempt.';
    item.nextAttemptAt = new Date(now.getTime() + 1_000 * 2 ** (item.attempts - 1)).toISOString(); return store;
  }
  item.state = 'delivered'; item.deliveredAt = at(now); delete item.lastError; delete item.nextAttemptAt;
  event.state = 'delivered'; event.deliveredAt = at(now);
  if (!store.deliveries.some(delivery => delivery.eventId === event.id && delivery.ownerId === ownerId)) store.deliveries.push({
    id: id('delivery'), eventId: event.id, ownerId, destination: 'mock', deliveredAt: at(now), message: `Buffer mock alert: ${event.reason} Observed ${event.value}; threshold ${event.threshold}.`,
  });
  return store;
}
export function runAlertWorker(input: AlertStore, ownerId: string, workerId = 'local-mock-worker', now = new Date(), deliver: (event: AlertEvent) => boolean = () => true): AlertStore {
  const { store, claim } = claimAlertWork(input, ownerId, workerId, now);
  if (!claim) return store;
  let accepted = false;
  try { accepted = deliver(claim.event); } catch { /* A rejected local sink is retained for bounded retry. */ }
  return finishAlertWork(store, ownerId, claim, accepted, now);
}
export function deleteAlertRule(input: AlertStore, ruleId: string, ownerId: string): AlertStore {
  const store = copy(input);
  store.rules = store.rules.filter(rule => rule.id !== ruleId || rule.ownerId !== ownerId);
  store.monitors = store.monitors.filter(monitor => monitor.ruleId !== ruleId || monitor.ownerId !== ownerId);
  invalidateQueued(store, ownerId);
  return store;
}
type RuleInput = Pick<AlertRule, 'ownerId' | 'authority' | 'subaccountId' | 'direction' | 'threshold' | 'cadenceMinutes' | 'timezone'> & Partial<Pick<AlertRule, 'cooldownMinutes' | 'hysteresis'>>;
export function createAlertRule(input: RuleInput, now = new Date()): AlertRule {
  const rule: AlertRule = { ...input, id: id('rule'), version: 1, metric: 'maintenance_headroom', destination: 'mock', enabled: true, createdAt: at(now), updatedAt: at(now), cooldownMinutes: input.cooldownMinutes ?? input.cadenceMinutes, hysteresis: input.hysteresis ?? '10' };
  if (!validRule(rule)) throw new Error('Invalid alert rule or timezone.');
  rule.threshold = new Exact(rule.threshold).toFixed();
  return rule;
}
export function updateAlertRule(input: AlertStore, ruleId: string, ownerId: string, patch: Partial<Pick<AlertRule, 'authority' | 'subaccountId' | 'direction' | 'threshold' | 'cadenceMinutes' | 'timezone' | 'enabled' | 'cooldownMinutes' | 'hysteresis'>>, now = new Date()): AlertStore {
  const store = copy(input);
  const index = store.rules.findIndex(rule => rule.id === ruleId && rule.ownerId === ownerId);
  if (index < 0) return store;
  const previous = store.rules[index];
  const next = { ...previous, ...patch, id: previous.id, ownerId, metric: previous.metric, destination: previous.destination, version: previous.version + 1, updatedAt: at(now) };
  if (!validRule(next)) throw new Error('Invalid alert rule or timezone.');
  store.rules[index] = next;
  store.monitors = store.monitors.filter(monitor => monitor.ruleId !== ruleId || monitor.ownerId !== ownerId);
  invalidateQueued(store, ownerId);
  return store;
}
export function pauseAlertRule(input: AlertStore, ruleId: string, ownerId: string, now = new Date()): AlertStore { return updateAlertRule(input, ruleId, ownerId, { enabled: false }, now); }
export function alertStorageKey(ownerId: string) { return `${ALERT_STORAGE_PREFIX}${ownerId}`; }
