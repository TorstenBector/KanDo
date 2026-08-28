import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useSyncStore } from '../store/syncStore'

function triggerPush() {
  // Best-effort, fire-and-forget: write-through sync per spec.md — local
  // write already happened, this just tries to get it to the server too.
  useSyncStore.getState().pushOnly()
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(isoDate, days) {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
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
    status: 'backlog',
    backlog_priority: null,
    priority_rank: null,
    scheduled_date: null,
    completed_at: null,
    recurrence_days: null,
    next_due_date: null,
    last_completed_at: null,
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
  const item = await db.items.get(id)
  const now = new Date().toISOString()
  const changes = { status: 'klar', completed_at: now, last_completed_at: now }
  if (item?.recurrence_days) {
    changes.next_due_date = addDays(todayISO(), item.recurrence_days)
  }
  await updateItem(id, changes)
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

export async function scheduleToday(id) {
  await updateItem(id, { scheduled_date: todayISO() })
}

export async function unschedule(id) {
  await updateItem(id, { scheduled_date: null })
}

export async function setRecurrence(id, days) {
  await updateItem(id, { recurrence_days: days })
}

// Direct promote/demote between Backlog and Prioriterad, without needing
// to go through Kanban drag-and-drop — same "+X toggle" pattern as
// scheduleToday/unschedule.
export async function togglePrioritized(id) {
  const item = await db.items.get(id)
  if (!item) return
  if (item.status === 'prioriterad') {
    await updateItem(id, { status: 'backlog', priority_rank: null })
  } else {
    const count = await db.items.where('status').equals('prioriterad').count()
    await updateItem(id, { status: 'prioriterad', priority_rank: count })
  }
}

// Self-heals a schema drift: 'idea' used to be a valid status (merged into
// Backlog on 2026-08-27, see spec.md "Kanban"). The server was migrated,
// but any device with old unsynced local items still had status: 'idea'
// sitting in its own IndexedDB — those failed the server's check constraint
// the moment they tried to push. Runs on app load, cheap no-op once clean.
export async function migrateLegacyItemStatus() {
  const stale = await db.items.filter((i) => i.status === 'idea').toArray()
  for (const item of stale) {
    await updateItem(item.id, { status: 'backlog' })
  }
}

// Recurring items marked done reappear in Backlog once their frequency
// elapses, instead of staying in Utförda forever. Runs on app load — this
// is a local-first app with no server cron, so "due" is checked whenever
// a device happens to open the app.
export async function reactivateDueRecurringItems() {
  const today = todayISO()
  const due = await db.items
    .filter((i) => i.status === 'klar' && !!i.recurrence_days && i.next_due_date && i.next_due_date <= today)
    .toArray()
  for (const item of due) {
    await updateItem(item.id, {
      status: 'backlog',
      completed_at: null,
      next_due_date: null,
      scheduled_date: null, // stale from the previous cycle, not this one
    })
  }
}
