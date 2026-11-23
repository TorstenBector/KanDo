-- KanDo Plugg: planeringsförslag mellan kopplade konton ("Dela med…").
-- Avsändaren skickar en kopia av en aktivitet (titel, schema, provdag);
-- mottagaren väljer Lägg till / Ändra först / Nej tack. Vid Lägg till skapar
-- mottagarens klient en egen aktivitet (vanlig synk + pass + påminnelser på
-- mottagarens telefon) och markerar förslaget som accepterat.
-- Kräver en accepterad koppling (kando_connections).

create table if not exists plugg_suggestions (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  end_date date,
  schedule jsonb not null default '[]'::jsonb,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists plugg_suggestions_to on plugg_suggestions (to_user, status);
create index if not exists plugg_suggestions_from on plugg_suggestions (from_user);

alter table plugg_suggestions enable row level security;

drop policy if exists plugg_suggestions_parties_read on plugg_suggestions;
create policy plugg_suggestions_parties_read on plugg_suggestions
  for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- Avsändaren kan återkalla (radera) sina egna förslag.
drop policy if exists plugg_suggestions_sender_delete on plugg_suggestions;
create policy plugg_suggestions_sender_delete on plugg_suggestions
  for delete to authenticated
  using (from_user = auth.uid());

grant select, delete on plugg_suggestions to authenticated;

create or replace function send_plugg_suggestion(
  p_to uuid,
  p_title text,
  p_description text,
  p_end_date date,
  p_schedule jsonb,
  p_message text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Du behöver vara inloggad';
  end if;
  if nullif(trim(p_title), '') is null then
    raise exception 'Förslaget saknar titel';
  end if;
  if jsonb_typeof(p_schedule) <> 'array' or jsonb_array_length(p_schedule) = 0 then
    raise exception 'Förslaget saknar pluggpass';
  end if;
  if not exists (
    select 1 from kando_connections c
    where c.accepted_at is not null
      and ((c.inviter_id = auth.uid() and c.invitee_id = p_to)
        or (c.invitee_id = auth.uid() and c.inviter_id = p_to))
  ) then
    raise exception 'Ni är inte kopplade — bjud in först';
  end if;
  insert into plugg_suggestions (from_user, to_user, title, description, end_date, schedule, message)
  values (auth.uid(), p_to, trim(p_title), nullif(trim(p_description), ''), p_end_date, p_schedule, nullif(trim(p_message), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function respond_plugg_suggestion(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Du behöver vara inloggad';
  end if;
  update plugg_suggestions
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = p_id and to_user = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Förslaget finns inte längre';
  end if;
end;
$$;

-- Förslag till och från mig, med den andras namn.
create or replace function list_plugg_suggestions()
returns table (
  id uuid,
  incoming boolean,
  other_user_id uuid,
  other_name text,
  title text,
  description text,
  end_date date,
  schedule jsonb,
  message text,
  status text,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id,
    s.to_user = auth.uid(),
    case when s.to_user = auth.uid() then s.from_user else s.to_user end,
    coalesce((select p.alias from profiles p where p.id = case when s.to_user = auth.uid() then s.from_user else s.to_user end), 'Någon'),
    s.title, s.description, s.end_date, s.schedule, s.message, s.status, s.created_at, s.responded_at
  from plugg_suggestions s
  where s.to_user = auth.uid() or s.from_user = auth.uid()
  order by s.created_at desc
  limit 50;
$$;

revoke all on function send_plugg_suggestion(uuid, text, text, date, jsonb, text) from public;
revoke all on function respond_plugg_suggestion(uuid, boolean) from public;
revoke all on function list_plugg_suggestions() from public;
grant execute on function send_plugg_suggestion(uuid, text, text, date, jsonb, text) to authenticated;
grant execute on function respond_plugg_suggestion(uuid, boolean) to authenticated;
grant execute on function list_plugg_suggestions() to authenticated;
