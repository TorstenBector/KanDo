-- LeveransKoll — leveransplanering mot begränsade resurser (lyftkran, truck)
-- på byggarbetsplatser. Egen repo (LeveransKoll), delar detta Supabase-
-- projekt med KanDo-familjen. Ersätter LeveransKoll-repots
-- supabase-schema.sql, som aldrig kördes i prod.
--
-- Byggprojekt från start (KanDo Vibe #7393, beslut 2026-09-27):
-- - En byggledare (Micke) har flera byggen samtidigt och växlar mellan dem.
-- - Resurser hör till ETT bygge — inga delade resurser mellan byggen, så
--   krockkontrollen behöver bara se det egna bygget.
-- - Andra ska kunna ta del av planeringen → medlemskap per bygge med roller:
--     owner   — skapade bygget; allt, inkl. bjuda in/ta bort medlemmar
--     planner — lägga in/ändra resurser och leveranser
--     viewer  — bara läsa (t.ex. en leverantör eller platschef som vill se)
--   Inbjudan sker per e-post i förväg och kopplas när den personen loggar in
--   (samma mönster som TidKolls company_roster/company_admin_invites).

create table leveranskoll_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table leveranskoll_members (
  project_id uuid not null references leveranskoll_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('owner', 'planner', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index leveranskoll_members_user_id_idx on leveranskoll_members(user_id);

create table leveranskoll_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references leveranskoll_projects(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('planner', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  claimed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index leveranskoll_invites_project_email_idx on leveranskoll_invites(project_id, lower(email));

create table leveranskoll_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references leveranskoll_projects(id) on delete cascade,
  name text not null,
  capacity int not null default 1 check (capacity > 0),
  staffed_start time not null default '07:00',
  staffed_end time not null default '16:00',
  min_gap_minutes int not null default 0 check (min_gap_minutes >= 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (staffed_end > staffed_start)
);
create index leveranskoll_resources_project_id_idx on leveranskoll_resources(project_id);

create table leveranskoll_deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references leveranskoll_projects(id) on delete cascade,
  title text not null,
  supplier_name text,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 30 check (duration_minutes > 0),
  status text not null default 'planned' check (status in ('planned', 'arrived', 'completed', 'cancelled')),
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index leveranskoll_deliveries_project_scheduled_idx on leveranskoll_deliveries(project_id, scheduled_at);

create table leveranskoll_delivery_resources (
  delivery_id uuid not null references leveranskoll_deliveries(id) on delete cascade,
  resource_id uuid not null references leveranskoll_resources(id) on delete cascade,
  primary key (delivery_id, resource_id)
);

alter table leveranskoll_projects enable row level security;
alter table leveranskoll_members enable row level security;
alter table leveranskoll_invites enable row level security;
alter table leveranskoll_resources enable row level security;
alter table leveranskoll_deliveries enable row level security;
alter table leveranskoll_delivery_resources enable row level security;

-- SECURITY DEFINER för att slippa rekursiva policyer på members (samma
-- mönster som get_regatta_role / Jaktkolls get_my_role).
create or replace function get_leveranskoll_role(p_project_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from leveranskoll_members
  where project_id = p_project_id and user_id = auth.uid()
  limit 1;
$$;

-- Skapar bygget OCH gör skaparen till owner i samma transaktion — annars
-- låser RLS ute skaparen från sitt eget nyskapade bygge.
create or replace function create_leveranskoll_project(p_name text, p_address text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Inte inloggad';
  end if;
  insert into leveranskoll_projects (name, address, created_by)
    values (trim(p_name), nullif(trim(coalesce(p_address, '')), ''), auth.uid())
    returning id into v_id;
  insert into leveranskoll_members (project_id, user_id, email, role)
    values (v_id, auth.uid(), lower(auth.jwt() ->> 'email'), 'owner');
  return v_id;
end;
$$;

-- Kopplar alla väntande inbjudningar till den inloggades e-post (skiftläges-
-- okänsligt, jfr 20260924020000_case_insensitive_email_claims). Anropas av
-- klienten efter inloggning; ofarlig att anropa flera gånger.
create or replace function claim_leveranskoll_invites()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
  v_count int := 0;
  v_invite record;
begin
  if auth.uid() is null or v_email is null then
    return 0;
  end if;
  for v_invite in
    select * from leveranskoll_invites where claimed_by is null and lower(email) = v_email
  loop
    insert into leveranskoll_members (project_id, user_id, email, role)
      values (v_invite.project_id, auth.uid(), v_email, v_invite.role)
      on conflict (project_id, user_id) do nothing;
    update leveranskoll_invites set claimed_by = auth.uid() where id = v_invite.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Funktioner får EXECUTE för PUBLIC (även anon) som standard i Postgres —
-- stäng det uttryckligen, bara inloggade ska kunna anropa dessa.
revoke execute on function get_leveranskoll_role(uuid) from public, anon;
revoke execute on function create_leveranskoll_project(text, text) from public, anon;
revoke execute on function claim_leveranskoll_invites() from public, anon;
grant execute on function get_leveranskoll_role(uuid) to authenticated;
grant execute on function create_leveranskoll_project(text, text) to authenticated;
grant execute on function claim_leveranskoll_invites() to authenticated;

-- Byggen: medlemmar ser, owner ändrar/tar bort. Skapas bara via RPC:n ovan.
create policy leveranskoll_projects_select on leveranskoll_projects
  for select using (get_leveranskoll_role(id) is not null);
create policy leveranskoll_projects_update on leveranskoll_projects
  for update using (get_leveranskoll_role(id) = 'owner') with check (get_leveranskoll_role(id) = 'owner');
create policy leveranskoll_projects_delete on leveranskoll_projects
  for delete using (get_leveranskoll_role(id) = 'owner');

-- Medlemmar: alla i bygget ser vilka som är med; bara owner ändrar.
create policy leveranskoll_members_select on leveranskoll_members
  for select using (get_leveranskoll_role(project_id) is not null);
create policy leveranskoll_members_update on leveranskoll_members
  for update using (get_leveranskoll_role(project_id) = 'owner') with check (get_leveranskoll_role(project_id) = 'owner');
create policy leveranskoll_members_delete on leveranskoll_members
  for delete using (get_leveranskoll_role(project_id) = 'owner' and role <> 'owner');

-- Inbjudningar: bara owner.
create policy leveranskoll_invites_owner on leveranskoll_invites
  for all using (get_leveranskoll_role(project_id) = 'owner')
  with check (get_leveranskoll_role(project_id) = 'owner');

-- Resurser och leveranser: alla medlemmar läser, owner/planner skriver.
create policy leveranskoll_resources_select on leveranskoll_resources
  for select using (get_leveranskoll_role(project_id) is not null);
create policy leveranskoll_resources_write on leveranskoll_resources
  for all using (get_leveranskoll_role(project_id) in ('owner', 'planner'))
  with check (get_leveranskoll_role(project_id) in ('owner', 'planner'));

create policy leveranskoll_deliveries_select on leveranskoll_deliveries
  for select using (get_leveranskoll_role(project_id) is not null);
create policy leveranskoll_deliveries_write on leveranskoll_deliveries
  for all using (get_leveranskoll_role(project_id) in ('owner', 'planner'))
  with check (get_leveranskoll_role(project_id) in ('owner', 'planner'));

-- Kopplingen leverans↔resurs: via leveransens bygge, och resursen måste
-- tillhöra SAMMA bygge (inga delade resurser mellan byggen).
create policy leveranskoll_delivery_resources_select on leveranskoll_delivery_resources
  for select using (
    exists (select 1 from leveranskoll_deliveries d
            where d.id = delivery_id and get_leveranskoll_role(d.project_id) is not null)
  );
create policy leveranskoll_delivery_resources_write on leveranskoll_delivery_resources
  for all using (
    exists (select 1 from leveranskoll_deliveries d
            where d.id = delivery_id and get_leveranskoll_role(d.project_id) in ('owner', 'planner'))
  )
  with check (
    exists (select 1 from leveranskoll_deliveries d
            join leveranskoll_resources r on r.id = resource_id and r.project_id = d.project_id
            where d.id = delivery_id and get_leveranskoll_role(d.project_id) in ('owner', 'planner'))
  );
