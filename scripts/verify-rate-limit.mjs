/**
 * Local PostgreSQL/WASM checks for the rate-limit retention and keyed-hash
 * migration. No hosted connection and no external writes.
 *
 * `hosted` reproduces the production limiter as it was before this migration
 * (definitions and grants read, read-only, from the Buffer project), holding
 * counters stored under the old unkeyed SHA-256, with pg_cron present.
 * `fresh` starts empty, as a new project does, without pg_cron.
 * As on hosted Supabase, the migration runs as a non-superuser role that owns
 * the limiter objects (there it is `postgres`; PGlite's superuser has that name).
 */
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createDatabase } from './lib/pglite.mjs';

const MIGRATION = '20261008120000_rate_limit_retention_and_keyed_hash.sql';
const migration = await readFile(new URL(`../supabase/migrations/${MIGRATION}`, import.meta.url), 'utf8');
const SECRET = 'f'.repeat(64);
const WINDOW = 60;
let checks = 0;

const sha256 = value => createHash('sha256').update(value).digest('hex');
/** The key the deployed server sends (src/server/rate-limit.ts clientKey). */
const deployedKey = (scope, ip) => `${scope}:${sha256(ip).slice(0, 32)}`;
const rows = async (db, query, params = []) => (await db.query(query, params)).rows;
async function check(db, query, expected, params = []) { assert.deepEqual(await rows(db, query, params), expected); checks++; }
async function rejects(db, role, query, code) {
  await db.exec(`reset role; set role ${role}`);
  try { await assert.rejects(db.query(query), error => error.code === code, `${role}: ${query}`); checks++; }
  finally { await db.exec('reset role'); }
}
async function consume(db, key, { role = 'anon', secret = SECRET, limit = 3, window = WINDOW } = {}) {
  await db.exec(`reset role; set role ${role}`);
  try { return (await db.query('select * from public.consume_rate_limit($1, $2, $3, $4)', [secret, key, limit, window])).rows[0]; }
  finally { await db.exec('reset role'); }
}
const hashKey = async db => Buffer.from((await rows(db, "select encode(key, 'hex') as k from private.rate_limit_hash_key"))[0].k, 'hex');
/** allowed and remaining are exact; retry_after is the ceiling of the time left, so it may tick down. */
function expectResult(result, allowed, remaining) {
  assert.equal(result.allowed, allowed); assert.equal(result.remaining, remaining);
  assert.ok(Number.isInteger(result.retry_after) && result.retry_after >= 1 && result.retry_after <= WINDOW, `retry_after ${result.retry_after}`);
  checks++;
}
const storedKeys = async db => (await rows(db, 'select key from private.rate_limits order by key')).map(row => row.key);

