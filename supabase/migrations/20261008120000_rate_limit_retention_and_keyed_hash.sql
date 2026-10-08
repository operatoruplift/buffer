-- Rate-limit counters: keyed hashing and automatic deletion.
--
-- Before this migration the limiter stored each key exactly as the server sent
-- it, an unkeyed SHA-256 of the client IP that anyone can recompute for every
-- IPv4 address, and nothing called private.prune_rate_limits(), so rows were
-- never deleted.
--
-- Now public.consume_rate_limit stores HMAC-SHA-256(key, p_key) under a random
-- 32-byte key that never leaves the database, and deletes expired counters on
-- every check. Where pg_cron is installed (it is on the hosted project) a job
-- also prunes every three minutes, so idle counters go too. Windows are capped
-- at one minute, so a counter is deleted within four minutes of the last
-- request; the privacy policy promises five, leaving a minute for scheduling.
--
-- Deploy order does not matter. The RPC keeps its signature, arguments, result
-- and secret, and the server keeps sending an opaque digest (never an IP), so
-- the currently deployed app and the next one both work before and after this
-- runs. Nothing new must be configured: the key is generated here.
--
-- The hosted limiter predates this migration history. Its tables are recorded
-- with their production shape so a fresh project gets the same limiter; where
-- they exist, the IF NOT EXISTS statements do nothing.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table if not exists private.rate_limit_config (
  id boolean primary key default true check (id),
  secret text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
-- A fresh project gets a random secret to copy into RATE_LIMIT_SECRET; the hosted row is kept.
insert into private.rate_limit_config (id) values (true) on conflict (id) do nothing;

create table if not exists private.rate_limits (
  key text primary key,
  count integer not null,
  window_start timestamptz not null,
  expires_at timestamptz
);
alter table private.rate_limits add column if not exists expires_at timestamptz;

-- The HMAC key. Only the table owner can read it; the SECURITY DEFINER limiter
-- below is its only user. Row-level security with no policy is a second barrier.
create table if not exists private.rate_limit_hash_key (
  id boolean primary key default true check (id),
  key bytea not null default extensions.gen_random_bytes(32) check (octet_length(key) = 32)
);
insert into private.rate_limit_hash_key (id) values (true) on conflict (id) do nothing;

create or replace function private.prune_rate_limits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The scheduled pruner waits for a request that is pruning (see
  -- consume_rate_limit) instead of skipping its tick. Pruners never run
  -- together, so two multi-row deletes cannot deadlock.
  perform pg_catalog.pg_advisory_xact_lock(2610080001);
  delete from private.rate_limits r where r.expires_at <= pg_catalog.now();
end;
$$;

create or replace function public.consume_rate_limit(p_secret text, p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_hash_key bytea;
  v_key text;
  v_window interval;
  v_count integer;
  v_start timestamptz;
begin
  -- Refuse unless the server's secret matches. With no configured secret, nothing matches.
  if p_secret is null or not exists (select 1 from private.rate_limit_config c where c.id and c.secret = p_secret) then
    return query select false, 0, p_window_seconds;
    return;
  end if;
  -- Windows longer than a minute are refused: the privacy policy's retention
  -- period depends on it. The server uses 60 seconds.
  if p_key is null or length(p_key) > 200 or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 60 then
    return query select false, 0, p_window_seconds;
    return;
  end if;

  select k.key into v_hash_key from private.rate_limit_hash_key k where k.id;
  if v_hash_key is null then
    -- The request fails, so the server falls back to its per-process limit.
    raise exception 'Rate-limit hash key is missing' using errcode = '55000';
  end if;
  v_key := encode(extensions.hmac(convert_to(p_key, 'UTF8'), v_hash_key, 'sha256'), 'hex');
  v_window := make_interval(secs => p_window_seconds);

  -- Delete expired counters first. An expired counter holds no state: the next
  -- request after expiry starts a new window either way. If another call is
  -- already pruning, skip rather than wait; it removes the same rows.
  if pg_catalog.pg_try_advisory_xact_lock(2610080001) then
    delete from private.rate_limits x where x.expires_at <= v_now;
  end if;

  insert into private.rate_limits as r (key, count, window_start, expires_at)
  values (v_key, 1, v_now, v_now + v_window)
  on conflict (key) do update
    set count = case when r.window_start + v_window <= v_now then 1 else r.count + 1 end,
        window_start = case when r.window_start + v_window <= v_now then v_now else r.window_start end,
        expires_at = case when r.window_start + v_window <= v_now then v_now + v_window else r.window_start + v_window end
  returning r.count, r.window_start into v_count, v_start;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    greatest(ceil(extract(epoch from (v_start + v_window - v_now)))::integer, 1);
end;
$$;

-- Rows stored under the old unkeyed hash are deleted. They are one-minute
-- counters, so the only effect is that current windows start again.
delete from private.rate_limits;
alter table private.rate_limits alter column expires_at set not null;
create index if not exists rate_limits_expires_at_idx on private.rate_limits (expires_at);

alter table private.rate_limit_config enable row level security;
alter table private.rate_limits enable row level security;
alter table private.rate_limit_hash_key enable row level security;
revoke all on table private.rate_limit_config, private.rate_limits, private.rate_limit_hash_key
  from public, anon, authenticated, service_role;

-- Supabase grants browser roles EXECUTE on public functions directly, so
-- revoking PUBLIC alone is not enough. The server calls the limiter with the
-- publishable key, which is the anon role; the secret gates every call.
revoke all on function private.prune_rate_limits() from public, anon, authenticated, service_role;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to anon;

do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    -- Upserts by name, so applying this again keeps one job.
    perform cron.schedule('buffer-prune-rate-limits', '*/3 * * * *', 'select private.prune_rate_limits()');
  else
    raise notice 'pg_cron is not installed; expired rate-limit counters are pruned by each rate-limit check only.';
  end if;
end;
$$;

comment on table private.rate_limits is 'Per-client request counters. key is HMAC-SHA-256 under private.rate_limit_hash_key, never an IP or an unkeyed hash. Rows are deleted once expires_at passes.';
comment on table private.rate_limit_hash_key is 'Random HMAC key for rate-limit counter keys. Owner-only; never returned by any function.';
comment on function public.consume_rate_limit(text, text, integer, integer) is 'Shared rate limit gated by private.rate_limit_config.secret. Stores HMAC-SHA-256 of p_key and prunes expired counters.';
