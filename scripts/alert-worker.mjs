#!/usr/bin/env node
/** Local durable mock-sink worker. No network requests or external destinations are supported. */
import { open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  claimAlertWork, createAlertRule, deleteAlertRule, emptyAlertStore, evaluateAlerts,
  evaluateFixtureAlerts, finishAlertWork, pauseAlertRule, updateAlertRule,
} from '../src/lib/alerts.ts';
import { PROTOCOLS } from '../src/lib/protocols.ts';
import { openAlertStore } from './lib/alert-store.mjs';

const args = process.argv.slice(2);
const flags = new Set(['--fixture', '--reset', '--fail-sink', '--claim-only', '--status', '--watch', '--help']);
const values = new Set(['--owner', '--snapshot', '--direction', '--timezone', '--threshold', '--cadence', '--cooldown', '--hysteresis', '--rule', '--pause', '--delete', '--resume', '--interval']);
const options = new Map();
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (flags.has(key)) options.set(key, true);
  else if (values.has(key) && args[i + 1] && !args[i + 1].startsWith('--')) options.set(key, args[++i]);
  else throw new Error(`Unknown or incomplete option: ${key}`);
}
if (options.has('--help')) {
  console.log(`Buffer local durable worker (Node 24). External delivery is disabled.
  npm run alert:worker -- --fixture [--watch --interval 5]
  npm run alert:worker -- --snapshot /path/to/velocity-snapshot.json --owner your-local-owner
  npm run alert:worker -- --status
  npm run alert:worker -- --pause RULE_ID | --resume RULE_ID | --delete RULE_ID
  --rule RULE_ID --threshold 300 --direction below --cadence 15 --cooldown 15 --hysteresis 10 --timezone UTC
  --fail-sink tests bounded retries; --claim-only tests restart/lease recovery.
  --reset requires --fixture and clears only the selected local store.
  BUFFER_ALERT_STORE selects a local SQLite file (default .local/alerts.sqlite).
Snapshots are local files; --watch rereads them and will mark old input unavailable.
The fixture explicitly creates a new deterministic observation each tick.
The SQLite state and mock delivery journal commit atomically. Browser storage is separate.`);
  process.exit(0);
}
if (options.has('--reset') && !options.has('--fixture')) throw new Error('--reset requires --fixture.');
if (options.has('--fixture') && options.has('--snapshot')) throw new Error('Choose fixture or snapshot input, not both.');
if (['--pause', '--resume', '--delete'].filter(key => options.has(key)).length > 1) throw new Error('Choose one rule operation.');
const ownerId = options.get('--owner') || 'demo-local-owner';
if (typeof ownerId !== 'string' || ownerId.length > 160 || !ownerId.trim()) throw new Error('Invalid local owner identifier.');
const workerId = `worker-${randomUUID()}`;
const database = openAlertStore(process.env.BUFFER_ALERT_STORE || '.local/alerts.sqlite');
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

