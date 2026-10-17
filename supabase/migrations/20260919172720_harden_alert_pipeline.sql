-- Prepared locally. Applying this migration does not start a scheduler or enable
-- external delivery. Only a verified local mock destination is supported.
create table public.alert_destinations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'mock' check (provider = 'mock'),
  verified_at timestamptz not null default now(),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, owner_id), unique (owner_id, provider)
);
alter table public.alert_destinations enable row level security;
revoke all on public.alert_destinations from public, anon, authenticated;
grant select on public.alert_destinations to authenticated;
create policy "Owners read verified destinations" on public.alert_destinations
  for select to authenticated using ((select auth.uid()) = owner_id);

insert into public.alert_destinations(owner_id) select distinct owner_id from public.alert_rules;
alter table public.alert_rules
  add column destination_id uuid,
  add column cooldown_minutes integer not null default 15 check (cooldown_minutes between 1 and 10080),
  add column hysteresis numeric not null default 10 check (hysteresis >= 0 and hysteresis::text not in ('NaN','Infinity','-Infinity')),
  add column last_fresh_check timestamptz,
  add column input_expires_at timestamptz,
  add column next_check timestamptz,
  add column monitoring_state text not null default 'configured' check (monitoring_state in ('configured','fresh','unavailable','paused')),
  add column unresolved_event_id uuid,
  add constraint alert_rules_finite_threshold check (threshold::text not in ('NaN','Infinity','-Infinity')),
  add constraint alert_rules_id_owner unique (id, owner_id);
update public.alert_rules r set destination_id = d.id from public.alert_destinations d where d.owner_id = r.owner_id;
alter table public.alert_rules alter column destination_id set not null;
alter table public.alert_rules add constraint alert_rules_owned_destination
  foreign key (destination_id, owner_id) references public.alert_destinations(id, owner_id);

-- Historical events survive rule deletion; queued work is cancelled first.
alter table public.alert_events drop constraint alert_events_rule_id_fkey;
alter table public.alert_events alter column rule_id drop not null;
alter table public.alert_events
  add constraint alert_events_owned_rule foreign key (rule_id, owner_id)
    references public.alert_rules(id, owner_id) on delete set null (rule_id),
  add constraint alert_events_id_owner unique (id, owner_id),
  add constraint alert_events_finite_value check (value::text not in ('NaN','Infinity','-Infinity') and threshold::text not in ('NaN','Infinity','-Infinity'));
alter table public.alert_outbox drop constraint alert_outbox_event_id_fkey;
alter table public.alert_outbox
  add constraint alert_outbox_owned_event foreign key (event_id, owner_id)
    references public.alert_events(id, owner_id) on delete cascade,
  add column lease_token uuid,
  add column not_before timestamptz not null default now();
alter table public.alert_outbox drop constraint alert_outbox_state_check;
alter table public.alert_outbox add constraint alert_outbox_state_check check (state in ('pending','claimed','delivered','failed','cancelled'));

-- Limit browser writes to configuration; runtime metadata is worker-owned.
revoke insert, update on public.alert_rules from authenticated;
grant insert (owner_id, authority, subaccount_id, metric, direction, threshold, cadence_minutes, timezone, destination_id, enabled, cooldown_minutes, hysteresis)
  on public.alert_rules to authenticated;
grant update (direction, threshold, cadence_minutes, timezone, enabled, cooldown_minutes, hysteresis, destination_id)
  on public.alert_rules to authenticated;
grant all on public.alert_destinations, public.alert_rules, public.alert_events, public.alert_outbox to service_role;

