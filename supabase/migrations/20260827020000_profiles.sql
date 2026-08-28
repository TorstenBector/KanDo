-- Captured at first-login registration (see RegistrationScreen.jsx). Phone
-- is stored now so it's ready for the SMS-based magic-link delivery planned
-- once the Jaktkoll SMS relay infrastructure exists — see spec.md.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  alias text not null,
  phone text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy profiles_owner on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
