-- "Gå till Dagens Fokus i KanDo och hämta de KanDo's som är taggade med
-- Vibe" — the share-link RPCs never exposed scheduled_date, so an AI reading
-- a shared list had no way to tell which items are actually in today's
-- focus (it just saw every open Vibe item). This mirrors DagensFokus.jsx
-- server-side so only the valid ones come back:
--   - 'idag'    scheduled on p_date
--   - 'prio'    only when NOTHING (any tag) is scheduled on p_date and p_date
--               is today: the top-5 prioriterad fallback, same ordering as
--               byPriorityThenRank — then narrowed to the shared tag, exactly
--               like the tag filter narrows the list in the app
--   - 'missad'  scheduled before today and never marked klar
-- p_date defaults to today in Swedish time (the app uses the device's local
-- date, which for Torsten is Europe/Stockholm).
create function get_shared_focus(p_token text, p_date date default null)
returns table (
  focus_reason text,
  item_id uuid,
  item_short_id bigint,
  item_title text,
  item_type text,
  item_status text,
  scheduled_date date,
  backlog_priority text,
  claimed_by text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_list shared_lists%rowtype;
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_date date := coalesce(p_date, (now() at time zone 'Europe/Stockholm')::date);
  v_any_scheduled boolean;
begin
  select * into v_list from shared_lists where token = p_token;
  if not found then
    return;
  end if;

  select exists (
    select 1 from items i0 where i0.user_id = v_list.user_id and i0.scheduled_date = v_date
  ) into v_any_scheduled;

  return query
    with focus as (
      select 'idag'::text as reason, i.*
      from items i
      where v_any_scheduled and i.user_id = v_list.user_id and i.scheduled_date = v_date
      union all
      select 'prio', p.*
      from (
        select i.*
        from items i
        where not v_any_scheduled and v_date = v_today
          and i.user_id = v_list.user_id and i.status = 'prioriterad'
        order by case i.backlog_priority when 'hog' then 0 when 'medel' then 1 when 'lag' then 2 else 3 end,
                 coalesce(i.priority_rank, 999999)
        limit 5
      ) p
      union all
      select 'missad', i.*
      from items i
      where i.user_id = v_list.user_id and i.scheduled_date < v_today and i.status <> 'klar'
    )
    select f.reason, f.id, f.short_id, f.title, f.type, f.status, f.scheduled_date, f.backlog_priority, f.claimed_by
    from focus f
    where exists (select 1 from item_tags it where it.item_id = f.id and it.tag_id = v_list.tag_id)
    order by case f.reason when 'idag' then 0 when 'prio' then 1 else 2 end,
             (f.status = 'klar'), f.scheduled_date;
end;
$$;

grant execute on function get_shared_focus(text, date) to anon;
