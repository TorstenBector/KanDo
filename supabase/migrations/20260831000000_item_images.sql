-- Photos/screenshots attached under an item's Beskrivning (measurements
-- documented with a photo, etc). Stored as compressed base64 data URLs in
-- a plain text column rather than Supabase Storage — simpler to keep
-- consistent with the rest of the local-first sync model, at the cost of
-- not scaling to many large images. Client-side compresses before storing
-- (see ItemDetailModal.jsx) to keep this reasonable at personal-app scale.
create table item_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  data_url text not null,
  created_at timestamptz not null default now()
);

create index item_images_item_id_idx on item_images(item_id);

alter table item_images enable row level security;

create policy item_images_owner on item_images
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
