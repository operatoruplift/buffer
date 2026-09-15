import Decimal from 'decimal.js';
import type { Snapshot } from './types';

export const ALERT_STORAGE_VERSION = 1;
export const ALERT_STORAGE_PREFIX = 'buffer.alerts.v1:';
export const ALERT_LEASE_MS = 30_000;

export type AlertMetric = 'maintenance_headroom';
export type AlertDirection = 'below' | 'above';
export type AlertEventState = 'queued' | 'claimed' | 'delivered' | 'failed' | 'suppressed';

export interface AlertRule {
  id: string;
  version: number;
  ownerId: string;
  authority: string;
  subaccountId: number;
  metric: AlertMetric;
  direction: AlertDirection;
  threshold: string;
  cadenceMinutes: number;
  timezone: string;
  destination: 'mock';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent {
  id: string;
  key: string;
  ruleId: string;
  ruleVersion: number;
  ownerId: string;
  state: AlertEventState;
  observedAt: string;
  value: string;
  threshold: string;
  reason: string;
  claimedBy?: string;
  claimedUntil?: string;
  deliveredAt?: string;
}

export interface AlertOutboxItem {
  id: string;
  eventId: string;
  ownerId: string;
  state: 'pending' | 'claimed' | 'delivered' | 'failed';
  attempts: number;
  leaseUntil?: string;
  lastError?: string;
  deliveredAt?: string;
}

export interface AlertDelivery {
  id: string;
  eventId: string;
  ownerId: string;
  destination: 'mock';
  deliveredAt: string;
  message: string;
}

export interface AlertStore {
  version: 1;
  rules: AlertRule[];
  events: AlertEvent[];
  outbox: AlertOutboxItem[];
  deliveries: AlertDelivery[];
  lastFreshCheck: string | null;
  worker: { running: boolean; lastRunAt: string | null; workerId: string | null };
}

export const emptyAlertStore = (): AlertStore => ({
  version: ALERT_STORAGE_VERSION,
  rules: [], events: [], outbox: [], deliveries: [], lastFreshCheck: null,
  worker: { running: false, lastRunAt: null, workerId: null },
});

const iso = (value: unknown): value is string => typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
const text = (value: unknown, max = 4096): value is string => typeof value === 'string' && value.length <= max;
const decimal = (value: unknown): value is string => text(value, 128) && /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value);
const finiteInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const uuid = (value: unknown): value is string => text(value, 80) && /^[a-z0-9-]{8,80}$/i.test(value);

function validRule(value: unknown): value is AlertRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Record<string, unknown>;
  return uuid(rule.id) && finiteInteger(rule.version) && rule.version > 0 && text(rule.ownerId, 160) && text(rule.authority, 64) &&
    finiteInteger(rule.subaccountId) && rule.subaccountId >= 0 && rule.subaccountId <= 65535 && rule.metric === 'maintenance_headroom' &&
    (rule.direction === 'below' || rule.direction === 'above') && decimal(rule.threshold) && finiteInteger(rule.cadenceMinutes) &&
    rule.cadenceMinutes >= 1 && rule.cadenceMinutes <= 1440 && text(rule.timezone, 80) && rule.destination === 'mock' &&
    typeof rule.enabled === 'boolean' && iso(rule.createdAt) && iso(rule.updatedAt);
}

function validEvent(value: unknown): value is AlertEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return uuid(event.id) && text(event.key, 220) && uuid(event.ruleId) && finiteInteger(event.ruleVersion) && event.ruleVersion > 0 &&
    text(event.ownerId, 160) && ['queued', 'claimed', 'delivered', 'failed', 'suppressed'].includes(String(event.state)) &&
    iso(event.observedAt) && decimal(event.value) && decimal(event.threshold) && text(event.reason) &&
    (event.claimedBy === undefined || text(event.claimedBy, 160)) && (event.claimedUntil === undefined || iso(event.claimedUntil)) &&
    (event.deliveredAt === undefined || iso(event.deliveredAt));
}