create function public.guard_alert_rule() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(NEW.owner_id::text, 1909));
    if (select count(*) from public.alert_rules where owner_id = NEW.owner_id) >= 20 then
      raise exception 'Alert rule limit reached' using errcode = '23514';
    end if;
    NEW.version := 1;
    NEW.created_at := now();
  else
    if NEW.owner_id <> OLD.owner_id or NEW.id <> OLD.id or NEW.authority <> OLD.authority or NEW.subaccount_id <> OLD.subaccount_id then
      raise exception 'Alert identity is immutable' using errcode = '23514';
    end if;
    if row(NEW.direction,NEW.threshold,NEW.cadence_minutes,NEW.timezone,NEW.enabled,NEW.cooldown_minutes,NEW.hysteresis,NEW.destination_id)
       is distinct from row(OLD.direction,OLD.threshold,OLD.cadence_minutes,OLD.timezone,OLD.enabled,OLD.cooldown_minutes,OLD.hysteresis,OLD.destination_id) then
      NEW.version := OLD.version + 1;
      NEW.next_check := null;
      NEW.monitoring_state := case when NEW.enabled then 'configured' else 'paused' end;
      update public.alert_outbox o set state = 'cancelled', lease_token = null, lease_until = null, last_error = 'Rule changed or paused.'
        from public.alert_events e where e.rule_id = OLD.id and e.id = o.event_id and o.state in ('pending','claimed','failed');
      update public.alert_events set state = 'suppressed', claimed_by = null, claimed_until = null
        where rule_id = OLD.id and state in ('queued','claimed','failed');
    else
      NEW.version := OLD.version;
    end if;
    NEW.created_at := OLD.created_at;
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name = NEW.timezone) then
    raise exception 'Invalid timezone' using errcode = '23514';
  end if;
  if NEW.enabled and not exists(select 1 from public.alert_destinations where id = NEW.destination_id and owner_id = NEW.owner_id and enabled and verified_at is not null) then
    raise exception 'Verified destination unavailable' using errcode = '23514';
  end if;
  NEW.updated_at := now();
  return NEW;
end $$;
revoke all on function public.guard_alert_rule() from public;
create trigger guard_alert_rule before insert or update on public.alert_rules for each row execute function public.guard_alert_rule();

create function public.cancel_deleted_alert_rule() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.alert_outbox o set state = 'cancelled', lease_token = null, lease_until = null, last_error = 'Rule deleted.'
    from public.alert_events e where e.rule_id = OLD.id and e.id = o.event_id and o.state in ('pending','claimed','failed');
  update public.alert_events set state = 'suppressed', claimed_by = null, claimed_until = null
    where rule_id = OLD.id and state in ('queued','claimed','failed');
  return OLD;
end $$;
revoke all on function public.cancel_deleted_alert_rule() from public;
create trigger cancel_deleted_alert_rule before delete on public.alert_rules for each row execute function public.cancel_deleted_alert_rule();

-- A claim is committed before an attempted delivery. A new random token fences
-- expired workers. No user role can call worker functions or change work state.
create function public.claim_alert_delivery(worker_id text)
returns setof public.alert_outbox language plpgsql security definer set search_path = '' as $$
declare claimed public.alert_outbox;
begin
  if worker_id is null or char_length(worker_id) not between 1 and 160 then raise exception 'Invalid worker identity'; end if;
  select o.* into claimed from public.alert_outbox o
    join public.alert_events e on e.id = o.event_id and e.owner_id = o.owner_id
    join public.alert_rules r on r.id = e.rule_id and r.owner_id = e.owner_id and r.version = e.rule_version and r.enabled
      and r.monitoring_state = 'fresh' and r.input_expires_at > now() and r.last_fresh_check > now() - interval '120 seconds' and r.last_fresh_check <= now() + interval '5 seconds'
    join public.alert_destinations d on d.id = r.destination_id and d.owner_id = r.owner_id and d.enabled
    where o.attempts < 5 and o.not_before <= now() and
      (o.state in ('pending','failed') or (o.state = 'claimed' and o.lease_until <= now()))
    order by o.created_at for update of o skip locked limit 1;
  if not found then return; end if;
  update public.alert_outbox set state = 'claimed', attempts = attempts + 1,
    lease_token = gen_random_uuid(), lease_until = now() + interval '30 seconds'
    where id = claimed.id returning * into claimed;
  update public.alert_events set state = 'claimed', claimed_by = worker_id, claimed_until = claimed.lease_until where id = claimed.event_id;
  return next claimed;
