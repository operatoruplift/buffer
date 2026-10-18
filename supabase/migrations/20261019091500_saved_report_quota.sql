-- Saved-report quota per account: at most 50 reports and 8 MiB of report JSON.
--
-- The app lists the newest 50 reports and its sign-up form is gated, but the
-- Auth API accepts sign-ups regardless, and the table accepted any number of
-- rows of up to 256 KiB each, so one account could fill the database. The cap
-- is enforced where it cannot be bypassed: a BEFORE INSERT trigger counts the
-- account's rows and bytes under a per-account advisory lock, so two
-- concurrent inserts cannot both slip under the limit. A refusal raises
-- SQLSTATE 54000 (program_limit_exceeded) with a fixed hint; the app matches
-- the code and tells the person the library is full.
--
-- Additive: existing rows are untouched. An account already over a limit keeps
-- its reports and can delete some to make room.
-- Reverse with:
--   drop trigger saved_reports_quota on public.saved_reports;
--   drop function private.enforce_saved_report_quota();
create schema if not exists private;

create or replace function private.enforce_saved_report_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  max_rows constant integer := 50;
  max_bytes constant bigint := 8 * 1024 * 1024;
  held_rows integer;
  held_bytes bigint;
begin
  -- Serialise inserts per account so a burst cannot pass the count together.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text, 2609110001));
  select count(*), coalesce(sum(pg_catalog.octet_length(r.report::text)), 0)
    into held_rows, held_bytes
    from public.saved_reports r where r.user_id = NEW.user_id;
  if held_rows >= max_rows then
    raise exception 'Saved report limit reached: this account already holds % reports', max_rows
      using errcode = '54000', hint = 'Delete a saved report to make room.';
  end if;
  if held_bytes + pg_catalog.octet_length(NEW.report::text) > max_bytes then
    raise exception 'Saved report storage limit reached: this account may hold at most % MiB of reports', max_bytes / 1048576
      using errcode = '54000', hint = 'Delete a saved report to make room.';
  end if;
  return NEW;
end $$;
-- Triggers fire regardless of EXECUTE; nothing else may call this directly.
revoke all on function private.enforce_saved_report_quota() from public, anon, authenticated, service_role;

create trigger saved_reports_quota before insert on public.saved_reports
  for each row execute function private.enforce_saved_report_quota();

comment on function private.enforce_saved_report_quota() is 'BEFORE INSERT on public.saved_reports: refuses the 51st report or the byte that takes an account past 8 MiB with SQLSTATE 54000.';