function fixture(now) {
  return {
    protocol: PROTOCOLS.velocity, source: 'sample', network: 'fixture', authority: 'DemoVelocityAuthority111111111111111111111111',
    sampleName: 'Deterministic alert fixture', subaccount: { id: 0, name: 'Local fixture', address: null },
    retrievedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 120_000).toISOString(), accountSlot: null, observedSlot: null,
    metrics: [], positions: [], spots: [], orders: [], inventoryAvailable: true, warnings: [], provenance: ['Local deterministic fixture.'],
    risk: { scope: 'cross-margin', totalCollateral: '1200', maintenanceRequirement: '950', maintenanceHeadroom: '250', canBeLiquidated: false, status: 'clear', explanation: 'Deterministic local fixture; not an account observation.' },
  };
}
function validateSnapshot(value) {
  if (!value || typeof value !== 'object' || !value.subaccount || !Number.isSafeInteger(value.subaccount.id) || !Array.isArray(value.positions) ||
      value.positions.length > 1000 || value.positions.some(position => !position || typeof position !== 'object' || !position.oracle) ||
      typeof value.authority !== 'string' || value.authority.length > 64 || typeof value.retrievedAt !== 'string' ||
      (value.expiresAt !== null && typeof value.expiresAt !== 'string')) throw new Error('Invalid local snapshot structure.');
  return value;
}
async function tick() {
  const now = new Date();
  let snapshot = null;
  if (options.has('--fixture')) snapshot = fixture(now);
  if (options.has('--snapshot')) {
    const handle = await open(resolve(options.get('--snapshot')), 'r');
    try {
      const bytes = Buffer.alloc(2_000_001);
      let size = 0;
      while (size < bytes.length) {
        const { bytesRead } = await handle.read(bytes, size, bytes.length - size, size);
        if (!bytesRead) break;
        size += bytesRead;
      }
      if (size > 2_000_000) throw new Error('Snapshot exceeds the 2 MB local input limit.');
      snapshot = validateSnapshot(JSON.parse(bytes.subarray(0, size).toString('utf8')));
    } finally { await handle.close(); }
  }
  if (snapshot) database.transaction(store => {
    const ruleId = options.get('--rule');
    let rule = store.rules.find(rule => rule.ownerId === ownerId && (ruleId ? rule.id === ruleId : rule.authority === snapshot.authority && rule.subaccountId === snapshot.subaccount.id));
    if (ruleId && !rule) throw new Error('No rule with that identifier belongs to this local owner.');
    if (!rule) {
      rule = createAlertRule({ ownerId, authority: snapshot.authority, subaccountId: snapshot.subaccount.id, direction: options.get('--direction') || 'below', threshold: options.get('--threshold') || '300', cadenceMinutes: Number(options.get('--cadence') || 15), cooldownMinutes: Number(options.get('--cooldown') || options.get('--cadence') || 15), hysteresis: options.get('--hysteresis') || '10', timezone: options.get('--timezone') || 'UTC' }, now);
      store.rules.push(rule);
    }
    return options.has('--fixture') ? evaluateFixtureAlerts(store, snapshot, ownerId, now) : evaluateAlerts(store, snapshot, ownerId, now);
  });
  if (!options.has('--status')) {
    let claim;
    database.transaction(store => {
      const result = claimAlertWork(store, ownerId, workerId, now);
      claim = result.claim;
      return result.store;
    });
    if (claim && !options.has('--claim-only')) database.transaction(store => finishAlertWork(store, ownerId, claim, !options.has('--fail-sink'), new Date()));
  }
  const store = database.read();
  const owned = store.rules.filter(rule => rule.ownerId === ownerId);
  console.log(JSON.stringify({ store: database.path, mode: options.has('--fixture') ? 'deterministic-fixture' : 'local-provider-snapshot', externalDelivery: false,
    worker: { mode: options.has('--watch') ? 'watch process active' : 'one-shot complete', lastRunAt: store.worker.lastRunAt, lastWorkerId: store.worker.workerId, outstandingClaims: store.outbox.filter(item => item.ownerId === ownerId && item.state === 'claimed').length }, rules: owned.map(rule => ({ id: rule.id, version: rule.version, enabled: rule.enabled })),
    monitors: store.monitors.filter(monitor => monitor.ownerId === ownerId),
    events: store.events.filter(event => event.ownerId === ownerId).length,
    pending: store.outbox.filter(item => item.ownerId === ownerId && ['pending', 'claimed', 'failed'].includes(item.state)).length,
    delivered: store.deliveries.filter(delivery => delivery.ownerId === ownerId).length }, null, 2));
}
try {
  if (options.has('--reset')) database.transaction(() => emptyAlertStore());
  for (const [option, operation] of [['--pause', pauseAlertRule], ['--delete', deleteAlertRule]]) {
    if (options.has(option)) database.transaction(store => operation(store, options.get(option), ownerId));
  }
  if (options.has('--resume')) database.transaction(store => updateAlertRule(store, options.get('--resume'), ownerId, { enabled: true }));
  if (options.has('--rule') && !options.has('--snapshot') && !options.has('--fixture')) {
    const patch = {};
    for (const [flag, key] of [['--direction', 'direction'], ['--timezone', 'timezone'], ['--threshold', 'threshold'], ['--hysteresis', 'hysteresis'], ['--cadence', 'cadenceMinutes'], ['--cooldown', 'cooldownMinutes']]) {
      if (options.has(flag)) patch[key] = ['cadenceMinutes', 'cooldownMinutes'].includes(key) ? Number(options.get(flag)) : options.get(flag);
    }
    if (Object.keys(patch).length) database.transaction(store => updateAlertRule(store, options.get('--rule'), ownerId, patch));
  }
  const interval = Number(options.get('--interval') || 5);
  if (!Number.isFinite(interval) || interval < 1 || interval > 3600) throw new Error('Watch interval must be between 1 and 3600 seconds.');
  do {
    await tick();
    if (!options.has('--watch') || stopping) break;
    // Short waits allow SIGINT/SIGTERM to stop without waiting a full cadence.
    const until = Date.now() + interval * 1000;
    while (!stopping && Date.now() < until) await new Promise(resolve => setTimeout(resolve, Math.min(250, until - Date.now())));
  } while (!stopping);
} finally { database.close(); }
