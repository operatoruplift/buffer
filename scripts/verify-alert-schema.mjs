/** Local PostgreSQL/WASM verification. No connection to a hosted database. */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.BUFFER_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
let checks = 0;
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
let rule;
const event = '00000000-0000-4000-8000-000000000004';
const outbox = '00000000-0000-4000-8000-000000000005';
const sql = (query, params = []) => db.query(query, params);
async function check(query, expected) { assert.deepEqual((await sql(query)).rows, expected); checks++; }
async function rejects(query, code) { await assert.rejects(sql(query), error => error.code === code); checks++; }
async function asOwner(owner) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
}
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- Supabase grants these roles EXECUTE directly on new public functions.
  -- Revoking only PUBLIC must not leave that separate grant untested.
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  insert into auth.users values ('${a}'),('${b}');
  create schema private;
  create table private.rate_limits(window_start timestamptz not null);
  create function private.prune_rate_limits() returns void language sql security definer
    as $$ delete from private.rate_limits where window_start < now() - interval '1 hour' $$;
  insert into private.rate_limits values (now() - interval '2 hours'), (now());
`);
const permissionMigration = await readFile(new URL('../supabase/migrations/20260920010000_harden_function_permissions.sql', import.meta.url), 'utf8');
for (const name of ['20260915120000_create_alert_pipeline.sql','20260919090000_harden_alert_pipeline.sql', '20260920010000_harden_function_permissions.sql']) {
  await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
}
await check(`select coalesce(proconfig @> array['search_path=""'],false) as secured from pg_proc where oid='private.prune_rate_limits()'::regprocedure`, [{ secured: true }]);
await sql('select private.prune_rate_limits()');
await check('select count(*)::int as n from private.rate_limits', [{ n: 1 }]);
for (const role of ['anon', 'authenticated']) {
  for (const signature of ['guard_alert_rule()', 'cancel_deleted_alert_rule()', 'guard_alert_event()', 'claim_alert_delivery(text)', 'finish_alert_delivery(uuid,uuid,boolean)', 'prune_alert_history()']) {
    await check(`select has_function_privilege('${role}','public.${signature}','EXECUTE') as permitted`, [{ permitted: false }]);
  }
}
await db.exec(`insert into public.alert_destinations(owner_id) values ('${a}'),('${b}');`);
const destination = (await sql(`select id from alert_destinations where owner_id=$1`, [a])).rows[0].id;
const bDestination = (await sql(`select id from alert_destinations where owner_id=$1`, [b])).rows[0].id;
await asOwner(a);
await check('select count(*)::int as n from public.alert_destinations', [{ n: 1 }]);
await rejects(`insert into public.alert_destinations(owner_id) values ('${a}')`, '42501');
await rejects(`select * from public.claim_alert_delivery('browser')`, '42501');
const insertRule = (owner, dest, threshold = '300', timezone = 'UTC') => `insert into public.alert_rules(owner_id,authority,subaccount_id,metric,direction,threshold,cadence_minutes,timezone,destination_id) values ('${owner}','11111111111111111111111111111111',0,'maintenance_headroom','below','${threshold}',15,'${timezone}','${dest}')`;
await rejects(insertRule(b, bDestination), '42501');
await rejects(insertRule(a, bDestination), '23514');
await rejects(insertRule(a, destination, 'NaN'), '23514');
await rejects(insertRule(a, destination, '300', 'Imaginary/Zone'), '23514');
await sql(insertRule(a, destination));
await check('select count(*)::int as n from public.alert_rules', [{ n: 1 }]);
await rejects('update public.alert_rules set version=99', '42501');
await rejects('update public.alert_rules set last_fresh_check=now()', '42501');
await db.exec('reset role');
rule = (await sql('select id from public.alert_rules')).rows[0].id;
await db.exec(`set role service_role;
  insert into public.alert_events(id,rule_id,rule_version,owner_id,event_key,state,observed_at,value,threshold,reason)
    values('${event}','${rule}',1,'${a}','first','queued',now(),250,300,'Fresh fixture');
  insert into public.alert_outbox(id,event_id,owner_id,state) values('${outbox}','${event}','${a}','pending');`);
await rejects(`update public.alert_outbox set owner_id='${b}' where id='${outbox}'`, '23503');
await rejects(`insert into public.alert_events(rule_id,rule_version,owner_id,event_key,state,observed_at,value,threshold,reason) values('${rule}',1,'${a}','first','queued',now(),250,300,'Duplicate')`, '23505');
await asOwner(b);
await check('select count(*)::int as n from public.alert_rules', [{ n: 0 }]);
await check('select count(*)::int as n from public.alert_events', [{ n: 0 }]);
await check('select count(*)::int as n from public.alert_outbox', [{ n: 0 }]);
await sql(`delete from public.alert_rules where id='${rule}'`);
await asOwner(a);
await check('select count(*)::int as n from public.alert_rules', [{ n: 1 }]);
await rejects(`update public.alert_events set state='delivered'`, '42501');
await db.exec('reset role; set role service_role');
await check("select count(*)::int as n from public.claim_alert_delivery('no-observation')", [{ n: 0 }]);
await sql(`update public.alert_rules set monitoring_state='fresh',last_fresh_check=now(),input_expires_at=now()+interval '120 seconds' where id='${rule}'`);
await rejects(`update public.alert_events set value=1 where id='${event}'`, '23514');
let claim = (await sql("select * from public.claim_alert_delivery('worker-a')")).rows[0];
assert.equal(claim.state, 'claimed'); assert.equal(claim.attempts, 1); checks++;
await check("select count(*)::int as n from public.claim_alert_delivery('worker-b')", [{ n: 0 }]);
await check(`select public.finish_alert_delivery('${outbox}','00000000-0000-4000-8000-000000000000',true) as ok`, [{ ok: false }]);
// Expire and reclaim: the first worker token is fenced.
await sql(`update public.alert_outbox set lease_until=now()-interval '1 second' where id='${outbox}'`);
const newer = (await sql("select * from public.claim_alert_delivery('worker-b')")).rows[0];
assert.notEqual(newer.lease_token, claim.lease_token); checks++;
await check(`select public.finish_alert_delivery('${outbox}','${claim.lease_token}',true) as ok`, [{ ok: false }]);
await check(`select public.finish_alert_delivery('${outbox}','${newer.lease_token}',false) as ok`, [{ ok: true }]);
await check("select count(*)::int as n from public.claim_alert_delivery('worker-a')", [{ n: 0 }]);
await sql(`update public.alert_outbox set not_before=now()-interval '1 second' where id='${outbox}'`);
claim = (await sql("select * from public.claim_alert_delivery('worker-a')")).rows[0];
await sql(`update public.alert_rules set monitoring_state='unavailable',last_fresh_check=now()-interval '121 seconds' where id='${rule}'`);
await check(`select public.finish_alert_delivery('${outbox}','${claim.lease_token}',true) as ok`, [{ ok: false }]);
await check('select state from public.alert_outbox', [{ state: 'pending' }]);
await check('select state from public.alert_events', [{ state: 'queued' }]);
await check("select count(*)::int as n from public.claim_alert_delivery('stale')", [{ n: 0 }]);
await sql(`update public.alert_rules set monitoring_state='fresh',last_fresh_check=now(),input_expires_at=now()+interval '120 seconds' where id='${rule}'`);
claim = (await sql("select * from public.claim_alert_delivery('worker-a')")).rows[0];
await asOwner(a);
await sql(`update public.alert_rules set enabled=false where id='${rule}'`);
await check(`select version,enabled from public.alert_rules`, [{ version: 2, enabled: false }]);
await check(`select state from public.alert_outbox`, [{ state: 'cancelled' }]);
await db.exec('reset role; set role service_role');
await check(`select public.finish_alert_delivery('${outbox}','${claim.lease_token}',true) as ok`, [{ ok: false }]);
await asOwner(a);
await sql(`update public.alert_rules set enabled=true where id='${rule}'`);
await db.exec('reset role; set role service_role');
await sql(`update public.alert_rules set monitoring_state='fresh',last_fresh_check=now(),input_expires_at=now()+interval '120 seconds' where id='${rule}'`);
await sql(`insert into public.alert_events(rule_id,rule_version,owner_id,event_key,state,observed_at,value,threshold,reason) values('${rule}',3,'${a}','second','queued',now(),250,300,'Next fixture')`);
await sql(`insert into public.alert_outbox(event_id,owner_id,state) select id,owner_id,'pending' from public.alert_events where event_key='second'`);
const delivered = (await sql("select * from public.claim_alert_delivery('recovered')")).rows[0];
await check(`select public.finish_alert_delivery('${delivered.id}','${delivered.lease_token}',true) as ok`, [{ ok: true }]);
await check(`select public.finish_alert_delivery('${delivered.id}','${delivered.lease_token}',true) as ok`, [{ ok: false }]);
await asOwner(a);
await sql(`delete from public.alert_rules where id='${rule}'`);
await check("select rule_id,state from public.alert_events where event_key='first'", [{ rule_id: null, state: 'suppressed' }]);
await db.exec('reset role; set role anon');
await rejects('select * from public.alert_events', '42501');
await rejects("select * from public.claim_alert_delivery('anon')", '42501');
await db.exec('reset role; set role service_role');
await check('select public.prune_alert_history()::int as n', [{ n: 0 }]);
await sql(`insert into public.alert_events(rule_id,rule_version,owner_id,event_key,state,observed_at,value,threshold,reason) values(null,1,'${a}','old-retained','suppressed',now()-interval '31 days',250,300,'Old fixture')`);
await check('select public.prune_alert_history()::int as n', [{ n: 1 }]);
// The followup must also work on a fresh installation without the hosted helper.
await db.exec('reset role; drop function private.prune_rate_limits()');
await db.exec(permissionMigration); checks++;
await db.close();
console.log(JSON.stringify({ result: 'PASS', assertions: checks, database: 'local PostgreSQL (PGlite)', externalWrites: false }, null, 2));
