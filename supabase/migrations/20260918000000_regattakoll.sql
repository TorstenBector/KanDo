-- RegattaKoll — klubbaserad kappseglingsbana-app, egen repo (TorstenBector/
-- RegattaKoll) men delar detta Supabase-projekt med KanDo-familjen (beslut
-- 2026-09-18: enklare infrastruktur än ett eget dedikerat projekt som
-- Jaktkoll har, trots att datamodellen är klubbaserad/multi-tenant som
-- Jaktkolls — inte enanvändare som KonsultKoll/TidKoll).
--
-- Roller är enkla för MVP: 'admin' (skapade klubben, eller inbjuden som
-- admin) kan bjuda in medlemmar; 'member' kan skapa/redigera banor. Ingen
-- finkornig behörighetsuppdelning ännu — kan läggas till senare om det
-- visar sig behövas (jfr Jaktkolls hunt_leader/member-distinktion, som togs
-- fram efter hand, inte i förväg).

create table regattakoll_clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table regattakoll_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references regattakoll_clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create index regattakoll_members_club_id_idx on regattakoll_members(club_id);
create index regattakoll_members_user_id_idx on regattakoll_members(user_id);

-- 'vatten' (Klart vatten) är alltid default/manuellt läge; 'sjokort'
-- aktiveras automatiskt av klientkoden när banan kopplas till en verklig
-- plats (has_location = true) — men mode_is_manual låter användaren
-- manuellt flippa och behålla det valet, se krav 01 i RegattaKoll-specen
-- (ursprunglig Artifact-skiss, 2026-08-25).
create table regattakoll_courses (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references regattakoll_clubs(id) on delete cascade,
  name text not null,
  mode text not null default 'vatten' check (mode in ('vatten', 'sjokort')),
  mode_is_manual boolean not null default false,
  has_location boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index regattakoll_courses_club_id_idx on regattakoll_courses(club_id);

-- Bojar/märken på en bana. Riktning+avstånd (krav 03) räknas geometriskt
-- klientsidan ur lat/lon för varje ben mellan sort_order-ordnade marks —
-- lagras inte, alltid färskt. depth_m är manuell inmatning (krav 02,
-- beslut 2026-09-18: inget sjökorts-API för djup i MVP).
create table regattakoll_marks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references regattakoll_courses(id) on delete cascade,
  name text not null,
  kind text not null default 'mark' check (kind in ('start', 'mark', 'finish')),
  lat double precision not null,
  lon double precision not null,
  depth_m numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index regattakoll_marks_course_id_idx on regattakoll_marks(course_id);

alter table regattakoll_clubs enable row level security;
alter table regattakoll_members enable row level security;
alter table regattakoll_courses enable row level security;
alter table regattakoll_marks enable row level security;

-- SECURITY DEFINER för att undvika rekursiva RLS-policyer på
-- regattakoll_members (en policy på members som själv slår upp members
-- för samma rad snurrar). Samma mönster som Jaktkolls get_my_role().
create or replace function get_regatta_role(p_club_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from regattakoll_members
  where club_id = p_club_id and user_id = auth.uid()
  limit 1;
$$;

grant execute on function get_regatta_role(uuid) to authenticated;

-- Skapar klubben OCH lägger till skaparen som admin i samma transaktion —
-- annars finns ett ögonblick där en nyskapad klubb inte har någon
-- medlem alls och RLS:en nedan (som kräver medlemskap för SELECT) låser
-- ute skaparen från sin egen klubb precis efter INSERT.
create or replace function create_regatta_club(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  insert into regattakoll_clubs (name) values (trim(p_name)) returning id into v_club_id;
  insert into regattakoll_members (club_id, user_id, email, role)
    values (v_club_id, auth.uid(), auth.jwt() ->> 'email', 'admin');
  return v_club_id;
end;
$$;

grant execute on function create_regatta_club(text) to authenticated;

create policy regattakoll_clubs_select on regattakoll_clubs
  for select using (get_regatta_role(id) is not null);

create policy regattakoll_members_select on regattakoll_members
  for select using (get_regatta_role(club_id) is not null);

-- Bara admin bjuder in/tar bort medlemmar — den som skapade klubben blir
-- admin via create_regatta_club() ovan, inte via denna policy.
create policy regattakoll_members_insert on regattakoll_members
  for insert with check (get_regatta_role(club_id) = 'admin');

create policy regattakoll_members_delete on regattakoll_members
  for delete using (get_regatta_role(club_id) = 'admin');

-- Både admin och member kan skapa/redigera banor och bojar — ingen
-- anledning att låsa ner det finkornigare för en MVP med typiskt en
-- handfull betrodda klubbmedlemmar.
create policy regattakoll_courses_select on regattakoll_courses
  for select using (get_regatta_role(club_id) is not null);

create policy regattakoll_courses_write on regattakoll_courses
  for all using (get_regatta_role(club_id) is not null)
  with check (get_regatta_role(club_id) is not null);

create policy regattakoll_marks_select on regattakoll_marks
  for select using (
    exists (select 1 from regattakoll_courses c where c.id = course_id and get_regatta_role(c.club_id) is not null)
  );

create policy regattakoll_marks_write on regattakoll_marks
  for all using (
    exists (select 1 from regattakoll_courses c where c.id = course_id and get_regatta_role(c.club_id) is not null)
  )
  with check (
    exists (select 1 from regattakoll_courses c where c.id = course_id and get_regatta_role(c.club_id) is not null)
  );
