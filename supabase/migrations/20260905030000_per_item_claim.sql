-- Sharing a list turned out to need per-item claiming, not a single
-- whole-list "accept": several people (e.g. three kids) open the SAME link
-- and each picks a different item off it, like drawing a card off a board.
-- The whole-list accepted_by/accepted_at never got real use — replaced.

alter table shared_lists drop column if exists accepted_by;
alter table shared_lists drop column if exists accepted_at;
drop function if exists accept_shared_list(text, text);

-- Whoever claims an item — visible both on the public page (so a sibling
-- can see it's already spoken for) and in the owner's own app everywhere
-- the item shows up.
alter table items add column claimed_by text;

-- Return shape changed (dropped accepted_by/accepted_at, added claimed_by
-- per item instead of one per list) — Postgres won't let create-or-replace
-- change a function's OUT columns, so drop it first.
drop function if exists get_shared_list(text);

create function get_shared_list(p_token text)
returns table (
  list_title text,
  item_id uuid,
  item_title text,
  item_type text,
  item_status text,
  claimed_by text
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
    select v_list.title, i.id, i.title, i.type, i.status, i.claimed_by
    from items i
    join item_tags it on it.item_id = i.id
    where it.tag_id = v_list.tag_id and i.user_id = v_list.user_id
    order by (i.status = 'klar'), i.created_at desc;
end;
$$;

grant execute on function get_shared_list(text) to anon;

-- "Jag tar den här" / "Släpp den" — p_name null (or blank) releases a claim.
-- Same security shape as complete_shared_item: re-verify the item actually
-- belongs to this share's tag+owner before touching anything.
create or replace function claim_shared_item(p_token text, p_item_id uuid, p_name text)
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

  update items set claimed_by = nullif(trim(p_name), ''), updated_at = now() where id = p_item_id;
end;
$$;

grant execute on function claim_shared_item(text, uuid, text) to anon;

-- "Klicka in på uppgiften och se hela KanDo-kortet" — description, tags,
-- and subtasks, fetched only when a card is actually opened (kept out of
-- the list RPC above to keep that one light).
create or replace function get_shared_item_detail(p_token text, p_item_id uuid)
returns table (
  item_title text,
  item_type text,
  item_status text,
  item_description text,
  claimed_by text,
  tags jsonb,
  children jsonb
)
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

  return query
    select
      i.title, i.type, i.status, i.description, i.claimed_by,
      coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'kind', t.kind))
        from item_tags it2 join tags t on t.id = it2.tag_id
        where it2.item_id = i.id
      ), '[]'::jsonb) as tags,
      coalesce((
        select jsonb_agg(jsonb_build_object('title', c.title, 'status', c.status) order by ir.sort_order)
        from item_relations ir join items c on c.id = ir.to_item_id
        where ir.from_item_id = i.id and ir.relation_type = 'parent_child'
      ), '[]'::jsonb) as children
    from items i
    where i.id = p_item_id;
end;
$$;

grant execute on function get_shared_item_detail(text, uuid) to anon;
