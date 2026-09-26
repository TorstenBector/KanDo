-- Tidrapportering (tid.kando.nu) — one Supabase Auth account per driver,
-- reusing this project instead of the Lovable-managed one. Same
-- per-user-ownership RLS pattern as items/tags (see initial_schema.sql).

create table driver_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  driver_name text not null,
  hourly_rate numeric not null default 0,
  office_email text,
  driver_email text,
  admin_name text,
  updated_at timestamptz not null default now()
);

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  check_in text,
  check_out text,
  break_minutes integer not null default 0,
  trakt text not null default '',
  deviation text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index time_entries_user_date_idx on time_entries(user_id, date);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
-- set_updated_at() already exists from initial_schema.sql (items table) —
-- create or replace is safe/idempotent here, function body is identical.

create trigger driver_settings_set_updated_at
  before update on driver_settings
  for each row execute function set_updated_at();

create trigger time_entries_set_updated_at
  before update on time_entries
  for each row execute function set_updated_at();

alter table driver_settings enable row level security;
alter table time_entries enable row level security;

create policy driver_settings_owner on driver_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy time_entries_owner on time_entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
