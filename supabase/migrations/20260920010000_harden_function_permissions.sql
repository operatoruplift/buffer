-- Supabase grants some function permissions directly to browser roles by
-- default. Revoking PUBLIC alone does not remove those direct grants.
-- Triggers remain executable by PostgreSQL through their table operations.
revoke all on function public.guard_alert_rule() from public, anon, authenticated;
revoke all on function public.cancel_deleted_alert_rule() from public, anon, authenticated;
revoke all on function public.guard_alert_event() from public, anon, authenticated;

-- The hosted rate limiter predates these alert migrations. Keep this optional
-- so a fresh local alert database can apply the same migration unchanged.
do $$
begin
  if to_regprocedure('private.prune_rate_limits()') is not null then
    execute 'alter function private.prune_rate_limits() set search_path = ''''';
  end if;
end;
$$;
