-- KonsultKoll (konsultkoll.kando.nu) — one Supabase Auth account per
-- användare, samma per-user-ownership RLS-mönster som TidKoll
-- (20260913000000_time_entries.sql). Ersätter localStorage-baserad
-- state (CalculatorContext.tsx) så att beräkningar och sparade uppdrag
-- är knutna till kontot, inte enheten — och inte synliga för andra.

create table konsultkoll_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  main_values jsonb not null default '{}'::jsonb,
  time_values jsonb not null default '{}'::jsonb,
  overhead_total numeric not null default 0,
  overhead_items jsonb not null default '[]'::jsonb,
  mellanhand_mode text not null default 'fixed',
  mellanhand_percent numeric not null default 0,
  manual_pension numeric not null default 0,
  pension_mode text not null default 'none',
  assignments_per_year integer not null default 1,
  updated_at timestamptz not null default now()
);

create table konsultkoll_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parameters jsonb not null,
  results jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index konsultkoll_assignments_user_idx on konsultkoll_assignments(user_id);

-- set_updated_at() skapades redan i 20260913000000_time_entries.sql —
-- återanvänds här, ingen ny definition behövs.
create trigger konsultkoll_settings_set_updated_at
  before update on konsultkoll_settings
  for each row execute function set_updated_at();

create trigger konsultkoll_assignments_set_updated_at
  before update on konsultkoll_assignments
  for each row execute function set_updated_at();

alter table konsultkoll_settings enable row level security;
alter table konsultkoll_assignments enable row level security;

create policy konsultkoll_settings_owner on konsultkoll_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy konsultkoll_assignments_owner on konsultkoll_assignments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
