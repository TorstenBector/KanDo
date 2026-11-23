-- KanDo: kopplade konton (t.ex. förälder ↔ barn). Inbjudaren skapar en
-- inbjudan med en kod; den inbjudna öppnar länken app.kando.nu/?koppla=<kod>,
-- loggar in och accepterar. Grunden för delning av pluggplaner,
-- planeringsförslag och streak-utmaningar (se spec.md "Plugg").
--
-- Allt skrivs via RPC:erna nedan (security definer) — tabellen har bara
-- läs- och raderingsrätt för de två parterna.

create table if not exists kando_connections (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid references auth.users(id) on delete cascade,
  invitee_label text,
  token text not null unique,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  check (invitee_id is null or invitee_id <> inviter_id)
);

create index if not exists kando_connections_inviter on kando_connections (inviter_id);
create index if not exists kando_connections_invitee on kando_connections (invitee_id);

alter table kando_connections enable row level security;

drop policy if exists kando_connections_parties_read on kando_connections;
create policy kando_connections_parties_read on kando_connections
  for select to authenticated
  using (inviter_id = auth.uid() or invitee_id = auth.uid());

drop policy if exists kando_connections_parties_delete on kando_connections;
create policy kando_connections_parties_delete on kando_connections
  for delete to authenticated
  using (inviter_id = auth.uid() or invitee_id = auth.uid());

grant select, delete on kando_connections to authenticated;

-- Ny inbjudan. Koden är 10 tecken (versaler/siffror utan förväxlingsbara
-- 0/O/1/I/L), lätt att skriva av om länken inte går att öppna.
create or replace function create_connection_invite(p_label text)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_token text;
  v_bytes bytea;
  i int;
begin
  if auth.uid() is null then
    raise exception 'Du behöver vara inloggad';
  end if;
  loop
    v_bytes := gen_random_bytes(10);
    v_token := '';
    for i in 0..9 loop
      v_token := v_token || substr(alphabet, (get_byte(v_bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from kando_connections c where c.token = v_token);
  end loop;
  return query
    insert into kando_connections (inviter_id, invitee_label, token)
    values (auth.uid(), nullif(trim(p_label), ''), v_token)
    returning kando_connections.id, kando_connections.token, kando_connections.expires_at;
end;
$$;

-- Vad inbjudningssidan visar innan man loggat in (även utloggad).
-- status: ok | used | expired | unknown
create or replace function get_connection_invite(p_token text)
returns table (inviter_alias text, status text)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((select p.alias from profiles p where p.id = c.inviter_id), 'Någon'),
    case
      when c.accepted_at is not null then 'used'
      when c.expires_at < now() then 'expired'
      else 'ok'
    end
  from kando_connections c
  where c.token = upper(trim(p_token))
  union all
  select null, 'unknown'
  where not exists (select 1 from kando_connections c where c.token = upper(trim(p_token)))
  limit 1;
$$;

create or replace function accept_connection_invite(p_token text)
returns table (inviter_alias text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v kando_connections;
begin
  if auth.uid() is null then
    raise exception 'Du behöver vara inloggad';
  end if;
  select * into v from kando_connections c where c.token = upper(trim(p_token)) for update;
  if not found then
    raise exception 'Inbjudan finns inte — kontrollera koden';
  end if;
  if v.inviter_id = auth.uid() then
    raise exception 'Det här är din egen inbjudan — skicka den till den du vill koppla ihop dig med';
  end if;
  if v.accepted_at is not null and v.invitee_id is distinct from auth.uid() then
    raise exception 'Inbjudan har redan använts';
  end if;
  if v.accepted_at is null and v.expires_at < now() then
    raise exception 'Inbjudan har gått ut — be om en ny';
  end if;

  if v.accepted_at is null then
    -- Redan kopplade sedan tidigare (åt något håll)? Då förbrukas inbjudan
    -- utan att en dubblettkoppling skapas.
    if exists (
      select 1 from kando_connections c
      where c.accepted_at is not null
        and ((c.inviter_id = v.inviter_id and c.invitee_id = auth.uid())
          or (c.inviter_id = auth.uid() and c.invitee_id = v.inviter_id))
    ) then
      delete from kando_connections c where c.id = v.id;
    else
      update kando_connections c set invitee_id = auth.uid(), accepted_at = now() where c.id = v.id;
    end if;
  end if;

  return query select coalesce((select p.alias from profiles p where p.id = v.inviter_id), 'Någon');
end;
$$;

-- Mina kopplingar och väntande inbjudningar, med den andras namn.
create or replace function list_my_connections()
returns table (
  id uuid,
  other_user_id uuid,
  other_name text,
  i_invited boolean,
  token text,
  created_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    case when c.inviter_id = auth.uid() then c.invitee_id else c.inviter_id end,
    case
      when c.inviter_id = auth.uid() then coalesce(c.invitee_label, (select p.alias from profiles p where p.id = c.invitee_id), 'Inbjuden')
      else coalesce((select p.alias from profiles p where p.id = c.inviter_id), 'Någon')
    end,
    c.inviter_id = auth.uid(),
    case when c.inviter_id = auth.uid() and c.accepted_at is null then c.token end,
    c.created_at,
    c.accepted_at,
    c.expires_at
  from kando_connections c
  where c.inviter_id = auth.uid() or c.invitee_id = auth.uid()
  order by c.accepted_at desc nulls last, c.created_at desc;
$$;

revoke all on function create_connection_invite(text) from public;
revoke all on function accept_connection_invite(text) from public;
revoke all on function list_my_connections() from public;
revoke all on function get_connection_invite(text) from public;
grant execute on function create_connection_invite(text) to authenticated;
grant execute on function accept_connection_invite(text) to authenticated;
grant execute on function list_my_connections() to authenticated;
grant execute on function get_connection_invite(text) to anon, authenticated;
