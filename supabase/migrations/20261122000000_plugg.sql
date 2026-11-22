-- KanDo Plugg: studiestöd med aktiviteter (t.ex. "Fysikprov 12/12") och
-- schemalagda pluggpass med timer. Se spec.md "Plugg".
--
-- plugg_activities.schedule = veckoschemat som passen genereras från:
--   [{ "weekdays": [2, 4], "time": "18:45", "minutes": 15 }, ...]
--   (ISO-veckodagar 1=måndag .. 7=söndag, tid i lokal tid "HH:MM").
-- plugg_sessions = konkreta pass, genererade av klienten (usePlugg.js) en
-- bit framåt i tiden. Id:t är deterministiskt ur aktivitet+datum+tid, så två
-- enheter som genererar samma pass får samma rad i stället för dubbletter.
-- Konkreta rader (inte bara schemat) behövs för att servern senare ska kunna
-- skicka påminnelser (push/SMS) utan att räkna ut schemat själv.

create table plugg_activities (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  description text,
  end_date date,
  schedule jsonb not null default '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plugg_sessions (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  activity_id uuid not null references plugg_activities(id) on delete cascade,
  date date not null,
  start_time text not null check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  planned_minutes integer not null check (planned_minutes > 0),
  extra_minutes integer not null default 0,
  status text not null default 'planerad' check (status in ('planerad', 'pagar', 'klar')),
  started_at timestamptz,
  paused_at timestamptz,
  paused_seconds integer not null default 0,
  completed_at timestamptz,
  actual_seconds integer,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plugg_sessions_user_date on plugg_sessions (user_id, date);
create index plugg_sessions_activity on plugg_sessions (activity_id);

alter table plugg_activities enable row level security;
alter table plugg_sessions enable row level security;

create policy plugg_activities_owner on plugg_activities
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy plugg_sessions_owner on plugg_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
