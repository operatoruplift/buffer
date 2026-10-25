-- Self-service account deletion, required by the Solana dApp Store Publisher
-- Policy. The hosted app holds no service-role key, so a signed-in person calls
-- this owner-scoped RPC with their own session. Deleting the auth.users row
-- cascades to every owner-keyed table: saved_reports, alert_rules,
-- alert_destinations, alert_events, alert_outbox and
-- private.buffer_monitor_runs, plus Supabase Auth's sessions and identities.
-- Additive: no existing row, table or policy changes when this is applied.
-- Reverse with: drop function public.delete_own_account();
create function public.delete_own_account() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  removed uuid;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  delete from auth.users where id = caller returning id into removed;
  -- Null when this account was already deleted, for example by a retried call.
  return removed;
end $$;
-- Supabase grants browser roles EXECUTE on new public functions directly, so
-- revoking PUBLIC alone is not enough. Only a signed-in session may call this.
revoke all on function public.delete_own_account() from public, anon, authenticated, service_role;
grant execute on function public.delete_own_account() to authenticated;
comment on function public.delete_own_account() is 'Deletes the calling account and, by cascade, all of its Buffer data. Takes no argument, so it can only ever act on auth.uid().';
