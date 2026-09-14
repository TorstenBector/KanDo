-- tags was the only synced table with no updated_at / last-write-wins
-- protection — sync.js pushed every local tag unconditionally on every
-- cycle instead of gating on a dirty flag + timestamp comparison like
-- items already does. That's fine for a device that's always been synced,
-- but a device that reconnects after a long time offline (session expired,
-- app never reopened) would silently clobber renamed/reorganized/deleted
-- tags with its own stale local copies the moment it logged back in and
-- synced — no error, no warning, just gone. Bringing tags in line with the
-- same per-row LWW protocol items already use closes that gap.
alter table tags add column updated_at timestamptz not null default now();

create trigger tags_set_updated_at
  before update on tags
  for each row execute function set_updated_at();
