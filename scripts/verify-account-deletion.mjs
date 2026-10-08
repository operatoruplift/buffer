/**
 * Local PostgreSQL/WASM checks for self-service account deletion. No hosted
 * connection. Hosted Supabase owns auth.users as supabase_auth_admin and runs
 * migrations as a non-superuser postgres role, so this fixture creates the
 * deletion function as a non-superuser that holds only the auth.users
 * privileges that role has.
 */
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createDatabase } from './lib/pglite.mjs';

const DELETION_MIGRATION = '20261007120000_delete_own_account.sql';
const migrations = new URL('../supabase/migrations/', import.meta.url);
const db = createDatabase();
let checks = 0;
const ownerA = '00000000-0000-4000-8000-00000000000a';
const ownerB = '00000000-0000-4000-8000-00000000000b';
const sql = (query, params = []) => db.query(query, params);
const rows = async (query, params = []) => (await sql(query, params)).rows;
async function check(query, expected, params = []) { assert.deepEqual(await rows(query, params), expected); checks++; }
async function rejects(query, code) { await assert.rejects(sql(query), error => error.code === code); checks++; }
async function as(role, owner = '') {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${owner}',false);`);
}
async function asAdmin() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);"); }

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create role supabase_auth_admin; create role buffer_migrator; create role no_grants;
  create schema auth authorization supabase_auth_admin;
  create table auth.users(id uuid primary key, email text not null);
  create table auth.sessions(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
  create table auth.identities(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
  alter table auth.users owner to supabase_auth_admin;
  alter table auth.sessions owner to supabase_auth_admin;
  alter table auth.identities owner to supabase_auth_admin;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role, buffer_migrator, no_grants;
  grant execute on function auth.uid() to anon, authenticated, service_role, buffer_migrator;
  -- The privileges hosted postgres holds on Auth's table; nothing on its other tables.
  grant select, delete on auth.users to buffer_migrator;
  -- Supabase grants browser roles EXECUTE on new public functions directly.
  -- Revoking PUBLIC alone would leave those grants in place.
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  alter default privileges for role buffer_migrator in schema public grant execute on functions to anon, authenticated, service_role;
  create schema private;
  -- Hosted Supabase installs pgcrypto here; the rate-limit migration uses it.
  create schema extensions;
`);
const files = (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort();
// It must run after every migration that created an owner-keyed table.
assert.ok(files.indexOf(DELETION_MIGRATION) > files.indexOf('20260928120000_liquidation_sentinels.sql'), `${DELETION_MIGRATION} must sort after the alert migrations.`);
checks++;
for (const name of files) {
  const body = await readFile(new URL(name, migrations), 'utf8');
  if (name !== DELETION_MIGRATION) { await db.exec(body); continue; }
  await db.exec('grant create on schema public to buffer_migrator; set role buffer_migrator;');
  await db.exec(body);
  await db.exec('reset role; revoke create on schema public from buffer_migrator;');
}

// Every owner-keyed table must disappear with its account. A new table that
// references auth.users fails here until it cascades and the privacy page lists it.
await check(`select conrelid::regclass::text as owned, confdeltype as on_delete from pg_constraint
  where contype='f' and confrelid='auth.users'::regclass and connamespace <> 'auth'::regnamespace order by 1`, [
  { owned: 'alert_destinations', on_delete: 'c' }, { owned: 'alert_events', on_delete: 'c' },
  { owned: 'alert_outbox', on_delete: 'c' }, { owned: 'alert_rules', on_delete: 'c' },
  { owned: 'private.buffer_monitor_runs', on_delete: 'c' }, { owned: 'saved_reports', on_delete: 'c' },
]);
await check(`select p.prosecdef as definer, p.pronargs as arguments, p.prorettype::regtype::text as returns,
  coalesce(p.proconfig @> array['search_path=""'], false) as pinned_search_path, pg_get_userbyid(p.proowner) as owner
  from pg_proc p where p.oid='public.delete_own_account()'::regprocedure`,
  [{ definer: true, arguments: 0, returns: 'uuid', pinned_search_path: true, owner: 'buffer_migrator' }]);
for (const [role, permitted] of [['anon', false], ['service_role', false], ['no_grants', false], ['authenticated', true]]) {
  await check(`select has_function_privilege('${role}','public.delete_own_account()','EXECUTE') as permitted`, [{ permitted }]);
}

const report = JSON.stringify({ report: 'Buffer perpetual price scenario', version: 1, sourceMode: 'live', scenario: {} });
const fingerprint = letter => letter.repeat(64);
await db.exec(`
  insert into auth.users values ('${ownerA}','a@example.test'),('${ownerB}','b@example.test');
  insert into auth.sessions(user_id) values ('${ownerA}'),('${ownerA}'),('${ownerB}');
  insert into auth.identities(user_id) values ('${ownerA}'),('${ownerB}');
  insert into public.saved_reports(user_id,title,report) values
    ('${ownerA}','A first',$json$${report}$json$),('${ownerA}','A second',$json$${report}$json$),('${ownerB}','B only',$json$${report}$json$);
  insert into public.alert_destinations(id,owner_id,provider,config_ref,fingerprint,label,masked_destination) values
    ('00000000-0000-4000-8000-0000000000a1','${ownerA}','discord','00000000-0000-4000-8000-0000000000f1','${fingerprint('a')}','A channel','Discord …00a1'),
    ('00000000-0000-4000-8000-0000000000a2','${ownerA}','webhook','00000000-0000-4000-8000-0000000000f2','${fingerprint('b')}','A hook','Webhook hooks.example.com'),
    ('00000000-0000-4000-8000-0000000000b1','${ownerB}','discord','00000000-0000-4000-8000-0000000000f1','${fingerprint('c')}','B channel','Discord …00b1');
  insert into public.alert_rules(id,owner_id,authority,subaccount_id,metric,unit,market,direction,threshold,cadence_minutes,timezone,destination_id,destination) values
    ('00000000-0000-4000-8000-0000000000a3','${ownerA}','DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2',0,'maintenance_headroom','USD',null,'below',300,15,'UTC','00000000-0000-4000-8000-0000000000a1','discord'),
    ('00000000-0000-4000-8000-0000000000a4','${ownerA}','DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2',0,'liquidation_distance','%','SOL-PERP','below',5,15,'UTC','00000000-0000-4000-8000-0000000000a2','webhook'),
    ('00000000-0000-4000-8000-0000000000b3','${ownerB}','DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2',0,'maintenance_headroom','USD',null,'below',300,15,'UTC','00000000-0000-4000-8000-0000000000b1','discord');
  insert into public.alert_events(id,rule_id,rule_version,owner_id,event_key,state,observed_at,value,threshold,reason,destination_id,destination_fingerprint) values
    ('00000000-0000-4000-8000-0000000000a5','00000000-0000-4000-8000-0000000000a3',1,'${ownerA}','a-queued','queued',now(),250,300,'Queued fixture','00000000-0000-4000-8000-0000000000a1','${fingerprint('a')}'),
    ('00000000-0000-4000-8000-0000000000a6','00000000-0000-4000-8000-0000000000a4',1,'${ownerA}','a-delivered','delivered',now(),4,5,'Delivered fixture','00000000-0000-4000-8000-0000000000a2','${fingerprint('b')}'),
    ('00000000-0000-4000-8000-0000000000a7',null,1,'${ownerA}','a-history','suppressed',now()-interval '2 days',250,300,'Event kept after its rule was deleted',null,null),
    ('00000000-0000-4000-8000-0000000000b5','00000000-0000-4000-8000-0000000000b3',1,'${ownerB}','b-queued','queued',now(),250,300,'Queued fixture','00000000-0000-4000-8000-0000000000b1','${fingerprint('c')}');
  insert into public.alert_outbox(event_id,owner_id,state) values
    ('00000000-0000-4000-8000-0000000000a5','${ownerA}','pending'),('00000000-0000-4000-8000-0000000000a6','${ownerA}','delivered'),
    ('00000000-0000-4000-8000-0000000000b5','${ownerB}','pending');
  update public.alert_rules set unresolved_event_id='00000000-0000-4000-8000-0000000000a5' where id='00000000-0000-4000-8000-0000000000a3';
  update public.alert_rules set unresolved_event_id='00000000-0000-4000-8000-0000000000b5' where id='00000000-0000-4000-8000-0000000000b3';
  insert into private.buffer_monitor_runs(run_key,mode,owner_id) values
    ('manual:00000000-0000-4000-8000-0000000000a8','dry_run','${ownerA}'),('manual:00000000-0000-4000-8000-0000000000b8','dry_run','${ownerB}'),('cron:1','dry_run',null);
`);

const OWNED = [
  ['auth.users', 'id'], ['auth.sessions', 'user_id'], ['auth.identities', 'user_id'], ['public.saved_reports', 'user_id'],
  ['public.alert_rules', 'owner_id'], ['public.alert_destinations', 'owner_id'], ['public.alert_events', 'owner_id'],
  ['public.alert_outbox', 'owner_id'], ['private.buffer_monitor_runs', 'owner_id'],
];
async function holdings(owner) {
  await asAdmin();
  const counts = {};
  for (const [table, column] of OWNED) counts[table] = (await rows(`select count(*)::int as n from ${table} where ${column}=$1`, [owner]))[0].n;
  return counts;
}
const before = { a: await holdings(ownerA), b: await holdings(ownerB) };
assert.deepEqual(before.a, { 'auth.users': 1, 'auth.sessions': 2, 'auth.identities': 1, 'public.saved_reports': 2, 'public.alert_rules': 2,
  'public.alert_destinations': 2, 'public.alert_events': 3, 'public.alert_outbox': 2, 'private.buffer_monitor_runs': 1 }); checks++;
const bWork = `select e.state as event, o.state as outbox from public.alert_events e join public.alert_outbox o on o.event_id=e.id where e.owner_id='${ownerB}'`;

// Browser roles without a signed-in subject cannot reach the function at all,
// even when a subject claim is forged onto an anonymous request.
await as('anon'); await rejects('select public.delete_own_account()', '42501');
await as('anon', ownerA); await rejects('select public.delete_own_account()', '42501');
await as('service_role', ownerA); await rejects('select public.delete_own_account()', '42501');
await as('authenticated'); await rejects('select public.delete_own_account()', '42501');
assert.deepEqual(await holdings(ownerA), before.a); checks++;

// The caller deletes their own account and nothing else.
await as('authenticated', ownerA);
await check('select public.delete_own_account() as removed', [{ removed: ownerA }]);
assert.deepEqual(await holdings(ownerA), Object.fromEntries(OWNED.map(([table]) => [table, 0]))); checks++;
assert.deepEqual(await holdings(ownerB), before.b); checks++;
await check(bWork, [{ event: 'queued', outbox: 'pending' }]);
await check("select count(*)::int as n from private.buffer_monitor_runs where owner_id is null", [{ n: 1 }]);

// A token that outlives its account deletes nothing more.
await as('authenticated', ownerA);
await check('select public.delete_own_account() as removed', [{ removed: null }]);
assert.deepEqual(await holdings(ownerB), before.b); checks++;

// The other owner still reads their own rows through RLS, then can leave too.
await as('authenticated', ownerB);
await check('select title from public.saved_reports', [{ title: 'B only' }]);
await check('select jsonb_array_length(public.buffer_monitor_status()->\'rules\') as rules', [{ rules: 1 }]);
await check('select public.delete_own_account() as removed', [{ removed: ownerB }]);
assert.deepEqual(await holdings(ownerB), Object.fromEntries(OWNED.map(([table]) => [table, 0]))); checks++;
await asAdmin();
await check('select count(*)::int as n from auth.users', [{ n: 0 }]);
await check("select run_key from private.buffer_monitor_runs", [{ run_key: 'cron:1' }]);

await db.close();
console.log(JSON.stringify({ result: 'PASS', assertions: checks, database: 'local PostgreSQL (PGlite)', externalWrites: false }, null, 2));
