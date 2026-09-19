# Database verification

Verified against the dedicated **Buffer** Supabase project `vhbngdatlowfnwaymvuq` on 2026-09-11 UTC (2026-09-12 in Vietnam). No other project was changed.

## Applied migration

[`20260911170941_create_saved_reports.sql`](../supabase/migrations/20260911170941_create_saved_reports.sql) and the forward correction [`20260911171816_enforce_saved_report_title_length.sql`](../supabase/migrations/20260911171816_enforce_saved_report_title_length.sql) were applied successfully with Supabase's migration tool. Their versions match the server's migration history. PostgreSQL is **17.6**.

The table stores private historical reports, not authoritative account state or inputs to the live scenario calculation.

- Row ownership references `auth.users(id)` with `ON DELETE CASCADE`.
- Row-level security is enabled; SELECT, INSERT and DELETE policies compare `user_id` with `(select auth.uid())`.
- Authenticated users can select/delete only their own rows. INSERT privileges cover only `user_id`, `title`, and `report`; IDs and creation times come from server defaults.
- Anonymous access and UPDATE privileges are absent. No application service-role credential is required.
- CREATE privileges on the public schema are explicitly revoked from PUBLIC, anon and authenticated.
- The `(user_id, created_at desc)` index covers the ownership foreign key and newest-report access pattern.
- Timestamps use `timestamptz`. Financial values remain decimal strings inside the JSON export.

The review fixed an SQL three-valued-logic hole: CHECK accepts NULL, so the report predicate now uses `coalesce(..., false)`. JSON nulls in required fields are rejected. Version must be JSON number `1`, the entire title is capped at 180 characters and must contain non-whitespace content, and the JSON body is capped at 262,144 bytes. The forward correction prevents long whitespace padding from bypassing the title limit.

UUID report IDs retain the existing application contract. Native UUIDv7 is unavailable on this PostgreSQL version; an ordered identifier would be a future consideration if insert volume makes primary-index locality material.

## Verified database behavior

Checks ran as actual `authenticated` and `anon` database roles with transaction-local JWT claims, rather than as the table owner. Synthetic users had no email addresses or passwords. The transaction was rolled back, and an independent count confirmed **zero remaining users and reports** before the separate browser-login fixtures were created.

| Check | Result |
| --- | --- |
| Owner can insert, read and delete their report | Passed |
| Second user cannot read the first user's report | Passed |
| Second user's DELETE of the first user's ID affects zero rows | Passed |
| Forged-owner INSERT is rejected by RLS | Passed |
| Missing authenticated identity cannot read or insert reports | Passed |
| Anonymous SELECT, INSERT and DELETE are denied | Passed |
| UPDATE and client-supplied IDs/creation times are denied | Passed |
| Blank, tab/newline-only, overlong and overlong padded titles are rejected; the 180-character boundary is accepted | Passed |
| Null header fields, string version, missing fields, unsupported source, null scenario and oversized body are rejected | Passed |
| Deleting the owning auth user removes their reports | Passed |

## Query plan

The application query was checked with `EXPLAIN (ANALYZE, BUFFERS)` under the authenticated role against 2,000 temporary synthetic reports. Statistics were refreshed before the representative plan:

```sql
select id, title, created_at, report
from public.saved_reports
where user_id = :authenticated_user_id
order by created_at desc
limit 50;
```

PostgreSQL chose an **Index Scan on saved_reports_user_created_idx**, returned 50 rows without a sort, and used four shared buffer hits. The RLS identity lookup was a single InitPlan. Observed execution time was 0.071 ms for this small synthetic database check; this is not a production latency guarantee. All synthetic query-plan rows were rolled back and the table was vacuumed/analyzed afterward.

The current UI deliberately shows the newest 50 reports. If browsing older reports is added, use a cursor based on creation time plus a deterministic ID tie-breaker rather than OFFSET. The list currently fetches report JSON along with metadata; fetching the body only when downloading would reduce transfer size for large libraries.

## Supabase advisors

