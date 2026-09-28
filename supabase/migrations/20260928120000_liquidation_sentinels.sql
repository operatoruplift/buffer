-- Liquidation-distance sentinels and signed webhook destinations.
-- Additive: existing maintenance_headroom rules, Discord destinations, events,
-- receipts and the worker credential keep their rows and semantics.
alter table public.alert_rules drop constraint alert_rules_metric_check;
alter table public.alert_rules add constraint alert_rules_metric_check check (metric in ('maintenance_headroom','liquidation_distance'));
alter table public.alert_rules drop constraint alert_rules_unit_check;
alter table public.alert_rules add constraint alert_rules_unit_check check (unit in ('USD','%'));
alter table public.alert_rules add column market text,
  add constraint alert_rules_market_format check (market is null or market ~ '^[A-Z0-9]{1,16}-PERP$'),
  add constraint alert_rules_metric_scope check ((metric='maintenance_headroom' and market is null and unit='USD') or (metric='liquidation_distance' and market is not null and unit='%'));
drop index public.alert_rules_one_live_scope;
create unique index alert_rules_one_live_scope on public.alert_rules(owner_id,provider,network,authority,subaccount_id,metric,coalesce(market,'')) where destination in ('discord','webhook');
comment on column public.alert_rules.market is 'Perpetual market symbol for liquidation_distance rules; null for maintenance_headroom.';

alter table public.alert_destinations drop constraint alert_destinations_provider_check;
alter table public.alert_destinations add constraint alert_destinations_provider_check check(provider in ('mock','discord','webhook'));
alter table public.alert_destinations drop constraint alert_destinations_discord_config;
alter table public.alert_destinations add constraint alert_destinations_hosted_config check(provider='mock' or (config_ref is not null and fingerprint is not null));
alter table public.alert_rules drop constraint alert_rules_destination_check;
alter table public.alert_rules add constraint alert_rules_destination_check check(destination in ('mock','discord','webhook'));

create or replace function public.guard_alert_rule() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(NEW.owner_id::text,1909));
    if (select count(*) from public.alert_rules where owner_id=NEW.owner_id)>=20 then raise exception 'Alert rule limit reached' using errcode='23514'; end if;
    NEW.version:=1; NEW.created_at:=now();
  else
    if row(NEW.owner_id,NEW.id,NEW.authority,NEW.subaccount_id,NEW.provider,NEW.network,NEW.unit,NEW.metric,NEW.market)
      is distinct from row(OLD.owner_id,OLD.id,OLD.authority,OLD.subaccount_id,OLD.provider,OLD.network,OLD.unit,OLD.metric,OLD.market)
      then raise exception 'Alert identity is immutable' using errcode='23514'; end if;
    if row(NEW.direction,NEW.threshold,NEW.cadence_minutes,NEW.timezone,NEW.enabled,NEW.cooldown_minutes,NEW.hysteresis,NEW.destination_id)
      is distinct from row(OLD.direction,OLD.threshold,OLD.cadence_minutes,OLD.timezone,OLD.enabled,OLD.cooldown_minutes,OLD.hysteresis,OLD.destination_id) then
      NEW.version:=OLD.version+1; NEW.next_check:=null; NEW.runtime_state:=null; NEW.check_token:=null; NEW.check_lease_until:=null;
      NEW.monitoring_state:=case when NEW.enabled then 'configured' else 'paused' end;
      update public.alert_outbox o set state='cancelled',lease_token=null,lease_until=null,last_error='Rule changed or paused before transmission.'
        from public.alert_events e where e.rule_id=OLD.id and e.id=o.event_id and o.state in ('pending','claimed','failed');
      update public.alert_events set state='suppressed',claimed_by=null,claimed_until=null where rule_id=OLD.id and state in ('queued','claimed','failed');
    else NEW.version:=OLD.version; end if;
    NEW.created_at:=OLD.created_at;
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=NEW.timezone) then raise exception 'Invalid timezone' using errcode='23514'; end if;
  if NEW.enabled and (TG_OP='INSERT' or NEW.version is distinct from OLD.version) and not exists(select 1 from public.alert_destinations where id=NEW.destination_id and owner_id=NEW.owner_id and enabled and verified_at is not null)
    then raise exception 'Verified destination unavailable' using errcode='23514'; end if;
  NEW.updated_at:=now(); return NEW;
