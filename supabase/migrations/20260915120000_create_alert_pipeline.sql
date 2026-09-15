-- Durable owner-scoped alert records. External delivery is intentionally not
-- enabled by this migration; the local mock worker is the first verified sink.
create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  authority text not null check (char_length(authority) between 32 and 44),
  subaccount_id integer not null check (subaccount_id between 0 and 65535),
  metric text not null check (metric = 'maintenance_headroom'),
  direction text not null check (direction in ('below', 'above')),
  threshold numeric not null,
  cadence_minutes integer not null check (cadence_minutes between 1 and 1440),
  timezone text not null check (char_length(timezone) between 1 and 80),
  destination text not null default 'mock' check (destination = 'mock'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id, version)
);

create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.alert_rules(id) on delete cascade,
  rule_version integer not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 220),
  state text not null check (state in ('queued', 'claimed', 'delivered', 'failed', 'suppressed')),
  observed_at timestamptz not null,
  value numeric not null,
  threshold numeric not null,
  reason text not null check (char_length(reason) between 1 and 512),
  claimed_by text,
  claimed_until timestamptz,
  delivered_at timestamptz,
  unique (owner_id, event_key)
);

create table public.alert_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.alert_events(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  state text not null check (state in ('pending', 'claimed', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  lease_until timestamptz,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id)
);

create index alert_rules_owner_idx on public.alert_rules(owner_id, updated_at desc);
create index alert_events_owner_idx on public.alert_events(owner_id, observed_at desc);
create index alert_outbox_claim_idx on public.alert_outbox(state, lease_until, created_at);

alter table public.alert_rules enable row level security;
alter table public.alert_events enable row level security;
alter table public.alert_outbox enable row level security;
revoke all on public.alert_rules, public.alert_events, public.alert_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.alert_rules to authenticated;
grant select on public.alert_events, public.alert_outbox to authenticated;
create policy "Owners manage their alert rules" on public.alert_rules for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners read their alert events" on public.alert_events for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners read their alert outbox" on public.alert_outbox for select to authenticated using ((select auth.uid()) = owner_id);

comment on table public.alert_rules is 'Owner-scoped threshold definitions; only verified maintenance_headroom and local mock destination are enabled.';
comment on table public.alert_events is 'Versioned deterministic alert events created only from fresh supported snapshots.';
comment on table public.alert_outbox is 'Durable delivery work; worker writes require a separately protected server role.';
