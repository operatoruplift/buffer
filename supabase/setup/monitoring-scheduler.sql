-- Reviewable Supabase Pro scheduler setup. Apply as a migration administrator.
-- This replaces the trigger helper; it does NOT activate a cron job.
-- Keep CRON_SECRET in Vault under buffer_monitor_cron_secret. It is used only
-- in memory: pg_net is deliberately not used because its managed queue grants
-- may remain PUBLIC even after a tenant REVOKE reports only a warning.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists http with schema extensions version '1.6';
revoke all on table vault.secrets, vault.decrypted_secrets from public, anon, authenticated;
-- Defense in depth where ownership permits. Hosted supabase_admin may retain
-- PUBLIC EXECUTE here: this generic SECURITY INVOKER function cannot read Vault
-- for browser roles. The private helper and Vault ACLs are the required gates.
revoke all on function extensions.http(extensions.http_request) from public, anon, authenticated;

-- Reviewed against https://supabase.com/docs/guides/database/extensions/http
-- and https://github.com/pramsey/pgsql-http/blob/v1.6.0/http.c on 2026-09-20.
-- Version 1.6 follows redirects for POST/GET, but explicitly not for HEAD.
-- Its authenticated HEAD response carries only a small worker-result header.
create or replace function private.invoke_buffer_monitor_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
set client_min_messages = 'warning'
set http.timeout_msec = '55000'
set http.keepalive = 'off'
as $$
declare
  credential text;
  received extensions.http_response;
  result_text text;
  result_headers integer;
  result jsonb;
begin
  -- The extension logs request headers at DEBUG2. Never load the credential
  -- when verbose server logging could expose it; client DEBUG is also disabled.
  if lower(current_setting('log_min_messages')) like 'debug%' then
    raise exception 'Buffer scheduler requires non-debug HTTP logging';
  end if;
  if not exists(select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace
    where e.extname='http' and e.extversion='1.6' and n.nspname='extensions') then
    raise exception 'Buffer scheduler HTTP extension requires version review';
  end if;
  select decrypted_secret into credential from vault.decrypted_secrets
    where name='buffer_monitor_cron_secret';
  if credential is null or length(credential) not between 32 and 256 or credential !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Buffer scheduler credential is unavailable';
  end if;

  -- Clear inherited proxy/TLS overrides. Version 1.6 uses seconds for CONNECTTIMEOUT.
  perform extensions.http_reset_curlopt();
  if extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT','5') is not true
    or extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','55000') is not true
    or extensions.http_set_curlopt('CURLOPT_SSL_VERIFYPEER','1') is not true
    or extensions.http_set_curlopt('CURLOPT_SSL_VERIFYHOST','2') is not true
    or extensions.http_set_curlopt('CURLOPT_PROXY','') is not true then
    raise exception 'Buffer scheduler HTTP options are unavailable';
  end if;
  select * into received from extensions.http((
    'HEAD',
    'https://bufferonsolana.vercel.app/api/monitoring/worker',
    array[('Authorization','Bearer '||credential)::extensions.http_header,
      ('Accept','application/json')::extensions.http_header],
    null, null
  )::extensions.http_request);
  credential:=null;
  perform extensions.http_reset_curlopt();

  -- A redirect, bare 200, HTML response or stale deployment is not a worker ACK.
  if received.status is distinct from 200 then
    raise exception 'Buffer scheduler endpoint did not acknowledge the invocation';
  end if;
  select count(*),max(h.value) into result_headers,result_text
    from unnest(received.headers) h where lower(h.field)='x-buffer-monitoring-result';
  if result_headers<>1 or result_text is null or octet_length(result_text)>512 then
    raise exception 'Buffer scheduler acknowledgement is invalid';
  end if;
  result:=result_text::jsonb;
  if jsonb_typeof(result) is distinct from 'object' then
    raise exception 'Buffer scheduler acknowledgement is invalid';
  end if;
  if (select count(*) from jsonb_object_keys(result))<>6
    or exists(select 1 from jsonb_object_keys(result) k where k not in ('duplicate','mode','checked','available','delivery','receipt'))
    or jsonb_typeof(result->'duplicate') is distinct from 'boolean'
    or jsonb_typeof(result->'checked') is distinct from 'boolean'
    or jsonb_typeof(result->'mode') is distinct from 'string'
    or coalesce(result->>'mode','') not in ('dry_run','send')
    or coalesce(jsonb_typeof(result->'available'),'') not in ('boolean','null')
    or (result->'delivery'<>'null'::jsonb and (jsonb_typeof(result->'delivery') is distinct from 'string'
      or result->>'delivery' not in ('suppressed','failed','accepted_by_provider','unknown_outcome')))
    or (result->'receipt'<>'null'::jsonb and (jsonb_typeof(result->'receipt') is distinct from 'string'
      or result->>'receipt' not in ('destination_unavailable','delivered','pending','permanent'))) then
    raise exception 'Buffer scheduler acknowledgement is invalid';
  end if;
  -- Preserve the existing bigint signature; this is HTTP status, not a queue ID.
  -- Actual heartbeat timestamps remain in the protected monitoring run journal.
  return 200;
exception when others then
  credential:=null;
  perform extensions.http_reset_curlopt();
  -- Never include a transport error, response/header body or credential in logs.
  raise exception 'Buffer scheduler invocation failed; inspect protected worker status';
end;
$$;
revoke all on function private.invoke_buffer_monitor_worker() from public, anon, authenticated, service_role;

-- After deploying the HEAD route and verifying Vault/helper privileges, activate once:
-- select cron.schedule('buffer-monitor-minute', '* * * * *',
--   'select private.invoke_buffer_monitor_worker();');
-- Inspect cron.job by jobname before activation; do not create duplicate jobs.
-- A successful 200 acknowledgement can be a deduplicated invocation: separately
-- verify fresh completed cron heartbeat rows and mode=dry_run before any delivery.
-- Pause or rollback: select cron.alter_job(jobid, active := false)
--   from cron.job where jobname = 'buffer-monitor-minute';