end $$;
revoke all on function public.claim_alert_delivery(text) from public, anon, authenticated;
grant execute on function public.claim_alert_delivery(text) to service_role;

create function public.finish_alert_delivery(item_id uuid, token uuid, succeeded boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare item public.alert_outbox; valid boolean;
begin
  select * into item from public.alert_outbox where id = item_id for update;
  if not found or item.state <> 'claimed' or item.lease_token is distinct from token or item.lease_until <= now() then return false; end if;
  select exists(select 1 from public.alert_events e
    join public.alert_rules r on r.id = e.rule_id and r.owner_id = e.owner_id and r.enabled and r.version = e.rule_version
    join public.alert_destinations d on d.id = r.destination_id and d.owner_id = r.owner_id and d.enabled
    where e.id = item.event_id and e.owner_id = item.owner_id) into valid;
  if not valid then
    update public.alert_outbox set state = 'cancelled', lease_token = null, lease_until = null where id = item.id;
    update public.alert_events set state = 'suppressed', claimed_by = null, claimed_until = null where id = item.event_id;
    return false;
  end if;
  if not exists(select 1 from public.alert_events e join public.alert_rules r on r.id=e.rule_id
    where e.id=item.event_id and r.monitoring_state='fresh' and r.input_expires_at > now()
      and r.last_fresh_check > now()-interval '120 seconds' and r.last_fresh_check <= now()+interval '5 seconds') then
    update public.alert_outbox set state='pending', attempts=greatest(0, attempts-1), lease_token=null, lease_until=null where id=item.id;
    update public.alert_events set state='queued', claimed_by=null, claimed_until=null where id=item.event_id;
    return false;
  end if;
  update public.alert_outbox set state = case when succeeded then 'delivered' else 'failed' end,
    delivered_at = case when succeeded then now() else null end,
    not_before = now() + make_interval(secs => least(3600, power(2, item.attempts)::integer * 5)),
    lease_token = null, lease_until = null,
    last_error = case when succeeded then null else 'Mock sink unavailable.' end
    where id = item.id;
  update public.alert_events set state = case when succeeded then 'delivered' else 'failed' end,
    delivered_at = case when succeeded then now() else null end, claimed_until = null where id = item.event_id;
  return true;
end $$;
revoke all on function public.finish_alert_delivery(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_alert_delivery(uuid, uuid, boolean) to service_role;

-- Retain observations for 30 days; never prune unresolved/queued work. Invoked
-- explicitly by a protected scheduled worker, not by a public request.
create function public.prune_alert_history() returns bigint language plpgsql security definer set search_path = '' as $$
declare removed bigint;
begin
  delete from public.alert_events e where e.observed_at < now() - interval '30 days'
    and e.state in ('delivered','suppressed')
    and not exists(select 1 from public.alert_rules r where r.unresolved_event_id = e.id)
    and not exists(select 1 from public.alert_outbox o where o.event_id = e.id and o.state not in ('delivered','cancelled'));
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function public.prune_alert_history() from public, anon, authenticated;
grant execute on function public.prune_alert_history() to service_role;


-- Delivery state can evolve, while the observed payload remains historical.
create function public.guard_alert_event() returns trigger language plpgsql set search_path = '' as $$
begin
  if row(NEW.id,NEW.owner_id,NEW.rule_version,NEW.event_key,NEW.observed_at,NEW.value,NEW.threshold,NEW.reason)
    is distinct from row(OLD.id,OLD.owner_id,OLD.rule_version,OLD.event_key,OLD.observed_at,OLD.value,OLD.threshold,OLD.reason)
    or (NEW.rule_id is distinct from OLD.rule_id and NEW.rule_id is not null) then
    raise exception 'Alert observations are immutable' using errcode = '23514';
  end if;
  return NEW;
end $$;
revoke all on function public.guard_alert_event() from public;
create trigger guard_alert_event before update on public.alert_events for each row execute function public.guard_alert_event();
