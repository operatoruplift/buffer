-- This migration creates a new, empty table; no existing user data is rewritten.
-- Reverse only in an unpublished environment by dropping public.saved_reports.
-- In production, preserve reports and use a new forward migration for changes.
revoke create on schema public from public, anon, authenticated;

create table public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  report jsonb not null check (coalesce(
    jsonb_typeof(report) = 'object'
    and report ?& array['report', 'version', 'sourceMode', 'scenario']
    and octet_length(report::text) <= 262144
    and report->>'report' = 'Buffer perpetual price scenario'
    and report->'version' = '1'::jsonb
    and report->>'sourceMode' in ('sample', 'live')
    and jsonb_typeof(report->'scenario') = 'object'
  , false)),
  created_at timestamptz not null default now()
);
create index saved_reports_user_created_idx on public.saved_reports(user_id, created_at desc);
alter table public.saved_reports enable row level security;
revoke all on public.saved_reports from public, anon, authenticated;
grant select, delete on public.saved_reports to authenticated;
grant insert (user_id, title, report) on public.saved_reports to authenticated;
create policy "Users read their own reports" on public.saved_reports for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users save their own reports" on public.saved_reports for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own reports" on public.saved_reports for delete to authenticated
  using ((select auth.uid()) = user_id);
comment on table public.saved_reports is 'Private historical Buffer reports. Never used as a live account snapshot.';