async function supabaseRoles(db) {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    -- Supabase grants browser roles EXECUTE on new public functions directly,
    -- so revoking PUBLIC alone would leave them able to call a new function.
    create role buffer_owner;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    alter default privileges for role buffer_owner in schema public grant execute on functions to anon, authenticated, service_role;
    create schema extensions; create extension pgcrypto with schema extensions;
    grant usage on schema extensions to buffer_owner;
    -- Hosted postgres owns the database; CREATE SCHEMA IF NOT EXISTS checks this first.
    do $$ begin execute format('grant create on database %I to buffer_owner', current_database()); end $$;
    grant usage, create on schema public to buffer_owner;
    create schema private authorization buffer_owner;
  `);
}
const asOwner = sql => `set role buffer_owner; ${sql}; reset role;`;

// ---------------------------------------------------------------- hosted
const hosted = createDatabase();
await supabaseRoles(hosted);
await hosted.exec(`
  set role buffer_owner;
  create table private.rate_limit_config(id boolean primary key default true check (id), secret text not null default encode(extensions.gen_random_bytes(32), 'hex'));
  create table private.rate_limits(key text primary key, count integer not null, window_start timestamptz not null);
  create function private.prune_rate_limits() returns void language sql security definer set search_path = ''
    as $$ delete from private.rate_limits where window_start < now() - interval '1 hour'; $$;
  create function public.consume_rate_limit(p_secret text, p_key text, p_limit integer, p_window_seconds integer)
   returns table(allowed boolean, remaining integer, retry_after integer)
   language plpgsql security definer set search_path to 'private', 'pg_temp'
  as $function$
  declare
    v_now timestamptz := now();
    v_count integer;
    v_start timestamptz;
  begin
    if p_secret is null or p_secret <> (select secret from private.rate_limit_config where id) then
      return query select false, 0, p_window_seconds;
      return;
    end if;
    if p_key is null or length(p_key) > 200 or p_limit < 1 or p_window_seconds < 1 then
      return query select false, 0, p_window_seconds;
      return;
    end if;
    insert into private.rate_limits (key, count, window_start)
    values (p_key, 1, v_now)
    on conflict (key) do update
      set count = case when private.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now then 1 else private.rate_limits.count + 1 end,
          window_start = case when private.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now then v_now else private.rate_limits.window_start end
    returning count, window_start into v_count, v_start;
    return query select
      v_count <= p_limit,
      greatest(p_limit - v_count, 0),
      greatest(ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - v_now)))::integer, 1);
  end;
  $function$;
  insert into private.rate_limit_config(secret) values ('${SECRET}');
  reset role;
  -- pg_cron as hosted: extension metadata plus a cron.schedule stub that records jobs by name.
  insert into pg_catalog.pg_extension(oid, extname, extowner, extnamespace, extrelocatable, extversion)
    values (777778, 'pg_cron', current_user::regrole, 'pg_catalog'::regnamespace, false, '1.6.4');
  create schema cron;
  create table cron.job(jobid bigserial primary key, jobname text unique, schedule text not null, command text not null, username text not null default current_user);
  create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
    insert into cron.job(jobname, schedule, command) values (job_name, schedule, command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
  grant usage on schema cron to buffer_owner;
  grant select, insert, update on cron.job to buffer_owner;
  grant usage on sequence cron.job_jobid_seq to buffer_owner;
`);

// Before: the deployed key is stored as sent, an unkeyed SHA-256 that anyone can recompute from an IP.
const IPS = ['203.0.113.7', '198.51.100.23', '2001:db8::1'];
await hosted.exec(`insert into private.rate_limits values
  ('${deployedKey('live-read', IPS[0])}', 4, '2026-09-17 17:42:03+00'),
  ('${deployedKey('monitoring', IPS[1])}', 1, '2026-10-07 09:33:43+00')`);
await consume(hosted, deployedKey('live-read', IPS[2]));
const before = await storedKeys(hosted);
assert.ok(before.includes(deployedKey('live-read', IPS[2])), 'fixture reproduces the unkeyed finding'); checks++;
await check(hosted, "select count(*)::int as n from private.rate_limits where window_start < '2026-09-18 00:00+00'", [{ n: 1 }]);

await hosted.exec(asOwner(migration));

// Retention: every row stored under the unkeyed hash is gone, including the 17 September one.
await check(hosted, 'select count(*)::int as n from private.rate_limits', [{ n: 0 }]);
// The configured secret survives, so the deployed RATE_LIMIT_SECRET keeps working.
await check(hosted, 'select secret from private.rate_limit_config', [{ secret: SECRET }]);

// Keyed hash: the deployed request is stored as HMAC-SHA-256(database key, p_key).
const key = await hashKey(hosted);
assert.equal(key.length, 32); checks++;
const sent = deployedKey('live-read', IPS[0]);
expectResult(await consume(hosted, sent), true, 2);
const [stored] = await storedKeys(hosted);
assert.equal(stored, createHmac('sha256', key).update(sent).digest('hex')); checks++;
for (const unkeyed of [sent, sha256(sent), sha256(IPS[0]), sha256(IPS[0]).slice(0, 32)]) { assert.notEqual(stored, unkeyed); checks++; }
assert.ok(!stored.includes(sha256(IPS[0]).slice(0, 32)) && !stored.includes('live-read'), 'no unkeyed fragment or scope is stored'); checks++;

// Limits are still enforced per key, and scopes stay separate.
expectResult(await consume(hosted, sent), true, 1);
expectResult(await consume(hosted, sent), true, 0);
expectResult(await consume(hosted, sent), false, 0);
assert.equal((await consume(hosted, deployedKey('monitoring', IPS[0]))).allowed, true); checks++;
await check(hosted, 'select count::int as n from private.rate_limits order by count desc limit 1', [{ n: 4 }]);
await check(hosted, `select count(*)::int as n from private.rate_limits where expires_at = window_start + interval '${WINDOW} seconds'`, [{ n: 2 }]);
// Rollover: a counter whose window has passed, before any prune removes it, starts a new window and a new expiry.
await hosted.query("update private.rate_limits set window_start = now() - interval '2 minutes' where key = $1", [stored]);
expectResult(await consume(hosted, sent), true, 2);
await check(hosted, `select count::int as n, expires_at = window_start + interval '${WINDOW} seconds' and window_start > now() - interval '1 minute' as renewed from private.rate_limits where key = $1`, [{ n: 1, renewed: true }], [stored]);

// Rejected calls write nothing: wrong, missing or browser-guessed secrets, bad keys and bad limits.
for (const [label, options, call] of [
  ['wrong secret', { secret: 'guess' }, sent], ['null secret', { secret: null }, sent],
  ['oversized key', {}, 'k'.repeat(201)], ['zero limit', { limit: 0 }, sent], ['zero window', { window: 0 }, sent],
  ['null limit', { limit: null }, sent], ['null window', { window: null }, sent],
  // The privacy policy's retention period assumes one-minute windows.
  ['window over a minute', { window: WINDOW + 1 }, sent],
]) {
  const before = await rows(hosted, 'select key, count from private.rate_limits order by key');
  const result = await consume(hosted, call, options);
  assert.equal(result.allowed, false, label); assert.equal(result.remaining, 0, label);
  assert.deepEqual(await rows(hosted, 'select key, count from private.rate_limits order by key'), before, label); checks++;
}

// The check prunes expired counters, its own included, before counting.
await hosted.exec("update private.rate_limits set window_start = now() - interval '2 minutes', expires_at = now() - interval '1 minute'");
expectResult(await consume(hosted, sent), true, 2);
await check(hosted, 'select count(*)::int as n, min(count)::int as c from private.rate_limits', [{ n: 1, c: 1 }]);
// The scheduled pruner deletes only expired counters.
await hosted.exec(`insert into private.rate_limits values ('expired', 1, now() - interval '3 minutes', now() - interval '2 minutes')`);
await hosted.query('select private.prune_rate_limits()');
await check(hosted, "select count(*)::int as n from private.rate_limits where key = 'expired'", [{ n: 0 }]);
await check(hosted, 'select count(*)::int as n from private.rate_limits', [{ n: 1 }]);
const jobs = await rows(hosted, 'select jobname, schedule, command, username from cron.job order by jobid');
assert.deepEqual(jobs, [{ jobname: 'buffer-prune-rate-limits', schedule: '*/3 * * * *', command: 'select private.prune_rate_limits()', username: 'buffer_owner' }]); checks++;
// pg_cron runs the command as the job's user, the owner, despite the revokes.
await hosted.exec(`insert into private.rate_limits values ('idle', 1, now() - interval '4 minutes', now() - interval '3 minutes')`);
await hosted.exec(`set role ${jobs[0].username}; ${jobs[0].command}; reset role;`);
await check(hosted, "select count(*)::int as n from private.rate_limits where key = 'idle'", [{ n: 0 }]);

// A missing key fails loudly: the RPC errors, so the server falls back to its per-process limit.
await hosted.exec('create table private.saved_key as select * from private.rate_limit_hash_key; delete from private.rate_limit_hash_key;');
await rejects(hosted, 'anon', `select * from public.consume_rate_limit('${SECRET}', '${sent}', 3, ${WINDOW})`, '55000');
await hosted.exec('insert into private.rate_limit_hash_key select * from private.saved_key; drop table private.saved_key;');

// Privileges. Only anon (the server's publishable key) may call the limiter, and only with the secret.
const limiter = 'public.consume_rate_limit(text,text,integer,integer)';
for (const [role, permitted] of [['anon', true], ['authenticated', false], ['service_role', false]]) {
  await check(hosted, `select has_function_privilege('${role}', '${limiter}', 'EXECUTE') as p`, [{ p: permitted }]);
  await check(hosted, `select has_function_privilege('${role}', 'private.prune_rate_limits()', 'EXECUTE') as p`, [{ p: false }]);
  for (const table of ['rate_limit_hash_key', 'rate_limits', 'rate_limit_config']) {
    await check(hosted, `select has_table_privilege('${role}', 'private.${table}', 'SELECT, INSERT, UPDATE, DELETE') as p`, [{ p: false }]);
    await rejects(hosted, role, `select * from private.${table}`, '42501');
  }
  await rejects(hosted, role, 'select private.prune_rate_limits()', '42501');
}
await rejects(hosted, 'authenticated', `select * from public.consume_rate_limit('${SECRET}', 'x', 3, 60)`, '42501');
await check(hosted, `select relname, relrowsecurity as rls from pg_class where relnamespace = 'private'::regnamespace and relkind = 'r' and relname like 'rate_limit%' order by 1`,
  [{ relname: 'rate_limit_config', rls: true }, { relname: 'rate_limit_hash_key', rls: true }, { relname: 'rate_limits', rls: true }]);
await check(hosted, `select proname, prosecdef as definer, proconfig as config, pg_get_userbyid(proowner) as owner from pg_proc where oid in ('${limiter}'::regprocedure, 'private.prune_rate_limits()'::regprocedure) order by 1`,
  [{ proname: 'consume_rate_limit', definer: true, config: ['search_path=""'], owner: 'buffer_owner' }, { proname: 'prune_rate_limits', definer: true, config: ['search_path=""'], owner: 'buffer_owner' }]);
await check(hosted, "select pg_get_userbyid(relowner) as owner from pg_class where oid = 'private.rate_limit_hash_key'::regclass", [{ owner: 'buffer_owner' }]);
// Row-level security is a second barrier: even a mistaken grant reveals no key.
await hosted.exec('grant usage on schema private to anon; grant select on private.rate_limit_hash_key to anon; set role anon;');
await check(hosted, 'select count(*)::int as n from private.rate_limit_hash_key', [{ n: 0 }]);
await hosted.exec('reset role; revoke select on private.rate_limit_hash_key from anon; revoke usage on schema private from anon;');

// Re-running the migration is harmless: same key, one job, counters cleared.
await hosted.exec(asOwner(migration));
assert.deepEqual(await hashKey(hosted), key); checks++;
await check(hosted, 'select count(*)::int as n from cron.job', [{ n: 1 }]);
await check(hosted, 'select count(*)::int as n from private.rate_limits', [{ n: 0 }]);

// ----------------------------------------------------------------- fresh
const fresh = createDatabase();
await supabaseRoles(fresh);
await fresh.exec(asOwner(migration));
const freshSecret = (await rows(fresh, 'select secret from private.rate_limit_config'))[0].secret;
assert.match(freshSecret, /^[0-9a-f]{64}$/); checks++;
assert.equal((await consume(fresh, sent, { secret: SECRET })).allowed, false, 'an unknown secret is refused'); checks++;
assert.equal((await consume(fresh, sent, { secret: freshSecret })).allowed, true); checks++;
const [freshStored] = await storedKeys(fresh);
assert.equal(freshStored, createHmac('sha256', await hashKey(fresh)).update(sent).digest('hex')); checks++;
assert.notEqual(freshStored, stored, 'each database has its own key'); checks++;
for (const [role, permitted] of [['anon', true], ['authenticated', false], ['service_role', false]]) {
  await check(fresh, `select has_function_privilege('${role}', '${limiter}', 'EXECUTE') as p`, [{ p: permitted }]);
}
// The empty search_path and qualified names mean a caller's temp tables or a public function cannot stand in.
await fresh.exec(`create function public.hmac(bytea, bytea, text) returns bytea language sql as $$ select '\\x00'::bytea $$;
  set role anon;
  create temp table rate_limit_hash_key(id boolean, key bytea); insert into rate_limit_hash_key values (true, '\\x${'00'.repeat(32)}');
  create temp table rate_limits(key text, count integer, window_start timestamptz, expires_at timestamptz);
  reset role;`);
assert.equal((await consume(fresh, 'shadow-test', { secret: freshSecret })).allowed, true); checks++;
await check(fresh, 'select count(*)::int as n from private.rate_limits where key = $1', [{ n: 1 }], [createHmac('sha256', await hashKey(fresh)).update('shadow-test').digest('hex')]);
await check(fresh, 'select count(*)::int as n from pg_temp.rate_limits', [{ n: 0 }]);
// With no configured secret at all, nothing passes (the hosted version accepted any secret then).
await fresh.exec('delete from private.rate_limit_config');
assert.equal((await consume(fresh, sent, { secret: 'anything' })).allowed, false); checks++;

await hosted.close();
await fresh.close();
console.log(JSON.stringify({ result: 'PASS', assertions: checks, migration: MIGRATION, database: 'local PostgreSQL (PGlite)', externalWrites: false }, null, 2));
