-- KonsultKoll — arbetsgivare, PIN-skyddad adminflik, delningar och
-- inbjudningar för modulen "Uppskjuten lön".
--
-- Koden för delning och /arbetsgivare (KonsultKoll 5791b15) förutsatte de
-- här tabellerna, men de kom aldrig med i 20261107000000. Den här
-- migrationen skapar dem, plus inbjudningar: arbetsgivaren bjuder in en
-- konsult via länk och sätter arbetsgivarens andel per konsult.
--
-- Säkerhet:
-- * PIN-hashen ligger i en egen tabell utan policyer — bara funktionerna
--   (security definer) kommer åt den.
-- * Upplåsningen gäller per admin och 8 timmar; 5 fel ger 15 minuters spärr.
-- * Delningar och inbjudningar går bara att läsa för arbetsgivaren när
--   adminfliken är upplåst (konsultkoll_is_unlocked).

create extension if not exists pgcrypto with schema extensions;

create table konsultkoll_employers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table konsultkoll_employer_pins (
  employer_id uuid primary key references konsultkoll_employers(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

create table konsultkoll_employer_admins (
  employer_id uuid not null references konsultkoll_employers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unlocked_until timestamptz,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (employer_id, user_id)
);

create table konsultkoll_deferred_shares (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references konsultkoll_employers(id) on delete cascade,
  consultant_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  consultant_email text not null,
  consultant_name text,
  scenario_id uuid references konsultkoll_deferred_scenarios(id) on delete set null,
  code text not null,
  inputs jsonb not null,
  results jsonb not null,
  rule_version integer not null,
  created_at timestamptz not null default now()
);
create index konsultkoll_deferred_shares_employer_idx on konsultkoll_deferred_shares(employer_id);
create index konsultkoll_deferred_shares_consultant_idx on konsultkoll_deferred_shares(consultant_id);

create table konsultkoll_invitations (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references konsultkoll_employers(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  email text not null check (position('@' in email) > 1),
  consultant_name text,
  employer_share_pct numeric(5,2) not null default 12 check (employer_share_pct >= 0 and employer_share_pct <= 50),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create unique index konsultkoll_invitations_active_email_idx
  on konsultkoll_invitations(employer_id, lower(email)) where revoked_at is null;
create index konsultkoll_invitations_accepted_idx on konsultkoll_invitations(accepted_by);

alter table konsultkoll_employers enable row level security;
alter table konsultkoll_employer_pins enable row level security;
alter table konsultkoll_employer_admins enable row level security;
alter table konsultkoll_deferred_shares enable row level security;
alter table konsultkoll_invitations enable row level security;

-- Är den inloggade admin för arbetsgivaren med upplåst flik just nu?
create function konsultkoll_is_unlocked(p_employer uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from konsultkoll_employer_admins
    where employer_id = p_employer and user_id = auth.uid() and unlocked_until > now()
  );
$$;

create policy konsultkoll_employers_read on konsultkoll_employers
  for select to authenticated using (true);

create policy konsultkoll_employer_admins_own on konsultkoll_employer_admins
  for select to authenticated using (user_id = auth.uid());

create policy konsultkoll_deferred_shares_select on konsultkoll_deferred_shares
  for select to authenticated using (consultant_id = auth.uid() or konsultkoll_is_unlocked(employer_id));
create policy konsultkoll_deferred_shares_insert on konsultkoll_deferred_shares
  for insert to authenticated with check (consultant_id = auth.uid());
create policy konsultkoll_deferred_shares_delete on konsultkoll_deferred_shares
  for delete to authenticated using (consultant_id = auth.uid());

create policy konsultkoll_invitations_select on konsultkoll_invitations
  for select to authenticated using (accepted_by = auth.uid() or konsultkoll_is_unlocked(employer_id));
create policy konsultkoll_invitations_insert on konsultkoll_invitations
  for insert to authenticated with check (konsultkoll_is_unlocked(employer_id));
create policy konsultkoll_invitations_update on konsultkoll_invitations
  for update to authenticated using (konsultkoll_is_unlocked(employer_id)) with check (konsultkoll_is_unlocked(employer_id));

-- PIN-funktioner. Kräver rad i konsultkoll_employer_admins.
create function konsultkoll_employer_status(p_employer uuid) returns json
  language plpgsql stable security definer set search_path = public
as $$
declare a konsultkoll_employer_admins;
begin
  select * into a from konsultkoll_employer_admins where employer_id = p_employer and user_id = auth.uid();
  if not found then raise exception 'Inte admin för arbetsgivaren'; end if;
  return json_build_object(
    'has_pin', exists (select 1 from konsultkoll_employer_pins where employer_id = p_employer),
    'unlocked_until', case when a.unlocked_until > now() then a.unlocked_until end,
    'locked_until', case when a.locked_until > now() then a.locked_until end
  );
end;
$$;

create function konsultkoll_set_employer_pin(p_employer uuid, p_new_pin text, p_current_pin text default null) returns void
  language plpgsql security definer set search_path = public, extensions
as $$
declare old_hash text;
begin
  if not exists (select 1 from konsultkoll_employer_admins where employer_id = p_employer and user_id = auth.uid()) then
    raise exception 'Inte admin för arbetsgivaren';
  end if;
  if length(coalesce(p_new_pin, '')) < 6 then raise exception 'PIN måste vara minst 6 tecken'; end if;
  select pin_hash into old_hash from konsultkoll_employer_pins where employer_id = p_employer;
  if old_hash is not null and (p_current_pin is null or crypt(p_current_pin, old_hash) <> old_hash) then
    raise exception 'Nuvarande PIN stämmer inte';
  end if;
  insert into konsultkoll_employer_pins (employer_id, pin_hash, updated_at)
    values (p_employer, crypt(p_new_pin, gen_salt('bf')), now())
    on conflict (employer_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

-- Returnerar upplåst-till, eller null vid fel PIN/spärr (ingen exception,
-- så att räknaren för felförsök sparas).
create function konsultkoll_unlock_employer(p_employer uuid, p_pin text) returns timestamptz
  language plpgsql security definer set search_path = public, extensions
as $$
declare a konsultkoll_employer_admins; h text; until_ts timestamptz;
begin
  select * into a from konsultkoll_employer_admins where employer_id = p_employer and user_id = auth.uid();
  if not found then raise exception 'Inte admin för arbetsgivaren'; end if;
  if a.locked_until > now() then return null; end if;
  select pin_hash into h from konsultkoll_employer_pins where employer_id = p_employer;
  if h is null then raise exception 'Ingen PIN är satt'; end if;
  if crypt(coalesce(p_pin, ''), h) = h then
    until_ts := now() + interval '8 hours';
    update konsultkoll_employer_admins set unlocked_until = until_ts, failed_attempts = 0, locked_until = null
      where employer_id = p_employer and user_id = auth.uid();
    return until_ts;
  end if;
  update konsultkoll_employer_admins
    set failed_attempts = case when a.failed_attempts + 1 >= 5 then 0 else a.failed_attempts + 1 end,
        locked_until = case when a.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
    where employer_id = p_employer and user_id = auth.uid();
  return null;
end;
$$;

create function konsultkoll_lock_employer(p_employer uuid) returns void
  language sql security definer set search_path = public
as $$
  update konsultkoll_employer_admins set unlocked_until = null
    where employer_id = p_employer and user_id = auth.uid();
$$;

-- Konsulten tar emot en inbjudan. E-posten måste stämma med inloggningen.
create function konsultkoll_accept_invitation(p_token text) returns json
  language plpgsql security definer set search_path = public
as $$
declare inv konsultkoll_invitations; em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  select * into inv from konsultkoll_invitations where token = p_token and revoked_at is null;
  if not found then raise exception 'Inbjudan finns inte eller är återkallad'; end if;
  if inv.accepted_by is not null and inv.accepted_by <> auth.uid() then
    raise exception 'Inbjudan är redan använd av ett annat konto';
  end if;
  if lower(inv.email) <> em then
    raise exception 'Inbjudan gäller %. Logga in med den adressen.', inv.email;
  end if;
  update konsultkoll_invitations set accepted_by = auth.uid(), accepted_at = coalesce(accepted_at, now())
    where id = inv.id;
  return json_build_object('employer_id', inv.employer_id, 'employer_share_pct', inv.employer_share_pct);
end;
$$;

revoke execute on function konsultkoll_is_unlocked(uuid) from public, anon;
revoke execute on function konsultkoll_employer_status(uuid) from public, anon;
revoke execute on function konsultkoll_set_employer_pin(uuid, text, text) from public, anon;
revoke execute on function konsultkoll_unlock_employer(uuid, text) from public, anon;
revoke execute on function konsultkoll_lock_employer(uuid) from public, anon;
revoke execute on function konsultkoll_accept_invitation(text) from public, anon;
grant execute on function konsultkoll_is_unlocked(uuid) to authenticated;
grant execute on function konsultkoll_employer_status(uuid) to authenticated;
grant execute on function konsultkoll_set_employer_pin(uuid, text, text) to authenticated;
grant execute on function konsultkoll_unlock_employer(uuid, text) to authenticated;
grant execute on function konsultkoll_lock_employer(uuid) to authenticated;
grant execute on function konsultkoll_accept_invitation(text) to authenticated;

-- BECTOR med Torsten som admin.
insert into konsultkoll_employers (name) values ('BECTOR') on conflict (name) do nothing;
insert into konsultkoll_employer_admins (employer_id, user_id)
  select e.id, u.id from konsultkoll_employers e, auth.users u
  where e.name = 'BECTOR' and lower(u.email) = 'beckman.torsten@gmail.com'
  on conflict do nothing;
