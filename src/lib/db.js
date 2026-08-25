import Dexie from 'dexie'

export const db = new Dexie('kando')

db.version(1).stores({
  items: 'id, type, status, backlog_priority, priority_rank, scheduled_date, created_at, updated_at, _syncStatus',
  item_relations: 'id, from_item_id, to_item_id, relation_type',
  tags: 'id, kind, name',
  item_tags: '[item_id+tag_id], item_id, tag_id',
  spec_versions: 'id, item_id, version_date',
})