function validOutbox(value: unknown): value is AlertOutboxItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return uuid(item.id) && uuid(item.eventId) && text(item.ownerId, 160) && ['pending', 'claimed', 'delivered', 'failed'].includes(String(item.state)) &&
    finiteInteger(item.attempts) && item.attempts >= 0 && item.attempts <= 20 && (item.leaseUntil === undefined || iso(item.leaseUntil)) &&
    (item.lastError === undefined || text(item.lastError, 512)) && (item.deliveredAt === undefined || iso(item.deliveredAt));
}

function validDelivery(value: unknown): value is AlertDelivery {
  if (!value || typeof value !== 'object') return false;
  const delivery = value as Record<string, unknown>;
  return uuid(delivery.id) && uuid(delivery.eventId) && text(delivery.ownerId, 160) && delivery.destination === 'mock' && iso(delivery.deliveredAt) && text(delivery.message, 4096);
}

export function decodeAlertStore(raw: string | null): AlertStore {
  if (!raw) return emptyAlertStore();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return emptyAlertStore();
    const store = value as Record<string, unknown>;
    if (store.version !== ALERT_STORAGE_VERSION || !Array.isArray(store.rules) || !store.rules.every(validRule) || store.rules.length > 20 ||
        !Array.isArray(store.events) || !store.events.every(validEvent) || store.events.length > 100 ||
        !Array.isArray(store.outbox) || !store.outbox.every(validOutbox) || store.outbox.length > 100 ||
        !Array.isArray(store.deliveries) || !store.deliveries.every(validDelivery) || store.deliveries.length > 100 ||
        !(store.lastFreshCheck === null || iso(store.lastFreshCheck))) return emptyAlertStore();
    const worker = store.worker;
    if (!worker || typeof worker !== 'object') return emptyAlertStore();
    const workerValue = worker as Record<string, unknown>;
    if (typeof workerValue.running !== 'boolean' || !(workerValue.lastRunAt === null || iso(workerValue.lastRunAt)) || !(workerValue.workerId === null || text(workerValue.workerId, 160))) return emptyAlertStore();
    return {
      version: 1,
      rules: store.rules as AlertRule[], events: store.events as AlertEvent[], outbox: store.outbox as AlertOutboxItem[], deliveries: store.deliveries as AlertDelivery[],
      lastFreshCheck: store.lastFreshCheck as string | null,
      worker: { running: workerValue.running, lastRunAt: workerValue.lastRunAt as string | null, workerId: workerValue.workerId as string | null },
    };
  } catch { return emptyAlertStore(); }
}

export function encodeAlertStore(store: AlertStore): string {
  return JSON.stringify(decodeAlertStore(JSON.stringify(store)));
}

function nowIso(now: Date) { return now.toISOString(); }
function id(prefix: string, now: Date) { return `${prefix}-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`; }
function matches(rule: AlertRule, snapshot: Snapshot, ownerId: string) {
  return rule.ownerId === ownerId && rule.enabled && rule.authority === snapshot.authority && rule.subaccountId === snapshot.subaccount.id &&
    snapshot.source === 'live' && snapshot.protocol?.id === 'velocity' && snapshot.risk?.maintenanceHeadroom !== null && snapshot.risk?.maintenanceHeadroom !== undefined;
}

export function evaluateAlerts(input: AlertStore, snapshot: Snapshot, ownerId: string, now = new Date()): AlertStore {
  const store: AlertStore = JSON.parse(JSON.stringify(input));
  if (snapshot.source !== 'live' || snapshot.protocol?.id !== 'velocity' || (snapshot.expiresAt !== null && Date.parse(snapshot.expiresAt) < now.getTime()) || !snapshot.risk || snapshot.risk.maintenanceHeadroom === null) return store;
  store.lastFreshCheck = nowIso(now);
  const value = new Decimal(snapshot.risk.maintenanceHeadroom);
  for (const rule of store.rules.filter(item => matches(item, snapshot, ownerId))) {
    const threshold = new Decimal(rule.threshold);
    const crossed = rule.direction === 'below' ? value.lte(threshold) : value.gte(threshold);
    if (!crossed) continue;
    const bucket = Math.floor(now.getTime() / (rule.cadenceMinutes * 60_000));
    const key = `${rule.id}:${rule.version}:${bucket}:${rule.metric}:${rule.direction}`;
    if (store.events.some(event => event.key === key)) continue;
    const eventId = id('event', now);
    store.events.push({ id: eventId, key, ruleId: rule.id, ruleVersion: rule.version, ownerId, state: 'queued', observedAt: nowIso(now), value: value.toFixed(), threshold: threshold.toFixed(), reason: `${rule.metric} is ${rule.direction} the configured threshold.`, });
    store.outbox.push({ id: id('outbox', now), eventId, ownerId, state: 'pending', attempts: 0 });
  }
  return store;
}

