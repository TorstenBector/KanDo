-- KanDo Streak: utmaningar man bockar av (varje dag eller valda veckodagar),
-- ensam eller tillsammans med kopplade konton. Varje deltagare har sin egen
-- streak; man ser varandras avbockningar och får en pushnotis när en vän
-- gjort dagens (edge function plugg-push, action streak-checkin).
--
-- Allt går via RPC:erna nedan (security definer) — tabellerna har RLS utan
-- policies, så de kan inte läsas eller skrivas direkt.
-- Datum ("day") är svensk kalenderdag.

create table if not exists streak_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  emoji text not null default '🔥',
  weekdays int[] not null default '{}',   -- tom = varje dag; annars ISO 1=mån..7=sön
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists streak_members (
  challenge_id uuid not null references streak_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'active', 'left')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table if not exists streak_checkins (
  challenge_id uuid not null references streak_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id, day)
);

create index if not exists streak_members_user on streak_members (user_id);

alter table streak_challenges enable row level security;
alter table streak_members enable row level security;
alter table streak_checkins enable row level security;

create or replace function streak_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Stockholm')::date $$;

create or replace function create_streak_challenge(p_title text, p_emoji text, p_weekdays int[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Du behöver vara inloggad'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Utmaningen behöver ett namn'; end if;
  if exists (select 1 from unnest(coalesce(p_weekdays, '{}')) d where d < 1 or d > 7) then
    raise exception 'Ogiltig veckodag';
  end if;
  insert into streak_challenges (owner_id, title, emoji, weekdays)
  values (auth.uid(), trim(p_title), coalesce(nullif(trim(p_emoji), ''), '🔥'), coalesce(p_weekdays, '{}'))
  returning id into v_id;
  insert into streak_members (challenge_id, user_id, status, joined_at) values (v_id, auth.uid(), 'active', now());
  return v_id;
end $$;

-- Aktiv deltagare bjuder in ett kopplat konto.
create or replace function invite_to_streak(p_challenge uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from streak_members m where m.challenge_id = p_challenge and m.user_id = auth.uid() and m.status = 'active') then
    raise exception 'Du är inte med i utmaningen';
  end if;
  if not exists (
    select 1 from kando_connections c
    where c.accepted_at is not null
      and ((c.inviter_id = auth.uid() and c.invitee_id = p_user) or (c.invitee_id = auth.uid() and c.inviter_id = p_user))
  ) then
    raise exception 'Ni är inte kopplade — bjud in under Kopplade konton först';
  end if;
  insert into streak_members (challenge_id, user_id, status, invited_by)
  values (p_challenge, p_user, 'invited', auth.uid())
  on conflict (challenge_id, user_id) do update
    set status = 'invited', invited_by = auth.uid()
    where streak_members.status = 'left';
end $$;

create or replace function respond_streak_invite(p_challenge uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update streak_members set status = 'active', joined_at = now()
    where challenge_id = p_challenge and user_id = auth.uid() and status = 'invited';
  else
    delete from streak_members where challenge_id = p_challenge and user_id = auth.uid() and status = 'invited';
  end if;
  if not found then raise exception 'Inbjudan finns inte längre'; end if;
end $$;

-- Bocka av (eller ångra) idag eller igår (glömde bocka i går kväll).
create or replace function checkin_streak(p_challenge uuid, p_day date, p_done boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from streak_members m where m.challenge_id = p_challenge and m.user_id = auth.uid() and m.status = 'active') then
    raise exception 'Du är inte med i utmaningen';
  end if;
  if p_day not between streak_today() - 1 and streak_today() then
    raise exception 'Du kan bara bocka av idag eller igår';
  end if;
  if p_done then
    insert into streak_checkins (challenge_id, user_id, day) values (p_challenge, auth.uid(), p_day)
    on conflict do nothing;
  else
    delete from streak_checkins where challenge_id = p_challenge and user_id = auth.uid() and day = p_day;
  end if;
end $$;

-- Lämna (deltagare) eller avsluta för alla (ägaren).
create or replace function leave_streak(p_challenge uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from streak_challenges c where c.id = p_challenge and c.owner_id = auth.uid()) then
    update streak_challenges set archived_at = now() where id = p_challenge;
  else
    update streak_members set status = 'left' where challenge_id = p_challenge and user_id = auth.uid();
  end if;
end $$;

-- Allt Streak-fliken behöver: mina utmaningar (aktiva + inbjudningar) med
-- deltagare och deras avbockningar de senaste 400 dagarna.
create or replace function streak_overview()
returns jsonb
language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(ch order by (ch->>'created_at') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'emoji', c.emoji,
      'weekdays', to_jsonb(c.weekdays),
      'is_owner', c.owner_id = auth.uid(),
      'owner_name', coalesce((select p.alias from profiles p where p.id = c.owner_id), 'Någon'),
      'my_status', me.status,
      'invited_by_name', (select p.alias from profiles p where p.id = me.invited_by),
      'created_at', c.created_at,
      'today', streak_today(),
      'members', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', m.user_id,
          'name', coalesce((select p.alias from profiles p where p.id = m.user_id), 'Någon'),
          'status', m.status,
          'is_me', m.user_id = auth.uid(),
          'days', (
            select coalesce(jsonb_agg(k.day order by k.day desc), '[]'::jsonb)
            from streak_checkins k
            where k.challenge_id = c.id and k.user_id = m.user_id and k.day > streak_today() - 400
          )
        ) order by m.user_id = auth.uid() desc, m.joined_at nulls last), '[]'::jsonb)
        from streak_members m
        where m.challenge_id = c.id and m.status in ('active', 'invited')
      )
    ) as ch
    from streak_challenges c
    join streak_members me on me.challenge_id = c.id and me.user_id = auth.uid() and me.status in ('active', 'invited')
    where c.archived_at is null
  ) s;
$$;

revoke all on function create_streak_challenge(text, text, int[]) from public;
revoke all on function invite_to_streak(uuid, uuid) from public;
revoke all on function respond_streak_invite(uuid, boolean) from public;
revoke all on function checkin_streak(uuid, date, boolean) from public;
revoke all on function leave_streak(uuid) from public;
revoke all on function streak_overview() from public;
grant execute on function create_streak_challenge(text, text, int[]) to authenticated;
grant execute on function invite_to_streak(uuid, uuid) to authenticated;
grant execute on function respond_streak_invite(uuid, boolean) to authenticated;
grant execute on function checkin_streak(uuid, date, boolean) to authenticated;
grant execute on function leave_streak(uuid) to authenticated;
grant execute on function streak_overview() to authenticated;
