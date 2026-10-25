/**
 * Local PostgreSQL/WASM checks for the saved-report quota. No hosted connection.
 * The Auth API accepts sign-ups even while the form is gated, so the database
 * must bound what one account can store; this proves the trigger does, as the
 * real `authenticated` role under row-level security.
 */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createDatabase } from './lib/pglite.mjs';

const MIGRATIONS = ['20260911170941_create_saved_reports.sql', '20260911171816_enforce_saved_report_title_length.sql', '20261019091500_saved_report_quota.sql'];
const QUOTA_CODE = '54000';
const MAX_ROWS = 50;
const MAX_BYTES = 8 * 1024 * 1024;
const db = createDatabase();
let checks = 0;
const ownerA = '00000000-0000-4000-8000-00000000000a';
const ownerB = '00000000-0000-4000-8000-00000000000b';
const ownerC = '00000000-0000-4000-8000-00000000000c';
const sql = (query, params = []) => db.query(query, params);
const rows = async (query, params = []) => (await sql(query, params)).rows;
async function check(query, expected, params = []) { assert.deepEqual(await rows(query, params), expected); checks++; }
async function refused(promise, code, test = () => true) { await assert.rejects(promise, error => error.code === code && test(error)); checks++; }
async function as(owner) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`); }
const report = (padding = 0) => ({ report: 'Buffer perpetual price scenario', version: 1, sourceMode: 'sample', scenario: {}, ...(padding ? { padding: 'x'.repeat(padding) } : {}) });
const insert = (owner, title, body) => sql('insert into public.saved_reports(user_id,title,report) values ($1,$2,$3)', [owner, title, body]);
const quotaError = error => error.hint === 'Delete a saved report to make room.' && !error.message.includes(ownerA);

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- Supabase grants browser roles EXECUTE on new functions directly; the revoke must undo that too.
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  insert into auth.users values ('${ownerA}'),('${ownerB}'),('${ownerC}');
`);
for (const name of MIGRATIONS) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));

// The trigger is installed, and nothing but the trigger may run its function.
await check("select tgname from pg_trigger where tgrelid='public.saved_reports'::regclass and not tgisinternal order by 1", [{ tgname: 'saved_reports_quota' }]);
for (const role of ['anon', 'authenticated', 'service_role']) {
  await check(`select has_function_privilege('${role}','private.enforce_saved_report_quota()','EXECUTE') as permitted`, [{ permitted: false }]);
}

// Row cap: the 50th report saves, the 51st is refused with a fixed code and hint, nothing is written.
await as(ownerA);
for (let index = 1; index <= MAX_ROWS; index++) await insert(ownerA, `Report ${index}`, report());
await check('select count(*)::int as n from public.saved_reports', [{ n: MAX_ROWS }]);
await refused(insert(ownerA, 'One too many', report()), QUOTA_CODE, error => quotaError(error) && error.message.startsWith('Saved report limit reached'));
await check('select count(*)::int as n from public.saved_reports', [{ n: MAX_ROWS }]);
// Another account is not affected by a full one.
await as(ownerB);
await insert(ownerB, 'B first', report());
await check('select count(*)::int as n from public.saved_reports', [{ n: 1 }]);
// Deleting makes room for exactly as many as were deleted.
await as(ownerA);
await sql("delete from public.saved_reports where title in ('Report 1','Report 2')");
await insert(ownerA, 'Replacement 1', report());
await insert(ownerA, 'Replacement 2', report());
await refused(insert(ownerA, 'Still one too many', report()), QUOTA_CODE, quotaError);
await check('select count(*)::int as n from public.saved_reports', [{ n: MAX_ROWS }]);

// Byte cap: 32 reports of 260,000 bytes fit (8,320,000 bytes), a small one still fits, the next large one does not.
const large = report(259_900);
const largeBytes = (await rows('select octet_length($1::jsonb::text) as n', [large]))[0].n;
assert.ok(largeBytes <= 262144 && largeBytes >= 259_900, `large report is ${largeBytes} bytes`); checks++;
await as(ownerC);
for (let index = 1; index <= 32; index++) await insert(ownerC, `Large ${index}`, large);
const held = () => rows('select count(*)::int as n, sum(octet_length(report::text))::bigint as bytes from public.saved_reports');
const afterLarge = (await held())[0];
assert.equal(afterLarge.n, 32); assert.ok(Number(afterLarge.bytes) > 8_000_000 && Number(afterLarge.bytes) < MAX_BYTES, `held ${afterLarge.bytes}`); checks++;
await insert(ownerC, 'Small still fits', report());
await refused(insert(ownerC, 'Past eight MiB', large), QUOTA_CODE, error => quotaError(error) && error.message.startsWith('Saved report storage limit reached'));
await check('select count(*)::int as n from public.saved_reports', [{ n: 33 }]);
// The existing per-report cap (256 KiB) is still the table's own CHECK, with its own code. BEFORE INSERT
// triggers run before constraints, so it is proved on an account with room.
await as(ownerB);
await refused(insert(ownerB, 'Oversized single report', report(262_144)), '23514');
await as(ownerC);
// Deleting a large report frees its bytes.
await sql("delete from public.saved_reports where title='Large 1'");
await insert(ownerC, 'Large again', large);
await check('select count(*)::int as n from public.saved_reports', [{ n: 33 }]);

// Browser roles without a session still cannot insert at all.
await db.exec('reset role; set role anon');
await refused(insert(ownerA, 'Anonymous', report()), '42501');
await db.exec('reset role');
await check('select user_id, count(*)::int as n from public.saved_reports group by user_id order by user_id', [{ user_id: ownerA, n: MAX_ROWS }, { user_id: ownerB, n: 1 }, { user_id: ownerC, n: 33 }]);

await db.close();
console.log(JSON.stringify({ result: 'PASS', assertions: checks, migration: MIGRATIONS[2], database: 'local PostgreSQL (PGlite)', externalWrites: false }, null, 2));