export function runAlertWorker(input: AlertStore, ownerId: string, workerId = 'local-mock-worker', now = new Date(), deliver: (event: AlertEvent) => boolean = () => true): AlertStore {
  const store: AlertStore = JSON.parse(JSON.stringify(input));
  store.worker = { running: true, lastRunAt: nowIso(now), workerId };
  const claim = store.outbox.find(item => item.ownerId === ownerId && (item.state === 'pending' || (item.state === 'failed' && item.attempts < 3) || (item.state === 'claimed' && (!item.leaseUntil || Date.parse(item.leaseUntil) <= now.getTime()))));
  if (!claim) return store;
  claim.state = 'claimed'; claim.attempts += 1; claim.leaseUntil = new Date(now.getTime() + ALERT_LEASE_MS).toISOString();
  const event = store.events.find(item => item.id === claim.eventId && item.ownerId === ownerId);
  if (!event) { claim.state = 'failed'; claim.lastError = 'Event was missing for the outbox item.'; delete claim.leaseUntil; return store; }
  if (!deliver(event)) { claim.state = 'failed'; claim.lastError = 'The local mock sink rejected this attempt.'; event.state = 'failed'; delete claim.leaseUntil; return store; }
  const deliveredAt = nowIso(now);
  claim.state = 'delivered'; claim.deliveredAt = deliveredAt; delete claim.leaseUntil;
  event.state = 'delivered'; event.deliveredAt = deliveredAt; event.claimedBy = workerId; delete event.claimedUntil;
  if (!store.deliveries.some(delivery => delivery.eventId === event.id && delivery.ownerId === ownerId)) {
    store.deliveries.push({ id: id('delivery', now), eventId: event.id, ownerId, destination: 'mock', deliveredAt, message: `Buffer mock alert: ${event.reason} Observed ${event.value}; threshold ${event.threshold}.`, });
  }
  return store;
}

export function deleteAlertRule(input: AlertStore, ruleId: string, ownerId: string): AlertStore {
  const store: AlertStore = JSON.parse(JSON.stringify(input));
  const rule = store.rules.find(item => item.id === ruleId && item.ownerId === ownerId);
  if (!rule) return store;
  store.rules = store.rules.filter(item => item.id !== ruleId || item.ownerId !== ownerId);
  const eventIds = new Set(store.events.filter(event => event.ruleId === ruleId && event.ownerId === ownerId && event.state !== 'delivered').map(event => event.id));
  store.events = store.events.filter(event => !eventIds.has(event.id));
  store.outbox = store.outbox.filter(item => !eventIds.has(item.eventId));
  return store;
}

export function createAlertRule(input: Pick<AlertRule, 'ownerId' | 'authority' | 'subaccountId' | 'direction' | 'threshold' | 'cadenceMinutes' | 'timezone'>, now = new Date()): AlertRule {
  if (!text(input.ownerId, 160) || !text(input.authority, 64) || !finiteInteger(input.subaccountId) || input.subaccountId < 0 || input.subaccountId > 65535 ||
      (input.direction !== 'below' && input.direction !== 'above') || !decimal(input.threshold) || input.cadenceMinutes < 1 || input.cadenceMinutes > 1440) throw new Error('Invalid alert rule.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }); } catch { throw new Error('Choose a valid timezone.'); }
  const stamp = nowIso(now);
  return { id: id('rule', now), version: 1, ownerId: input.ownerId, authority: input.authority, subaccountId: input.subaccountId, metric: 'maintenance_headroom', direction: input.direction, threshold: new Decimal(input.threshold).toFixed(), cadenceMinutes: input.cadenceMinutes, timezone: input.timezone, destination: 'mock', enabled: true, createdAt: stamp, updatedAt: stamp };
}

export function alertStorageKey(ownerId: string) { return `${ALERT_STORAGE_PREFIX}${ownerId}`; }
