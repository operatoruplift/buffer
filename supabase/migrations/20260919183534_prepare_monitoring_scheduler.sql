-- Reviewable Supabase Pro scheduler setup. Apply as a migration administrator.
-- This creates the bounded trigger helper; it does NOT start a cron job.
-- Keep the production CRON_SECRET in Vault under buffer_monitor_cron_secret.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- pg_net grants PUBLIC access by default. The queued Authorization header is a
-- credential, even though the net schema is not exposed through the Data API.
revoke all on all tables in schema net from public, anon, authenticated;
revoke all on all sequences in schema net from public, anon, authenticated;
revoke all on table vault.secrets, vault.decrypted_secrets from public, anon, authenticated;

create or replace function private.invoke_buffer_monitor_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare credential text; request_id bigint;
begin
  select decrypted_secret into credential from vault.decrypted_secrets
    where name = 'buffer_monitor_cron_secret';
  if credential is null or length(credential) < 32 or length(credential) > 256 then
    raise exception 'Buffer scheduler credential is unavailable';
  end if;
  select net.http_post(
    url := 'https://bufferonsolana.vercel.app/api/monitoring/worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' || credential, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function private.invoke_buffer_monitor_worker() from public, anon, authenticated, service_role;

-- After the production endpoint and Vault secret are verified, activate exactly once:
-- select cron.schedule('buffer-monitor-minute', '* * * * *',
--   'select private.invoke_buffer_monitor_worker();');
-- Do not create duplicates: inspect cron.job by jobname before activation.
-- Pause or rollback: select cron.alter_job(jobid, active := false)
--   from cron.job where jobname = 'buffer-monitor-minute';
