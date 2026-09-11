-- Keep the original title bounded, even when it contains padding.
-- This is a forward change; the already applied creation migration is immutable.
alter table public.saved_reports
  drop constraint saved_reports_title_check,
  add constraint saved_reports_title_check check (
    char_length(title) between 1 and 180
    and title ~ '[^[:space:]]'
  );
