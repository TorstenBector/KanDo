import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useSyncStore } from '../store/syncStore'

function triggerPush() {
  // Best-effort, fire-and-forget: write-through sync per spec.md — local
  // write already happened, this just tries to get it to the server too.
  useSyncStore.getState().pushOnly()
}

export function useItems({ type, status } = {}) {
  return useLiveQuery(async () => {
    const all = await db.items.toArray()
    return all
      .filter((i) => !type || i.type === type)
      .filter((i) => !status || i.status === status)
      .sort((a, b) => (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999))
  }, [type, status])
}

export async function createItem({ type, title, original_text = null, description = null }) {
  const now = new Date().toISOString()
  const userId = useSyncStore.getState().session?.user?.id ?? null
  const item = {
    id: crypto.randomUUID(),
    user_id: userId,
    type,
    title,
    original_text,
    ai_interpretation: null,
    description,
    status: 'idea',
    backlog_priority: null,
    priority_rank: null,
    scheduled_date: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    _syncStatus: 'pending',
  }
  await db.items.add(item)
  triggerPush()
  return item
}

export async function updateItem(id, changes) {
  await db.items.update(id, {
    ...changes,
    updated_at: new Date().toISOString(),
    _syncStatus: 'pending',
  })
  triggerPush()
}

export async function markDone(id) {
  await updateItem(id, { status: 'klar', completed_at: new Date().toISOString() })
}

export async function reopenItem(id) {
  await updateItem(id, { status: 'prioriterad', completed_at: null })
}

export async function deleteItem(id) {
  await db.items.delete(id)
  await db.item_tags.where('item_id').equals(id).delete()
  await db.item_relations.where('from_item_id').equals(id).delete()
  await db.item_relations.where('to_item_id').equals(id).delete()
}

export async function reorderPrioritized(orderedIds) {
  await db.transaction('rw', db.items, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.items.update(orderedIds[i], {
        priority_rank: i,
        updated_at: new Date().toISOString(),
        _syncStatus: 'pending',
      })
    }
  })
  triggerPush()
}
