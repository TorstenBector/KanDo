-- Share a tag's items as a public checklist, no login required for the
-- recipient — e.g. "Kalasförberedelser": everything tagged 'Kalas' becomes
-- a link the kids can open, accept ("jag tar den här listan"), and check
-- off as they go, which reflects back into the owner's real items.
--
-- Deliberately narrower than opening up anon RLS on `items` directly (which
-- has no anon policy at all and shouldn't get one just for this): every
-- public read/write goes through one of the three SECURITY DEFINER
-- functions below, each of which re-checks that the item actually belongs
-- to this share's tag/owner before touching anything.

create table shared_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  token text not null unique,
  title text,
  accepted_by text,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index shared_lists_user_id_idx on shared_lists(user_id);

alter table shared_lists enable row level security;

-- Owner manages their own shares normally (create/list/delete from the app).
create policy shared_lists_owner on shared_lists
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Public read/write, all funneled through RPCs — see comment above.

create or replace function get_shared_list(p_token text)
returns table (
  list_title text,
  accepted_by text,
  accepted_at timestamptz,
  item_id uuid,
  item_title text,
  item_type text,
  item_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list shared_lists%rowtype;
begin
  select * into v_list from shared_lists where token = p_token;
  if not found then
    return;
  end if;

  return query
    select v_list.title, v_list.accepted_by, v_list.accepted_at,
           i.id, i.title, i.type, i.status
    from items i
    join item_tags it on it.item_id = i.id
    where it.tag_id = v_list.tag_id and i.user_id = v_list.user_id
    order by (i.status = 'klar'), i.created_at desc;
end;
$$;

grant execute on function get_shared_list(text) to anon;

create or replace function accept_shared_list(p_token text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update shared_lists
  set accepted_by = nullif(trim(p_name), ''), accepted_at = now()
  where token = p_token;
end;
$$;

grant execute on function accept_shared_list(text, text) to anon;

create or replace function complete_shared_item(p_token text, p_item_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list shared_lists%rowtype;
  v_owns boolean;
begin
  select * into v_list from shared_lists where token = p_token;
  if not found then
    raise exception 'Invalid share link';
  end if;

  select exists (
    select 1 from item_tags it
    join items i on i.id = it.item_id
    where it.item_id = p_item_id and it.tag_id = v_list.tag_id and i.user_id = v_list.user_id
  ) into v_owns;

  if not v_owns then
    raise exception 'Item is not part of this shared list';
  end if;

  update items
  set status = case when p_done then 'klar' else 'prioriterad' end,
      completed_at = case when p_done then now() else null end,
      updated_at = now()
  where id = p_item_id;
end;
$$;

grant execute on function complete_shared_item(text, uuid, boolean) to anon;
