-- Server-assigned short reference number ("#142") for talking about a
-- specific KanDo during development — never client-generated, since items
-- can be created offline on multiple devices before syncing (a
-- client-assigned counter could collide). Backfills every existing row in
-- one pass, then auto-continues for new inserts. See useItems.js/sync.js.
alter table items add column short_id bigint generated always as identity;

-- Extend the two share-link RPCs so short_id reaches the AI/browser reading
-- a shared list too — that's the actual point: referencing "#142" instead
-- of hunting for a title match.
drop function if exists get_shared_list(text);

create function get_shared_list(p_token text)
returns table (
  list_title text,
  item_id uuid,
  item_short_id bigint,
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
    select v_list.title, i.id, i.short_id, i.title, i.type, i.status, i.claimed_by
    from items i
    join item_tags it on it.item_id = i.id
    where it.tag_id = v_list.tag_id and i.user_id = v_list.user_id
    order by (i.status = 'klar'), i.created_at desc;
end;
$$;

grant execute on function get_shared_list(text) to anon;

drop function if exists get_shared_item_detail(text, uuid);

create function get_shared_item_detail(p_token text, p_item_id uuid)
returns table (
  item_short_id bigint,
  item_title text,
  item_type text,
  item_status text,
  item_description text,
  claimed_by text,
  tags jsonb,
  children jsonb,
  images jsonb
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
      i.short_id, i.title, i.type, i.status, i.description, i.claimed_by,
      coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'kind', t.kind))
        from item_tags it2 join tags t on t.id = it2.tag_id
        where it2.item_id = i.id
      ), '[]'::jsonb) as tags,
      coalesce((
        select jsonb_agg(jsonb_build_object('title', c.title, 'status', c.status) order by ir.sort_order)
        from item_relations ir join items c on c.id = ir.to_item_id
        where ir.from_item_id = i.id and ir.relation_type = 'parent_child'
      ), '[]'::jsonb) as children,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', img.id, 'data_url', img.data_url))
        from item_images img
        where img.item_id = i.id
      ), '[]'::jsonb) as images
    from items i
    where i.id = p_item_id;
end;
$$;

grant execute on function get_shared_item_detail(text, uuid) to anon;
