import Dexie from 'dexie'

export const db = new Dexie('kando')

db.version(1).stores({
  items: 'id, user_id, type, status, backlog_priority, priority_rank, scheduled_date, next_due_date, paused_until, created_at, updated_at, _syncStatus',
  item_relations: 'id, user_id, from_item_id, to_item_id, relation_type',
  tags: 'id, user_id, kind, name',
  item_tags: '[item_id+tag_id], item_id, tag_id',
  spec_versions: 'id, item_id, version_date',
  item_images: 'id, user_id, item_id, created_at, _syncStatus',
})
