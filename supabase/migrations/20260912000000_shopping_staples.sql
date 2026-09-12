-- Stapelvaror: a recurring shopping-list template (mjölk, bröd, ...) that's
-- checked off before a store run and reset afterwards — separate from the
-- items table's ad-hoc Inköpslista (in_shopping_list flag), since these
-- rows aren't KanDo's and never go through the backlog/kanban/status
-- lifecycle, just a reusable checklist.

create table shopping_staples (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  checked boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table shopping_staples enable row level security;

create policy shopping_staples_owner on shopping_staples
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
