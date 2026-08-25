-- KanDo initial schema
-- Unified items table (Idea/Project/Task), relations, tags, spec versions.
-- See spec.md "Datamodell" for rationale.

create extension if not exists "pgcrypto";

create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('idea','project','task')),
  title text not null,
  original_text text,
  ai_interpretation text,
  description text,
  status text not null default 'idea' check (status in ('idea','backlog','prioriterad','planerad','pagar','klar')),
  backlog_priority text check (backlog_priority in ('hog','medel','lag')),
  priority_rank integer,
  scheduled_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_user_id_idx on items(user_id);
create index items_status_idx on items(status);
create index items_scheduled_date_idx on items(scheduled_date);

create table item_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_item_id uuid not null references items(id) on delete cascade,
  to_item_id uuid not null references items(id) on delete cascade,
  relation_type text not null check (relation_type in ('parent_child','depends_on')),
  created_at timestamptz not null default now(),
  unique (from_item_id, to_item_id, relation_type)
);

create index item_relations_from_idx on item_relations(from_item_id);
create index item_relations_to_idx on item_relations(to_item_id);

create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'category' check (kind in ('category','context')),
  created_at timestamptz not null default now()
);

create unique index tags_user_name_kind_idx on tags(user_id, lower(name), kind);

create table item_tags (
  item_id uuid not null references items(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (item_id, tag_id)
);

create table spec_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  content text not null,
  version_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (item_id, version_date)
);

create index spec_versions_item_id_idx on spec_versions(item_id);

-- Keep only the 3 most recent versions per item (Nuvarande/Tidigare/Ännu tidigare).
create or replace function trim_spec_versions() returns trigger as $$
begin
  delete from spec_versions
  where item_id = new.item_id
    and id not in (
      select id from spec_versions
      where item_id = new.item_id
      order by version_date desc
      limit 3
    );
  return new;
end;
$$ language plpgsql security definer;

create trigger trim_spec_versions_trigger
  after insert or update on spec_versions
  for each row execute function trim_spec_versions();

-- updated_at bookkeeping on items
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger items_set_updated_at
  before update on items
  for each row execute function set_updated_at();

-- Row-level security: plain per-user ownership, no role hierarchy.
alter table items enable row level security;
alter table item_relations enable row level security;
alter table tags enable row level security;
alter table item_tags enable row level security;
alter table spec_versions enable row level security;

create policy items_owner on items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy item_relations_owner on item_relations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy tags_owner on tags
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy item_tags_owner on item_tags
  for all using (
    exists (select 1 from items where items.id = item_tags.item_id and items.user_id = auth.uid())
  ) with check (
    exists (select 1 from items where items.id = item_tags.item_id and items.user_id = auth.uid())
  );

create policy spec_versions_owner on spec_versions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