end $$;

create or replace function public.buffer_monitor_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); result jsonb;
begin
  if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select jsonb_build_object(
    'rules',coalesce((select jsonb_agg(to_jsonb(r)-'check_token'-'check_lease_until'||jsonb_build_object('threshold',r.threshold::text,'hysteresis',r.hysteresis::text)) from (select * from public.alert_rules where owner_id=owner and destination in ('discord','webhook') order by created_at desc limit 20) r),'[]'::jsonb),
    'destinations',coalesce((select jsonb_agg(to_jsonb(d)) from (select * from public.alert_destinations where owner_id=owner and provider in ('discord','webhook')) d),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('value',e.value::text,'threshold',e.threshold::text)) from (select e.*,o.attempts,o.last_error from public.alert_events e join public.alert_outbox o on o.event_id=e.id where e.owner_id=owner and e.observation->>'mode' in ('test','production') order by e.observed_at desc limit 30) e),'[]'::jsonb),
    'heartbeat',(select jsonb_build_object('started_at',started_at,'completed_at',completed_at,'outcome',outcome,'mode',mode) from private.buffer_monitor_runs where run_key like 'cron:%' order by started_at desc limit 1)
  ) into result;
  return result;
end $$;

create or replace function public.buffer_monitor_mutate(p_action text,p_id uuid default null,p_config jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); r public.alert_rules; d public.alert_destinations; new_id uuid; chosen_metric text; chosen_market text;
begin
  if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_config is null or jsonb_typeof(p_config)<>'object' or pg_column_size(p_config)>4096
    or exists(select 1 from jsonb_object_keys(p_config) k where k not in ('authority','subaccountId','direction','threshold','cadenceMinutes','timezone','cooldownMinutes','hysteresis','destinationId','enabled','metric','market')) then raise exception 'Invalid rule fields' using errcode='22023'; end if;
  if p_action<>'create' then
    select * into r from public.alert_rules where id=p_id and owner_id=owner and destination in ('discord','webhook') for update;
    if not found then raise exception 'Rule not found' using errcode='P0002'; end if;
  end if;
  if p_action='delete' then delete from public.alert_rules where id=r.id; return r.id; end if;
  if p_action not in ('create','update') then raise exception 'Invalid operation' using errcode='22023'; end if;
  if p_action='update' and (p_config ? 'authority' or p_config ? 'subaccountId' or p_config ? 'metric' or p_config ? 'market') then raise exception 'Account identity is immutable' using errcode='22023'; end if;
  select * into d from public.alert_destinations where id=coalesce((p_config->>'destinationId')::uuid,r.destination_id) and owner_id=owner and provider in ('discord','webhook') and ((enabled and verified_at is not null) or (p_action='update' and p_config->>'enabled'='false'));
  if not found then raise exception 'Verified destination unavailable' using errcode='23514'; end if;
  if p_config ? 'threshold' and (jsonb_typeof(p_config->'threshold')<>'string' or not (p_config->>'threshold' ~ '^-?[0-9]{1,18}(\.[0-9]{1,8})?$')) then raise exception 'Invalid threshold' using errcode='22023'; end if;
  if p_config ? 'hysteresis' and (jsonb_typeof(p_config->'hysteresis')<>'string' or not (p_config->>'hysteresis' ~ '^[0-9]{1,18}(\.[0-9]{1,8})?$')) then raise exception 'Invalid hysteresis' using errcode='22023'; end if;
  if p_action='create' then
    if not (p_config ?& array['authority','subaccountId','direction','threshold','cadenceMinutes','timezone','cooldownMinutes','hysteresis','destinationId','enabled']) or not (p_config->>'authority' ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$') then raise exception 'Complete canonical rule required' using errcode='22023'; end if;
    chosen_metric:=coalesce(p_config->>'metric','maintenance_headroom');
    if chosen_metric not in ('maintenance_headroom','liquidation_distance') then raise exception 'Unsupported metric' using errcode='22023'; end if;
    if chosen_metric='liquidation_distance' then
      chosen_market:=p_config->>'market';
      if chosen_market is null or not (chosen_market ~ '^[A-Z0-9]{1,16}-PERP$') then raise exception 'A liquidation-distance rule names one perpetual market' using errcode='22023'; end if;
    elsif p_config ? 'market' then raise exception 'Only liquidation-distance rules name a market' using errcode='22023';
    end if;
    insert into public.alert_rules(owner_id,authority,subaccount_id,direction,threshold,cadence_minutes,timezone,cooldown_minutes,hysteresis,destination_id,destination,metric,market,unit,enabled)
      values(owner,p_config->>'authority',(p_config->>'subaccountId')::integer,p_config->>'direction',(p_config->>'threshold')::numeric,(p_config->>'cadenceMinutes')::integer,p_config->>'timezone',(p_config->>'cooldownMinutes')::integer,(p_config->>'hysteresis')::numeric,d.id,d.provider,chosen_metric,chosen_market,case when chosen_metric='liquidation_distance' then '%' else 'USD' end,(p_config->>'enabled')::boolean) returning id into new_id;
  else
    update public.alert_rules set direction=coalesce(p_config->>'direction',direction),threshold=coalesce((p_config->>'threshold')::numeric,threshold),cadence_minutes=coalesce((p_config->>'cadenceMinutes')::integer,cadence_minutes),timezone=coalesce(p_config->>'timezone',timezone),cooldown_minutes=coalesce((p_config->>'cooldownMinutes')::integer,cooldown_minutes),hysteresis=coalesce((p_config->>'hysteresis')::numeric,hysteresis),destination_id=d.id,destination=d.provider,enabled=coalesce((p_config->>'enabled')::boolean,enabled) where id=r.id returning id into new_id;
  end if;
  return new_id;
end $$;

create or replace function public.buffer_monitor_worker(p_secret text,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare r public.alert_rules; d public.alert_destinations; e public.alert_events; o public.alert_outbox;
  chosen_provider text; token uuid; event_id uuid; monitor jsonb; observation jsonb; next_state text; output jsonb; requested_owner uuid;
begin
  if p_secret is null or length(p_secret)<32 or length(p_secret)>256 or not exists(select 1 from private.buffer_monitor_credentials where id and secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex')) then raise exception 'Worker authentication required' using errcode='42501'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>20000 then raise exception 'Invalid worker payload' using errcode='22023'; end if;
  if p_action='next_work' then
    if p_data->>'sendEnabled'='true' then
      output:=public.buffer_monitor_worker(p_secret,'claim_delivery',p_data);
      if output is not null then return jsonb_build_object('kind','delivery','work',output); end if;
      output:=public.buffer_monitor_worker(p_secret,'claim_receipt',p_data);
      if output is not null then return jsonb_build_object('kind','receipt','work',output); end if;
    end if;
    output:=public.buffer_monitor_worker(p_secret,'claim_check',p_data);
    if output is not null then return jsonb_build_object('kind','check','work',output); end if;
    return null;
  elsif p_action='start' then
    if not(p_data->>'runKey' ~ '^(cron:[0-9]{1,16}|manual:[0-9a-f-]{36})$') or p_data->>'mode' not in ('dry_run','send') then raise exception 'Invalid run identity' using errcode='22023'; end if;
    if p_data->>'runKey' like 'manual:%' then
      requested_owner:=(p_data->>'ownerId')::uuid;
      if requested_owner is null then raise exception 'Manual check owner required' using errcode='22023'; end if;
      perform pg_advisory_xact_lock(hashtextextended(requested_owner::text,202009));
      if (select count(*) from private.buffer_monitor_runs where owner_id=requested_owner and started_at>now()-interval '1 minute')>=30 then return jsonb_build_object('duplicate',true,'throttled',true); end if;
    end if;
    insert into private.buffer_monitor_runs(run_key,mode,owner_id) values(p_data->>'runKey',p_data->>'mode',requested_owner) on conflict do nothing;
    if not found then return jsonb_build_object('duplicate',true); end if;
    delete from private.buffer_monitor_runs where started_at<now()-interval '7 days';
    -- Transmitting without an ACK is uncertain, never another queued POST.
    update public.alert_events e set state='unknown_outcome' from public.alert_outbox o where o.event_id=e.id and o.state='sending' and o.lease_until<=now();
    update public.alert_outbox set state='unknown_outcome',lease_token=null,lease_until=null,retryable=false,last_error='Transmission outcome unknown; no automatic resend.' where state='sending' and lease_until<=now();
    update public.alert_outbox o set state='cancelled',lease_token=null,lease_until=null,last_error='Observation expired before transmission.' from public.alert_events e
      where e.id=o.event_id and e.observed_at<=now()-interval '120 seconds' and o.state in ('pending','claimed','failed');
    update public.alert_events e set state='suppressed' from public.alert_outbox o where o.event_id=e.id and o.state='cancelled' and e.state in ('queued','claimed','failed');
    update public.alert_rules set monitoring_state='unavailable',last_error='The last observation expired; awaiting a new check.'
      where monitoring_state='fresh' and (input_expires_at<=now() or last_fresh_check<=now()-interval '120 seconds');
    return jsonb_build_object('duplicate',false);
  elsif p_action='end' then
    update private.buffer_monitor_runs set completed_at=now(),outcome=case when p_data->>'outcome'='ok' then 'ok' else 'unavailable' end where run_key=p_data->>'runKey';
    return '{}'::jsonb;
  elsif p_action='destination' then
    if coalesce(p_data->>'fingerprint','') !~ '^[0-9a-f]{64}$' or length(coalesce(p_data->>'label','')) not between 1 and 80 or length(coalesce(p_data->>'maskedDestination','')) not between 1 and 120 or p_data->>'configRef' is null then raise exception 'Invalid verified destination' using errcode='22023'; end if;
    requested_owner:=(p_data->>'ownerId')::uuid;
    chosen_provider:=coalesce(p_data->>'provider','discord');
    if chosen_provider not in ('discord','webhook') then raise exception 'Unsupported destination provider' using errcode='22023'; end if;
    select * into d from public.alert_destinations where owner_id=requested_owner and provider=chosen_provider for update;
    if found and (d.fingerprint is distinct from p_data->>'fingerprint' or d.config_ref is distinct from (p_data->>'configRef')::uuid) then
      update public.alert_rules set enabled=false where destination_id=d.id;
    end if;
    insert into public.alert_destinations(owner_id,provider,config_ref,fingerprint,label,masked_destination,verified_at,enabled)
      values(requested_owner,chosen_provider,(p_data->>'configRef')::uuid,p_data->>'fingerprint',p_data->>'label',p_data->>'maskedDestination',now(),true)
      on conflict(owner_id,provider) do update set config_ref=excluded.config_ref,fingerprint=excluded.fingerprint,label=excluded.label,masked_destination=excluded.masked_destination,verified_at=now(),enabled=true;
    return '{}'::jsonb;
  elsif p_action='destination_unavailable' then
    chosen_provider:=coalesce(p_data->>'provider','discord');
    if chosen_provider not in ('discord','webhook') then raise exception 'Unsupported destination provider' using errcode='22023'; end if;
    update public.alert_destinations set enabled=false where owner_id=(p_data->>'ownerId')::uuid and provider=chosen_provider;
    return '{}'::jsonb;
  elsif p_action='claim_check' then
    perform pg_advisory_xact_lock(2209202601);
    if exists(select 1 from public.alert_rules where check_lease_until>now()) then return null; end if;
    select * into r from public.alert_rules where destination in ('discord','webhook') and enabled and exists(select 1 from public.alert_destinations d where d.id=destination_id and d.enabled and d.verified_at is not null)
      and (p_data->>'ruleId' is null or id=(p_data->>'ruleId')::uuid)
      and (p_data->>'ownerId' is null or owner_id=(p_data->>'ownerId')::uuid)
      and (check_lease_until is null or check_lease_until<=now())
      and (last_attempt_at is null or last_attempt_at<=now()-interval '60 seconds')
      and (p_data->>'ruleId' is not null or next_check is null or next_check<=now())
      order by next_check nulls first,created_at for update skip locked limit 1;
    if not found then return null; end if;
    token:=gen_random_uuid();
    update public.alert_rules set check_token=token,check_lease_until=now()+interval '45 seconds',last_attempt_at=now() where id=r.id returning * into r;
    return to_jsonb(r)||jsonb_build_object('threshold',r.threshold::text,'hysteresis',r.hysteresis::text);
  elsif p_action='complete_check' then
    select * into r from public.alert_rules where id=(p_data->>'ruleId')::uuid and check_token=(p_data->>'token')::uuid and check_lease_until>now() and version=(p_data->>'version')::integer and enabled for update;
    if not found then return jsonb_build_object('fenced',true); end if;
    monitor:=p_data->'monitor'; observation:=p_data->'observation';
    if p_data->>'problem' is not null then
      update public.alert_rules set monitoring_state='unavailable',last_error=left(p_data->>'problem',300),next_check=now()+make_interval(mins=>cadence_minutes),check_token=null,check_lease_until=null where id=r.id;
      return jsonb_build_object('available',false);
    end if;
    if jsonb_typeof(monitor) is distinct from 'object' or jsonb_typeof(observation) is distinct from 'object' or monitor->>'ruleId' is distinct from r.id::text or monitor->>'ownerId' is distinct from r.owner_id::text or (monitor->>'ruleVersion')::integer is distinct from r.version or coalesce(monitor->>'status','') not in ('ready','breached')
      or coalesce(observation->>'mode','') not in ('test','production') or jsonb_typeof(monitor->'breached') is distinct from 'boolean' or monitor->>'nextCheckAt' is null or (monitor->>'episode')::integer is null or (monitor->>'episode')::integer<0 or (monitor->>'triggeredEpisode')::integer is null or (monitor->>'triggeredEpisode')::integer>(monitor->>'episode')::integer
      or observation->>'provider' is distinct from 'velocity' or observation->>'network' is distinct from 'mainnet-beta' or observation->>'authority' is distinct from r.authority or (observation->>'subaccountId')::integer is distinct from r.subaccount_id
      or observation->>'metric' is distinct from r.metric or observation->>'unit' is distinct from r.unit or observation->>'market' is distinct from r.market
      or monitor->>'lastFreshCheck' is null or monitor->>'inputExpiresAt' is null or (monitor->>'lastFreshCheck')::timestamptz<=now()-interval '120 seconds' or (monitor->>'lastFreshCheck')::timestamptz>now()+interval '5 seconds' or (monitor->>'inputExpiresAt')::timestamptz<=now()
      then raise exception 'Invalid observation scope or freshness' using errcode='22023'; end if;
    update public.alert_rules set monitoring_state='fresh',last_error=null,last_fresh_check=(monitor->>'lastFreshCheck')::timestamptz,input_expires_at=(monitor->>'inputExpiresAt')::timestamptz,next_check=(monitor->>'nextCheckAt')::timestamptz,runtime_state=monitor,check_token=null,check_lease_until=null where id=r.id;
    if p_data->'event' is not null and p_data->'event'<>'null'::jsonb then
      if (select count(*) from public.alert_events where owner_id=r.owner_id and observed_at>now()-interval '1 day')>=100 then
        update public.alert_rules set last_error='Daily event quota reached.' where id=r.id; return jsonb_build_object('quota',true);
      end if;
      select * into d from public.alert_destinations where id=r.destination_id;
      insert into public.alert_events(rule_id,rule_version,owner_id,event_key,state,observed_at,value,threshold,reason,observation,destination_id,destination_fingerprint)
        values(r.id,r.version,r.owner_id,p_data->'event'->>'key','queued',(p_data->'event'->>'observedAt')::timestamptz,(p_data->'event'->>'value')::numeric,r.threshold,left(p_data->'event'->>'reason',512),observation,r.destination_id,d.fingerprint)
        on conflict(owner_id,event_key) do nothing returning id into event_id;
      if event_id is not null then
        insert into public.alert_outbox(event_id,owner_id,state) values(event_id,r.owner_id,'pending');
        update public.alert_rules set unresolved_event_id=event_id where id=r.id;
      end if;
    end if;
    return jsonb_build_object('available',true,'eventId',event_id);
  elsif p_action='claim_delivery' then
    perform pg_advisory_xact_lock(2209202602);
    if exists(select 1 from public.alert_outbox where state in ('claimed','sending') and lease_until>now()) then return null; end if;
    select o.* into o from public.alert_outbox o join public.alert_events e on e.id=o.event_id
      join public.alert_rules r on r.id=e.rule_id and r.owner_id=e.owner_id and r.version=e.rule_version and r.enabled and r.destination in ('discord','webhook') and r.monitoring_state='fresh' and r.input_expires_at>now() and r.last_fresh_check>now()-interval '120 seconds'
      join public.alert_destinations d on d.id=e.destination_id and d.owner_id=e.owner_id and d.enabled and d.verified_at is not null and d.fingerprint=e.destination_fingerprint
      where o.state in ('pending','failed','claimed') and o.retryable and o.attempts<3 and o.not_before<=now() and (o.lease_until is null or o.lease_until<=now()) and e.observed_at>now()-interval '120 seconds'
      and (p_data->>'ownerId' is null or o.owner_id=(p_data->>'ownerId')::uuid)
      and (select coalesce(sum(recent.attempts),0) from public.alert_outbox recent where recent.owner_id=o.owner_id and recent.send_started_at>now()-interval '1 hour')<10
      order by o.created_at for update of o skip locked limit 1;
    if not found then return null; end if;
    update public.alert_outbox set state='claimed',lease_token=gen_random_uuid(),lease_until=now()+interval '30 seconds' where id=o.id returning * into o;
    select * into e from public.alert_events where id=o.event_id;
    select * into d from public.alert_destinations where id=e.destination_id;
    return jsonb_build_object('outbox',to_jsonb(o),'event',to_jsonb(e)||jsonb_build_object('value',e.value::text,'threshold',e.threshold::text),'destination',to_jsonb(d));
  elsif p_action='fail_delivery' then
    select * into o from public.alert_outbox where id=(p_data->>'outboxId')::uuid and lease_token=(p_data->>'token')::uuid and state='claimed' and lease_until>now() for update;
    if found then
      update public.alert_outbox set state='failed',attempts=attempts+1,retryable=coalesce((p_data->>'retryable')::boolean,false),
        not_before=now()+make_interval(secs=>least(3600,greatest(2,ceil(coalesce((p_data->>'retryAfterMs')::numeric,1000)/1000.0)::integer))),lease_token=null,lease_until=null,last_error=left(p_data->>'errorCode',120) where id=o.id;
      update public.alert_events set state='failed' where id=o.event_id;
    end if;
    return '{}'::jsonb;
  elsif p_action='suppress_delivery' then
    select * into o from public.alert_outbox where id=(p_data->>'outboxId')::uuid and lease_token=(p_data->>'token')::uuid and state='claimed' and lease_until>now() for update;
    if found then
      update public.alert_outbox set state='cancelled',lease_token=null,lease_until=null,last_error=left(p_data->>'reason',300) where id=o.id;
      update public.alert_events set state='suppressed' where id=o.event_id;
    end if;
    return '{}'::jsonb;
  elsif p_action='begin_send' then
    select * into o from public.alert_outbox where id=(p_data->>'outboxId')::uuid and lease_token=(p_data->>'token')::uuid and state='claimed' and lease_until>now() for update;
    if not found then return jsonb_build_object('send',false); end if;
    select * into e from public.alert_events where id=o.event_id;
    select * into r from public.alert_rules where id=e.rule_id and owner_id=e.owner_id and enabled and version=e.rule_version and monitoring_state='fresh' and input_expires_at>now() and last_fresh_check>now()-interval '120 seconds';
    select * into d from public.alert_destinations where id=e.destination_id and enabled and verified_at is not null and fingerprint=e.destination_fingerprint and fingerprint=p_data->>'fingerprint';
    if r.id is null or d.id is null or e.observed_at<=now()-interval '120 seconds' then
      update public.alert_outbox set state='cancelled',lease_token=null,lease_until=null,last_error='Rule, destination, or observation became unavailable before send.' where id=o.id;
      update public.alert_events set state='suppressed' where id=e.id;
      return jsonb_build_object('send',false);
    end if;
    update public.alert_outbox set state='sending',attempts=attempts+1,send_started_at=now(),lease_until=now()+interval '30 seconds' where id=o.id;
    update public.alert_events set state='sending',preview=left(p_data->>'preview',1900) where id=e.id;
    return jsonb_build_object('send',true);
  elsif p_action='finish_send' then
    select * into o from public.alert_outbox where id=(p_data->>'outboxId')::uuid and lease_token=(p_data->>'token')::uuid and state='sending' and lease_until>now() for update;
    if not found then return jsonb_build_object('fenced',true); end if;
    next_state:=p_data->>'state';
    select * into e from public.alert_events where id=o.event_id;
    select * into d from public.alert_destinations where id=e.destination_id;
    if next_state not in ('accepted_by_provider','delivered','failed','unknown_outcome') then raise exception 'Invalid delivery result' using errcode='22023'; end if;
    -- A signed webhook acknowledgement (2xx) is that destination's receipt; Discord acceptance still awaits a matching message read.
    if next_state='delivered' and d.provider is distinct from 'webhook' then raise exception 'Only webhook destinations are delivered on acknowledgement' using errcode='22023'; end if;
    if next_state='accepted_by_provider' and d.provider='webhook' then raise exception 'Webhook destinations record delivery, not provider acceptance' using errcode='22023'; end if;
    if next_state='accepted_by_provider' and (coalesce(p_data->>'messageId','') !~ '^[0-9]{16,22}$' or coalesce(p_data->>'channelId','') !~ '^[0-9]{16,22}$' or coalesce(p_data->>'contentHash','') !~ '^[0-9a-f]{64}$') then raise exception 'Invalid acceptance receipt' using errcode='22023'; end if;
    if next_state='delivered' and (coalesce(p_data->>'messageId','') !~ '^[A-Za-z0-9._:-]{1,120}$' or coalesce(p_data->>'channelId','') !~ '^[A-Za-z0-9._:-]{1,120}$' or coalesce(p_data->>'contentHash','') !~ '^[0-9a-f]{64}$') then raise exception 'Invalid acknowledgement receipt' using errcode='22023'; end if;
    update public.alert_outbox set state=next_state,retryable=case when next_state='failed' then coalesce((p_data->>'retryable')::boolean,false) else false end,
      delivered_at=case when next_state='delivered' then now() else delivered_at end,
      not_before=now()+make_interval(secs=>least(3600,greatest(2,ceil(coalesce((p_data->>'retryAfterMs')::numeric,1000)/1000.0)::integer))),lease_token=null,lease_until=null,last_error=case when next_state='delivered' then null else left(p_data->>'errorCode',120) end where id=o.id;
    update public.alert_events set state=next_state,accepted_at=case when next_state in ('accepted_by_provider','delivered') then now() else accepted_at end,
      delivered_at=case when next_state='delivered' then now() else delivered_at end,
      provider_message_id=case when next_state in ('accepted_by_provider','delivered') then p_data->>'messageId' else provider_message_id end,
      provider_channel_id=case when next_state in ('accepted_by_provider','delivered') then p_data->>'channelId' else provider_channel_id end,
      content_hash=case when next_state in ('accepted_by_provider','delivered') then p_data->>'contentHash' else content_hash end where id=o.event_id;
    if next_state='delivered' then update public.alert_rules set unresolved_event_id=null where unresolved_event_id=o.event_id; end if;
    return jsonb_build_object('recorded',true);
  elsif p_action='claim_receipt' then
    select o.* into o from public.alert_outbox o join public.alert_events e on e.id=o.event_id
      where o.state='accepted_by_provider' and o.receipt_attempts<5 and o.not_before<=now() and (o.lease_until is null or o.lease_until<=now())
      and (p_data->>'ownerId' is null or o.owner_id=(p_data->>'ownerId')::uuid) and e.provider_message_id is not null
      order by o.created_at for update of o skip locked limit 1;
    if not found then return null; end if;
    update public.alert_outbox set lease_token=gen_random_uuid(),lease_until=now()+interval '20 seconds',receipt_attempts=receipt_attempts+1 where id=o.id returning * into o;
    select * into e from public.alert_events where id=o.event_id;
    select * into d from public.alert_destinations where id=e.destination_id;
    return jsonb_build_object('outbox',to_jsonb(o),'event',to_jsonb(e)||jsonb_build_object('value',e.value::text,'threshold',e.threshold::text),'destination',to_jsonb(d));
  elsif p_action='finish_receipt' then
    select * into o from public.alert_outbox where id=(p_data->>'outboxId')::uuid and lease_token=(p_data->>'token')::uuid and state='accepted_by_provider' and lease_until>now() for update;
    if not found then return jsonb_build_object('fenced',true); end if;
    select * into e from public.alert_events where id=o.event_id;
    if p_data->>'state'='delivered' then
      if e.provider_message_id is distinct from p_data->>'messageId' or e.provider_channel_id is distinct from p_data->>'channelId' or e.content_hash is distinct from p_data->>'contentHash' then raise exception 'Receipt does not match the accepted event' using errcode='22023'; end if;
      update public.alert_events set state='delivered',delivered_at=now() where id=e.id;
      update public.alert_rules set unresolved_event_id=null where unresolved_event_id=e.id;
      update public.alert_outbox set state='delivered',delivered_at=now(),lease_token=null,lease_until=null,last_error=null where id=o.id;
    else
      update public.alert_outbox set lease_token=null,lease_until=null,not_before=now()+make_interval(secs=>least(3600,greatest(60,ceil(coalesce((p_data->>'retryAfterMs')::numeric,60000)/1000.0)::integer))),last_error=left(p_data->>'errorCode',120),receipt_attempts=case when p_data->>'permanent'='true' then 5 else receipt_attempts end where id=o.id;
    end if;
    return jsonb_build_object('recorded',true);
  elsif p_action='prune' then
    delete from public.alert_events where id in (select e.id from public.alert_events e where e.observed_at<now()-interval '30 days' and e.state in ('delivered','suppressed') and not exists(select 1 from public.alert_rules r where r.unresolved_event_id=e.id) order by e.observed_at limit 200);
    return '{}'::jsonb;
  end if;
  raise exception 'Unsupported worker operation' using errcode='22023';
end $$;
