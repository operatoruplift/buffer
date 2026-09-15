#!/usr/bin/env node
/**
 * Deterministic local worker for the verified alert wedge.
 * It proves rule -> event -> outbox -> lease -> mock delivery without
 * contacting a provider or external destination. Hosted deployment needs a
 * separately authorized scheduler and protected service role.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const file = resolve(process.env.BUFFER_ALERT_STORE || '.local/alert-store.json');
const now = new Date();
const iso = now.toISOString();
const ownerId = 'demo-local-owner';
const authority = 'DemoVelocityAuthority111111111111111111111111';
const reset = process.argv.includes('--reset');
const id = (prefix) => `${prefix}-${Date.now()}`;
const empty = () => ({ version: 1, rules: [], events: [], outbox: [], deliveries: [], lastFreshCheck: null, worker: { running: false, lastRunAt: null, workerId: null } });

let store = empty();
if (!reset) {
  try { store = JSON.parse(await readFile(file, 'utf8')); } catch { /* first run */ }
}
if (!store.rules.length) store.rules.push({ id: id('rule'), version: 1, ownerId, authority, subaccountId: 0, metric: 'maintenance_headroom', direction: 'below', threshold: '300', cadenceMinutes: 15, timezone: 'UTC', destination: 'mock', enabled: true, createdAt: iso, updatedAt: iso });
const rule = store.rules[0];
const headroom = 250;
store.lastFreshCheck = iso;
const bucket = Math.floor(now.getTime() / (rule.cadenceMinutes * 60_000));
const key = `${rule.id}:${rule.version}:${bucket}:${rule.metric}:${rule.direction}`;
if (rule.enabled && headroom <= Number(rule.threshold) && !store.events.some((event) => event.key === key)) {
  const eventId = id('event');
  store.events.push({ id: eventId, key, ruleId: rule.id, ruleVersion: rule.version, ownerId, state: 'queued', observedAt: iso, value: String(headroom), threshold: rule.threshold, reason: 'maintenance_headroom is below the configured threshold.' });
  store.outbox.push({ id: id('outbox'), eventId, ownerId, state: 'pending', attempts: 0 });
}
store.worker = { running: true, lastRunAt: iso, workerId: 'local-mock-worker' };
const item = store.outbox.find((entry) => entry.ownerId === ownerId && entry.state === 'pending');
if (item) {
  item.state = 'claimed'; item.attempts += 1; item.leaseUntil = new Date(now.getTime() + 30_000).toISOString();
  const event = store.events.find((entry) => entry.id === item.eventId);
  item.state = 'delivered'; item.deliveredAt = iso; delete item.leaseUntil;
  event.state = 'delivered'; event.deliveredAt = iso; event.claimedBy = 'local-mock-worker';
  if (!store.deliveries.some((delivery) => delivery.eventId === event.id)) store.deliveries.push({ id: id('delivery'), eventId: event.id, ownerId, destination: 'mock', deliveredAt: iso, message: `Buffer mock alert: ${event.reason} Observed ${event.value}; threshold ${event.threshold}.` });
}
await mkdir(dirname(file), { recursive: true });
await writeFile(file, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ store: file, worker: store.worker, rules: store.rules.length, events: store.events.length, pending: store.outbox.filter((entry) => entry.state === 'pending').length, delivered: store.deliveries.length }, null, 2));