- **Security:** no table/RLS warnings. A later advisor refresh reported `auth_leaked_password_protection`: compromised-password screening is disabled in project Auth settings. Enabling it is part of the parent Auth configuration work. See [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The initial scan had no notices; this later result supersedes it.
- **Performance:** one informational project-level notice, `auth_db_connections_absolute`. Auth currently uses a fixed maximum of 10 database connections; Supabase recommends percentage-based allocation when resizing the database. No table/index/RLS performance warnings were reported. See [Supabase production guidance](https://supabase.com/docs/guides/deployment/going-into-prod).

## Separate authentication/browser fixtures

Two randomized, confirmed `.invalid` email fixtures were provisioned for the parent integration test. Passwords were bcrypt-hashed locally before insertion; plaintext was not included in SQL. These fixture accounts do not test email delivery.

Actual desktop and 375 px mobile browser tests passed against the public Vercel deployment: account A signed in, saved a report and downloaded its JSON; a delayed response from A was withheld after signing into account B in another tab; B could not access A's report; returning to A allowed deletion and logout.

**Fixture cleanup is complete.** After production tests, the two exact fixture users were deleted and independent queries confirmed zero matching users, reports, identities, or sessions. The private local credential file was removed. No other users were changed.

## Reproduce transactional ownership checks

Run the following only in the intended Buffer project using a privileged SQL session. It creates randomized test identities, changes roles locally to exercise RLS, and rolls everything back. An assertion raises an error if the behavior differs.

<details>
<summary>Transaction-scoped SQL assertions</summary>

```sql
begin;
select set_config('buffer.test_user_a', gen_random_uuid()::text, true),
       set_config('buffer.test_user_b', gen_random_uuid()::text, true);
insert into auth.users (id, aud, role)
values (current_setting('buffer.test_user_a')::uuid, 'authenticated', 'authenticated'),
       (current_setting('buffer.test_user_b')::uuid, 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('buffer.test_user_a'), 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', current_setting('buffer.test_user_a'), true);
do $tests$
declare
  a uuid := current_setting('buffer.test_user_a')::uuid;
  b uuid := current_setting('buffer.test_user_b')::uuid;
  r uuid;
  count_rows bigint;
  payload jsonb := '{"report":"Buffer perpetual price scenario","version":1,"sourceMode":"sample","scenario":{}}';
  bad_payload jsonb;
begin
  if auth.uid() is distinct from a or current_user <> 'authenticated' then
    raise exception 'Authenticated test role was not established';
  end if;
  insert into public.saved_reports(user_id, title, report) values (a, 'Ownership verification A', payload) returning id into r;
  perform set_config('buffer.test_report_a', r::text, true);
  select count(*) into count_rows from public.saved_reports;
  if count_rows <> 1 then raise exception 'A must see exactly its own report'; end if;

  begin
    insert into public.saved_reports(user_id, title, report) values (b, 'Forged owner', payload);
    raise exception 'Forged-owner insert unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.saved_reports set title = 'Mutated' where id = r;
    raise exception 'UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.saved_reports(id, user_id, title, report) values (gen_random_uuid(), a, 'Forged ID', payload);
    raise exception 'Client-selected ID unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.saved_reports(user_id, title, report, created_at) values (a, 'Forged time', payload, '2000-01-01');
    raise exception 'Client-selected creation time unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.saved_reports(user_id, title, report) values (a, '   ', payload);
    raise exception 'Blank title unexpectedly succeeded';
  exception when check_violation then null; end;
  begin
    insert into public.saved_reports(user_id, title, report) values (a, repeat('a',181), payload);
    raise exception 'Oversized title unexpectedly succeeded';
  exception when check_violation then null; end;
  foreach bad_payload in array array[
    payload || '{"report":null}'::jsonb,
    payload || '{"version":null}'::jsonb,
    payload || '{"sourceMode":null}'::jsonb,
    payload || '{"version":"1"}'::jsonb,
    payload || '{"scenario":null}'::jsonb,
    payload - 'report',
    payload || '{"sourceMode":"unsupported"}'::jsonb,
    payload || jsonb_build_object('padding', repeat('a',262144))
  ] loop
    begin
      insert into public.saved_reports(user_id, title, report) values (a, 'Invalid body', bad_payload);
      raise exception 'Invalid report body unexpectedly succeeded';
    exception when check_violation then null; end;
  end loop;

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into count_rows from public.saved_reports;
  if count_rows <> 0 then raise exception 'Missing-identity authenticated role can read reports'; end if;
  begin
    insert into public.saved_reports(user_id, title, report) values (a, 'Missing identity', payload);
    raise exception 'Missing-identity insert unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $tests$;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('buffer.test_user_b'), 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', current_setting('buffer.test_user_b'), true);
do $tests$
declare
  b uuid := current_setting('buffer.test_user_b')::uuid;
  r uuid := current_setting('buffer.test_report_a')::uuid;
  count_rows bigint;
  payload jsonb := '{"report":"Buffer perpetual price scenario","version":1,"sourceMode":"live","scenario":{}}';
begin
  select count(*) into count_rows from public.saved_reports;
  if count_rows <> 0 then raise exception 'B can read A report'; end if;
  delete from public.saved_reports where id = r;
  get diagnostics count_rows = row_count;
  if count_rows <> 0 then raise exception 'B deleted A report'; end if;
  insert into public.saved_reports(user_id, title, report) values (b, 'Ownership verification B', payload);
  select count(*) into count_rows from public.saved_reports;
  if count_rows <> 1 then raise exception 'B must see exactly its own report'; end if;
  delete from public.saved_reports where user_id = b;
  get diagnostics count_rows = row_count;
  if count_rows <> 1 then raise exception 'B could not delete its own report'; end if;
end $tests$;

reset role;
set local role anon;
do $tests$
begin
  begin
    perform id from public.saved_reports limit 1;
    raise exception 'Anonymous SELECT unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.saved_reports(user_id, title, report)
    values (current_setting('buffer.test_user_a')::uuid, 'Anonymous insert',
      '{"report":"Buffer perpetual price scenario","version":1,"sourceMode":"sample","scenario":{}}');
    raise exception 'Anonymous INSERT unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.saved_reports where id = current_setting('buffer.test_report_a')::uuid;
    raise exception 'Anonymous DELETE unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $tests$;
reset role;

delete from auth.users where id = current_setting('buffer.test_user_a')::uuid;
do $tests$
begin
  if exists(select 1 from public.saved_reports where id = current_setting('buffer.test_report_a')::uuid) then
    raise exception 'Deleting the user did not cascade to the report';
  end if;
end $tests$;
select 'PASS' as result, 26 as assertion_count, 'Ownership, grants, malformed-body constraints and user-deletion cascade passed. Fixtures rolled back.' as detail;
rollback;
```

</details>

## Change and rollback policy

This migration created an empty table and required no data backfill. Keep deployed migrations immutable; make subsequent schema changes in new forward migrations. Dropping `public.saved_reports` is acceptable only for an unpublished disposable environment. Production changes should preserve historical user records.


## September 20 hosted monitoring extension

Applied `hosted_monitoring` as hosted migration `20260919183521`; local source is `20260920020000_hosted_monitoring.sql`. Before application, alert rules, destinations and events were empty. The additive extension preserves saved-report tables and enables real owner-authenticated rule configuration, immutable event provenance, versioned episodes, fenced worker transitions and receipt states. Local PostgreSQL verification passed 48 assertions; prior schema verifier covers 55 additional assertions. Private credential/run tables are denied to browser roles; all five public report/alert tables retain RLS.

The security advisor reports intentionally exposed SECURITY DEFINER entry points: the worker/rate-limit RPCs require separate server secrets, and monitoring status/mutation RPCs require `auth.uid()` and enforce owner scope. Anonymous status access and browser access to helper functions are denied. These expected findings are not evidence that browser callers can bypass the explicit checks.

The initial scheduler preparation applied as `20260919183534`, but hosted postflight showed managed pg_net 0.20.4 queue grants could not be revoked by the tenant postgres role. No scheduler was activated and no credential-bearing request entered that queue. The reviewed scheduler setup replaces that transport with a synchronous http 1.6 HEAD helper, fixed destination, strict response acknowledgement and transient Vault-derived header; see deployment/release records for its final migration and activation proof. Vault secret reads and the private trigger helper remain denied to anon/authenticated roles.


The synchronous trigger migration applied as `20260919185033` (`use_synchronous_monitoring_trigger`). Hosted checks confirm http 1.6, HEAD-only helper with no net calls, non-debug logging, private-helper execution denied to anon/authenticated/service_role, and Vault reads denied to browser roles. The managed base HTTP function retains browser EXECUTE grants; those do not grant access to the private helper or its Vault credential and no persistent request queue is used. Scheduler activation/actual completed runs are recorded in the release evidence.
