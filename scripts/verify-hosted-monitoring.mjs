/** Local PostgreSQL behavioral checks. No hosted connection or notification. */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.BUFFER_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const ownerA = '00000000-0000-4000-8000-000000000001';
const ownerB = '00000000-0000-4000-8000-000000000002';
const ref = '00000000-0000-4000-8000-000000000003';
const secret = 'local-only-monitoring-contract-test-credential';
const fingerprint = 'a'.repeat(64);
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const sql = (q, p = []) => db.query(q, p);
async function role(name, owner = '') { await db.exec(`reset role; set role ${name}; select set_config('request.jwt.claim.sub','${owner}',false);`); }
async function worker(action, data = {}, credential = secret) { await role('anon'); return (await sql('select public.buffer_monitor_worker($1,$2,$3) as result', [credential, action, data])).rows[0].result; }
async function status(owner) { await role('authenticated', owner); return (await sql('select public.buffer_monitor_status() as result')).rows[0].result; }
async function mutate(owner, action, id, config = {}) { await role('authenticated', owner); return (await sql('select public.buffer_monitor_mutate($1,$2,$3) as result', [action, id, config])).rows[0].result; }
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema private; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth,public to anon,authenticated,service_role;
  alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
  insert into auth.users values('${ownerA}'),('${ownerB}');`);
for (const name of ['20260915180735_create_alert_pipeline.sql', '20260919172720_harden_alert_pipeline.sql', '20260919173121_harden_function_permissions.sql', '20260919183521_hosted_monitoring.sql', '20260928154216_liquidation_sentinels.sql', '20261017103000_worker_fairness.sql', '20261019090000_worker_secret_lockout.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
await sql("insert into private.buffer_monitor_credentials(secret_hash) values(encode(sha256(convert_to($1,'UTF8')),'hex'))", [secret]);
await assert.rejects(worker('start', { runKey: 'cron:1', mode: 'dry_run' }, 'invalid-secret-that-is-long-enough'), error => error.code === '42501'); checks++;
await role('authenticated', ownerA);
await assert.rejects(sql('select * from private.buffer_monitor_credentials'), error => error.code === '42501'); checks++;
await assert.rejects(sql("select * from public.claim_alert_delivery('browser')"), error => error.code === '42501'); checks++;
await assert.rejects(worker('destination', { ownerId: ownerA, configRef: ref, label: 'Missing fingerprint', maskedDestination: 'Discord' }), error => error.code === '22023'); checks++;
await worker('destination', { ownerId: ownerA, configRef: ref, fingerprint, label: 'Local contract channel', maskedDestination: 'Discord …0001' });
const destination = (await status(ownerA)).destinations[0].id;
check((await status(ownerB)).destinations.length, 0);
const config = { authority: '11111111111111111111111111111111', subaccountId: 0, direction: 'below', threshold: '300.00000001', cadenceMinutes: 1, timezone: 'UTC', cooldownMinutes: 1, hysteresis: '10', destinationId: destination, enabled: true };
await assert.rejects(mutate(ownerB, 'create', null, config), error => error.code === '23514'); checks++;
const id = await mutate(ownerA, 'create', null, config);
await assert.rejects(mutate(ownerA, 'create', null, config), error => error.code === '23505'); checks++;
check((await status(ownerA)).rules[0].threshold, '300.00000001');
check((await status(ownerB)).rules.length, 0);
await assert.rejects(mutate(ownerB, 'delete', id), error => error.code === 'P0002'); checks++;
await role('authenticated', ownerA);
await assert.rejects(sql('update public.alert_rules set enabled=false'), error => error.code === '42501'); checks++;
check(await worker('start', { runKey: 'cron:1', mode: 'dry_run' }), { duplicate: false });
check(await worker('start', { runKey: 'cron:1', mode: 'dry_run' }), { duplicate: true });
const rule = await worker('claim_check');
check(rule.id, id);
check(await worker('claim_check'), null);
const now = new Date();
const observation = { mode: 'production', provider: 'velocity', network: 'mainnet-beta', authority: config.authority, subaccountId: 0, subaccountName: 'Primary', direction: 'below', ruleId: id, ruleVersion: 1, metric: 'maintenance_headroom', unit: 'USD', sourceSlot: 1000 };
const monitor = { ruleId: id, ruleVersion: 1, ownerId: ownerA, status: 'breached', breached: true, episode: 1, triggeredEpisode: 1, lastFreshCheck: now.toISOString(), inputExpiresAt: new Date(now.getTime() + 120000).toISOString(), nextCheckAt: new Date(now.getTime() + 60000).toISOString(), lastTriggeredAt: now.toISOString(), reason: null };
const event = { key: `${id}:1:episode-1:maintenance_headroom:below`, observedAt: now.toISOString(), value: '250.00000001', reason: 'Headroom threshold breached.' };
check(await worker('complete_check', { ruleId: id, version: 1, token: ref, monitor, observation, event }), { fenced: true });
const completed = await worker('complete_check', { ruleId: id, version: 1, token: rule.check_token, monitor, observation, event });
check(completed.available, true);
const stored = (await status(ownerA)).events;
check(stored.length, 1); check(stored[0].value, '250.00000001');
check((await status(ownerB)).events.length, 0);
// A provider outage must retain the breach and prior successful observation.
await db.exec('reset role'); await sql("update public.alert_rules set last_attempt_at=now()-interval '2 minutes',next_check=null where id=$1", [id]);
const unavailable = await worker('claim_check');
check(await worker('complete_check', { ruleId: id, version: 1, token: unavailable.check_token, problem: 'Provider unavailable' }), { available: false });
const duringOutage = await status(ownerA);
check(Date.parse(duringOutage.rules[0].last_fresh_check), now.getTime());
check(duringOutage.rules[0].runtime_state.breached, true);
check(duringOutage.events[0].state, 'queued');
check(await worker('claim_delivery'), null);
await db.exec('reset role'); await sql("update public.alert_rules set last_attempt_at=now()-interval '2 minutes',next_check=null where id=$1", [id]);
const recovery = await worker('claim_check');
check((await worker('complete_check', { ruleId: id, version: 1, token: recovery.check_token, monitor, observation, event: null })).available, true);
// Fresh transmissions outrank retryable receipts, which have no freshness deadline.
await db.exec('reset role');
const waitingReceipt = (await sql(`insert into public.alert_events(rule_id,rule_version,owner_id,event_key,state,observed_at,value,threshold,reason,observation,destination_id,destination_fingerprint,provider_message_id,provider_channel_id,content_hash,accepted_at)
  values($1,1,$2,'receipt-priority-fixture','accepted_by_provider',now(),250,300,'Local receipt fixture',$3,$4,$5,'123456789012345678','234567890123456789',$5,now()) returning id`, [id,ownerA,observation,destination,fingerprint])).rows[0].id;
await sql("insert into public.alert_outbox(event_id,owner_id,state) values($1,$2,'accepted_by_provider')", [waitingReceipt,ownerA]);
const selected = await worker('next_work', { sendEnabled: true });
check(selected.kind, 'delivery');
const work = selected.work;
await db.exec('reset role'); await sql('delete from public.alert_events where id=$1', [waitingReceipt]);
check(work.event.id, completed.eventId);
check(await worker('claim_delivery'), null);
check(await worker('begin_send', { outboxId: work.outbox.id, token: ref, fingerprint, preview: 'Fixture contract message' }), { send: false });
check(await worker('begin_send', { outboxId: work.outbox.id, token: work.outbox.lease_token, fingerprint, preview: 'Fixture contract message' }), { send: true });
// Pause after transmission intent cannot claim that a remotely accepted message was recalled.
await mutate(ownerA, 'update', id, { enabled: false });
check((await status(ownerA)).events[0].state, 'sending');
await assert.rejects(worker('finish_send', { outboxId: work.outbox.id, token: work.outbox.lease_token, state: 'accepted_by_provider' }), error => error.code === '22023'); checks++;
check(await worker('finish_send', { outboxId: work.outbox.id, token: work.outbox.lease_token, state: 'accepted_by_provider', messageId: '123456789012345678', channelId: '234567890123456789', contentHash: fingerprint }), { recorded: true });
check((await status(ownerA)).events[0].state, 'accepted_by_provider');
await db.exec('reset role'); await sql("update public.alert_outbox set not_before=now()-interval '1 second'");
const receiptSelection = await worker('next_work', { sendEnabled: true });
check(receiptSelection.kind, 'receipt');
const receipt = receiptSelection.work;
await assert.rejects(worker('finish_receipt', { outboxId: receipt.outbox.id, token: receipt.outbox.lease_token, state: 'delivered', messageId: '999999999999999999', channelId: '234567890123456789', contentHash: fingerprint }), error => error.code === '22023'); checks++;
check(await worker('finish_receipt', { outboxId: receipt.outbox.id, token: receipt.outbox.lease_token, state: 'delivered', messageId: '123456789012345678', channelId: '234567890123456789', contentHash: fingerprint }), { recorded: true });
check((await status(ownerA)).events[0].state, 'delivered');
check(await worker('finish_receipt', { outboxId: receipt.outbox.id, token: receipt.outbox.lease_token, state: 'delivered', messageId: '123456789012345678', channelId: '234567890123456789', contentHash: fingerprint }), { fenced: true });
// Re-enable creates a new version. A crashed sending attempt becomes uncertain.
await mutate(ownerA, 'update', id, { enabled: true });
await db.exec('reset role'); await sql("update public.alert_rules set last_attempt_at=now()-interval '2 minutes',next_check=null where id=$1", [id]);
const nextRule = await worker('claim_check');
const nextNow = new Date();
const nextMonitor = { ...monitor, ruleVersion: 3, lastFreshCheck: nextNow.toISOString(), inputExpiresAt: new Date(nextNow.getTime()+120000).toISOString() };
const second = await worker('complete_check', { ruleId: id, version: 3, token: nextRule.check_token, monitor: nextMonitor, observation: { ...observation, ruleVersion: 3 }, event: { ...event, key: `${id}:3:episode-1:maintenance_headroom:below`, observedAt: nextNow.toISOString() } });
check(second.available, true);
const secondWork = await worker('claim_delivery');
await worker('begin_send', { outboxId: secondWork.outbox.id, token: secondWork.outbox.lease_token, fingerprint, preview: 'Second fixture' });
await db.exec('reset role'); await sql("update public.alert_outbox set lease_until=now()-interval '1 second' where id=$1", [secondWork.outbox.id]);
await worker('start', { runKey: 'cron:2', mode: 'send' });
check((await status(ownerA)).events[0].state, 'unknown_outcome');
check(await worker('claim_delivery'), null);
check(await worker('finish_send', { outboxId: secondWork.outbox.id, token: secondWork.outbox.lease_token, state: 'accepted_by_provider', messageId: '123456789012345678', channelId: '234567890123456789', contentHash: fingerprint }), { fenced: true });
await worker('end', { runKey: 'cron:2', outcome: 'ok' });
await worker('start', { runKey: `manual:${id}`, mode: 'dry_run', ownerId: ownerA });
await worker('end', { runKey: `manual:${id}`, outcome: 'unavailable' });
check((await status(ownerA)).heartbeat.outcome, 'ok');
await mutate(ownerA, 'delete', id);
check((await status(ownerA)).rules.length, 0);
check((await status(ownerA)).events.length, 2);
check((await status(ownerA)).events.every(item => item.rule_id === null), true);
// Liquidation-distance sentinels and a signed webhook destination coexist with the Discord path.
const webhookRef = '00000000-0000-4000-8000-000000000004';
const webhookFingerprint = 'b'.repeat(64);
await assert.rejects(worker('destination', { ownerId: ownerA, provider: 'email', configRef: webhookRef, fingerprint: webhookFingerprint, label: 'Risk desk', maskedDestination: 'Webhook alerts.example.com' }), error => error.code === '22023'); checks++;
await worker('destination', { ownerId: ownerA, provider: 'webhook', configRef: webhookRef, fingerprint: webhookFingerprint, label: 'Risk desk', maskedDestination: 'Webhook alerts.example.com' });
const destinations = (await status(ownerA)).destinations;
check(destinations.map(item => item.provider).sort(), ['discord', 'webhook']);
const webhookDestination = destinations.find(item => item.provider === 'webhook').id;
const sentinel = { ...config, metric: 'liquidation_distance', market: 'SOL-PERP', threshold: '5', hysteresis: '1', destinationId: webhookDestination };
await assert.rejects(mutate(ownerA, 'create', null, { ...sentinel, market: 'sol-perp' }), error => error.code === '22023'); checks++;
await assert.rejects(mutate(ownerA, 'create', null, { ...config, market: 'SOL-PERP', destinationId: webhookDestination }), error => error.code === '22023'); checks++;
await assert.rejects(mutate(ownerA, 'create', null, { ...sentinel, metric: 'price' }), error => error.code === '22023'); checks++;
const sentinelId = await mutate(ownerA, 'create', null, sentinel);
const headroomAgain = await mutate(ownerA, 'create', null, { ...config, destinationId: webhookDestination });
await assert.rejects(mutate(ownerA, 'create', null, sentinel), error => error.code === '23505'); checks++;
const otherMarket = await mutate(ownerA, 'create', null, { ...sentinel, market: 'BTC-PERP' });
await assert.rejects(mutate(ownerA, 'update', sentinelId, { market: 'BTC-PERP' }), error => error.code === '22023'); checks++;
await assert.rejects(mutate(ownerA, 'update', sentinelId, { metric: 'maintenance_headroom' }), error => error.code === '22023'); checks++;
const saved = (await status(ownerA)).rules.find(item => item.id === sentinelId);
check([saved.metric, saved.unit, saved.market, saved.destination], ['liquidation_distance', '%', 'SOL-PERP', 'webhook']);
check((await status(ownerA)).rules.find(item => item.id === headroomAgain).market, null);
await mutate(ownerA, 'delete', otherMarket); await mutate(ownerA, 'delete', headroomAgain);
await worker('start', { runKey: 'cron:3', mode: 'send' });
const sentinelClaim = await worker('claim_check', { ruleId: sentinelId });
check(sentinelClaim.id, sentinelId);
const sentinelNow = new Date();
const sentinelMonitor = { ...monitor, ruleId: sentinelId, lastFreshCheck: sentinelNow.toISOString(), inputExpiresAt: new Date(sentinelNow.getTime() + 120000).toISOString(), nextCheckAt: new Date(sentinelNow.getTime() + 60000).toISOString(), lastTriggeredAt: sentinelNow.toISOString() };
const sentinelObservation = { ...observation, ruleId: sentinelId, metric: 'liquidation_distance', unit: '%', market: 'SOL-PERP' };
const sentinelEvent = { key: `${sentinelId}:1:episode-1:liquidation_distance:below`, observedAt: sentinelNow.toISOString(), value: '4.25', reason: 'Liquidation distance SOL-PERP is below the configured threshold.' };
await assert.rejects(worker('complete_check', { ruleId: sentinelId, version: 1, token: sentinelClaim.check_token, monitor: sentinelMonitor, observation: { ...sentinelObservation, market: 'BTC-PERP' }, event: sentinelEvent }), error => error.code === '22023'); checks++;
await assert.rejects(worker('complete_check', { ruleId: sentinelId, version: 1, token: sentinelClaim.check_token, monitor: sentinelMonitor, observation: { ...sentinelObservation, metric: 'maintenance_headroom', unit: 'USD' }, event: sentinelEvent }), error => error.code === '22023'); checks++;
check((await worker('complete_check', { ruleId: sentinelId, version: 1, token: sentinelClaim.check_token, monitor: sentinelMonitor, observation: sentinelObservation, event: sentinelEvent })).available, true);
const sentinelWork = await worker('claim_delivery');
check(sentinelWork.destination.provider, 'webhook');
check(await worker('begin_send', { outboxId: sentinelWork.outbox.id, token: sentinelWork.outbox.lease_token, fingerprint: webhookFingerprint, preview: 'Signed webhook payload' }), { send: true });
await assert.rejects(worker('finish_send', { outboxId: sentinelWork.outbox.id, token: sentinelWork.outbox.lease_token, state: 'accepted_by_provider', messageId: '123456789012345678', channelId: '234567890123456789', contentHash: fingerprint }), error => error.code === '22023'); checks++;
await assert.rejects(worker('finish_send', { outboxId: sentinelWork.outbox.id, token: sentinelWork.outbox.lease_token, state: 'delivered', messageId: 'ack with spaces', channelId: 'webhook', contentHash: fingerprint }), error => error.code === '22023'); checks++;
check(await worker('finish_send', { outboxId: sentinelWork.outbox.id, token: sentinelWork.outbox.lease_token, state: 'delivered', messageId: 'http-202', channelId: 'webhook', contentHash: webhookFingerprint }), { recorded: true });
const deliveredSentinel = (await status(ownerA)).events.find(item => item.rule_id === sentinelId);
check([deliveredSentinel.state, deliveredSentinel.provider_message_id, deliveredSentinel.delivered_at !== null, deliveredSentinel.observation.market], ['delivered', 'http-202', true, 'SOL-PERP']);
check(await worker('claim_receipt'), null);
check((await status(ownerA)).rules.find(item => item.id === sentinelId).unresolved_event_id, null);
await worker('end', { runKey: 'cron:3', outcome: 'ok' });

// --- Worker fairness (20261017103000_worker_fairness.sql).
// Owner B gets a verified destination and a due rule next to owner A's sentinel.
await worker('destination', { ownerId: ownerB, configRef: ref, fingerprint, label: 'Second owner channel', maskedDestination: 'Discord …0002' });
const destinationB = (await status(ownerB)).destinations[0].id;
const ruleB = await mutate(ownerB, 'create', null, { ...config, destinationId: destinationB });
const ruleA = sentinelId;
const resetClaims = async () => { await db.exec('reset role'); await sql('update public.alert_rules set last_attempt_at=null,next_check=null,check_token=null,check_lease_until=null,check_lease_kind=null'); };
/** Sixty-one seconds pass: every timestamp the scheduler orders by moves back, keeping its order. */
const minutePasses = async () => { await db.exec('reset role'); await sql("update public.alert_rules set last_attempt_at=last_attempt_at-interval '61 seconds',next_check=next_check-interval '61 seconds'"); };
async function completeClaim(claimed) {
  const at = new Date();
  const claimedMonitor = { ...monitor, ruleId: claimed.id, ruleVersion: claimed.version, ownerId: claimed.owner_id, lastFreshCheck: at.toISOString(), inputExpiresAt: new Date(at.getTime() + 120000).toISOString(), nextCheckAt: new Date(at.getTime() + 60000).toISOString(), lastTriggeredAt: at.toISOString() };
  const claimedObservation = { ...observation, ruleId: claimed.id, ruleVersion: claimed.version, metric: claimed.metric, unit: claimed.unit, ...(claimed.market ? { market: claimed.market } : {}) };
  check((await worker('complete_check', { ruleId: claimed.id, version: claimed.version, token: claimed.check_token, monitor: claimedMonitor, observation: claimedObservation, event: null })).available, true);
}
let tick = 10;
async function scheduledTick() {
  const runKey = `cron:${tick++}`;
  await worker('start', { runKey, mode: 'dry_run' });
  const claimed = await worker('claim_check');
  if (claimed) await completeClaim(claimed);
  await worker('end', { runKey, outcome: 'ok' });
  return claimed?.id ?? null;
}
// Owner A edits their rule every minute. Each edit resets next_check to null, which used to put the
// rule first in a queue the worker drains one rule per minute, so owner B's rule was never checked.
await resetClaims();
const served = [];
for (let cycle = 1; cycle <= 4; cycle++) {
  await mutate(ownerA, 'update', ruleA, { threshold: `${cycle}` });
  served.push(await scheduledTick());
  await minutePasses();
}
check(served, [ruleA, ruleB, ruleA, ruleB]);
// One claimed check per owner per minute: right after A's rule was claimed, nothing else of A's is due.
await resetClaims();
check((await worker('claim_check')).id, ruleA);
check((await worker('claim_check', { ownerId: ownerA, ruleId: ruleA })), null);
await db.exec('reset role'); await sql('update public.alert_rules set check_token=null,check_lease_until=null,check_lease_kind=null');
// A manual check holds its own, owner-scoped lease: the scheduled tick still claims owner B's rule
// while owner A's manual check is in flight, a second scheduled lease is refused, and the owner's
// own second manual check waits for the first.
await resetClaims();
const manualRun = 'manual:00000000-0000-4000-8000-0000000000a0';
check(await worker('start', { runKey: manualRun, mode: 'dry_run', ownerId: ownerA }), { duplicate: false });
const manualClaim = await worker('claim_check', { ownerId: ownerA, ruleId: ruleA });
check([manualClaim.id, manualClaim.check_lease_kind], [ruleA, 'manual']);
check(await worker('claim_check', { ownerId: ownerA, ruleId: ruleA }), null);
const scheduledDuringManual = await worker('claim_check');
check([scheduledDuringManual.id, scheduledDuringManual.check_lease_kind], [ruleB, 'scheduled']);
check(await worker('claim_check'), null);
await completeClaim(manualClaim); await completeClaim(scheduledDuringManual);
await worker('end', { runKey: manualRun, outcome: 'ok' });
check((await status(ownerA)).rules.find(item => item.id === ruleA).check_lease_kind, null);
// Manual leases are per owner: owner B's manual check proceeds while owner A's is in flight.
await minutePasses();
const manualA = await worker('claim_check', { ownerId: ownerA, ruleId: ruleA });
const manualB = await worker('claim_check', { ownerId: ownerB, ruleId: ruleB });
check([manualA.check_lease_kind, manualB.check_lease_kind], ['manual', 'manual']);
check(await worker('claim_check', { ownerId: ownerA, ruleId: ruleA }), null);
await completeClaim(manualA); await completeClaim(manualB);
// A claim that names only the rule is a manual claim scoped to that rule's owner.
await minutePasses();
const byRuleOnly = await worker('claim_check', { ruleId: ruleA });
check([byRuleOnly.id, byRuleOnly.check_lease_kind], [ruleA, 'manual']);
check(await worker('claim_check', { ownerId: ownerA, ruleId: ruleA }), null);
check(await worker('claim_check', { ruleId: '00000000-0000-4000-8000-00000000ffff' }), null);
await completeClaim(byRuleOnly);
// Manual checks are capped at 60 per owner per hour, beyond the existing 30 per minute.
await db.exec('reset role');
await sql(`insert into private.buffer_monitor_runs(run_key,mode,owner_id,started_at) select 'manual:'||gen_random_uuid(),'dry_run',$1,now()-interval '30 minutes' from generate_series(1,60)`, [ownerA]);
check(await worker('start', { runKey: 'manual:00000000-0000-4000-8000-0000000000a1', mode: 'dry_run', ownerId: ownerA }), { duplicate: true, throttled: true });
check(await worker('start', { runKey: 'manual:00000000-0000-4000-8000-0000000000b1', mode: 'dry_run', ownerId: ownerB }), { duplicate: false });
await worker('end', { runKey: 'manual:00000000-0000-4000-8000-0000000000b1', outcome: 'ok' });

// --- Worker secret lockout (20261019090000_worker_secret_lockout.sql).
const wrongSecret = 'wrong-secret-that-is-long-enough-to-pass-the-length-check';
const notices = [];
async function attempt(credential) {
  await role('anon');
  return db.query('select public.buffer_monitor_worker($1,$2,$3) as result', [credential, 'prune', {}], { onNotice: notice => notices.push(notice) });
}
const minuteNow = async () => Number((await sql("select floor(extract(epoch from now())/60)::bigint as m")).rows[0].m);
const failureCounter = async () => { await db.exec('reset role'); return Number((await sql('select last_value as v from private.buffer_monitor_auth_failures')).rows[0].v); };
const authError = message => error => error.code === '42501' && error.message === message;
// The window is a calendar minute. Start the proof only with ten seconds or more of the minute left.
const secondOfMinute = Number((await sql('select extract(second from now())::int as s')).rows[0].s);
if (secondOfMinute >= 50) await new Promise(resolve => setTimeout(resolve, (61 - secondOfMinute) * 1000));
await db.exec('reset role');
const minute = await minuteNow();
await sql(`select setval('private.buffer_monitor_auth_failures', ${minute}::bigint * 1000 + 8, true)`);
// Each failure is counted although the call ends in the exception the server relies on.
await assert.rejects(attempt(wrongSecret), authError('Worker authentication required')); checks++;
check(await failureCounter(), minute * 1000 + 9);
check((await attempt(secret)).rows[0].result, {});
await assert.rejects(attempt(wrongSecret), authError('Worker authentication required')); checks++;
check(await failureCounter(), minute * 1000 + 10);
// Ten failures: every call is refused for the rest of the minute, the right secret included, and refusals do not count.
await assert.rejects(attempt(secret), authError('Worker authentication paused')); checks++;
await assert.rejects(attempt(wrongSecret), authError('Worker authentication paused')); checks++;
check(await failureCounter(), minute * 1000 + 10);
check(await minuteNow(), minute);
// The minute ends: the next failure starts a new count and a valid call works again.
await sql(`select setval('private.buffer_monitor_auth_failures', ${minute - 1}::bigint * 1000 + 10, true)`);
check((await attempt(secret)).rows[0].result, {});
await assert.rejects(attempt(wrongSecret), authError('Worker authentication required')); checks++;
check(await failureCounter(), minute * 1000 + 1);
// Failures and refusals are logged as warnings that carry a count, never a secret.
const warnings = notices.filter(notice => notice.severity === 'WARNING').map(notice => notice.message);
check(warnings.filter(message => /^buffer_monitor_worker: authentication failed \((9|10|1) this minute\)$/.test(message)).length, 3);
check(warnings.filter(message => message === 'buffer_monitor_worker: refusing every call until the minute ends after 10 failed authentication attempts').length, 2);
check(notices.some(notice => JSON.stringify(notice).includes(wrongSecret) || JSON.stringify(notice).includes(secret)), false);
for (const name of ['anon', 'authenticated', 'service_role']) {
  const row = (await sql(`select has_sequence_privilege($1,'private.buffer_monitor_auth_failures','SELECT') as readable, has_sequence_privilege($1,'private.buffer_monitor_auth_failures','UPDATE') as writable`, [name])).rows[0];
  check(row, { readable: false, writable: false });
}
await db.close();
console.log(JSON.stringify({ result: 'PASS', assertions: checks, database: 'local PostgreSQL (PGlite)', externalWrites: false, outboundMessages: 0 }, null, 2));
