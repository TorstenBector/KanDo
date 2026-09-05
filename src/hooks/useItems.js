import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { supabase } from '../lib/supabaseClient'
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

// ISO weekday numbers: 1=Monday .. 7=Sunday. Finds the nearest upcoming date
// (starting tomorrow) whose weekday is in the given set.
function nextWeekdayOccurrence(weekdays) {
  const today = new Date()
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const iso = ((d.getDay() + 6) % 7) + 1
    if (weekdays.includes(iso)) return d.toISOString().slice(0, 10)
  }
  return null
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
    recurrence_weekdays: null,
    next_due_date: null,
    last_completed_at: null,
    kanban_entered: false,
    paused_until: null,
    in_shopping_list: false,
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
  // Weekday mode and day-count mode are alternatives (see setRecurrence /
  // setRecurrenceWeekdays) — weekday wins when both would somehow be set.
  if (item?.recurrence_weekdays?.length) {
    changes.next_due_date = nextWeekdayOccurrence(item.recurrence_weekdays)
  } else if (item?.recurrence_days) {
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
  await db.item_images.where('item_id').equals(id).delete()
  // Upsert-based sync can't express "this is gone" — tell the server
  // directly, best-effort. If offline, the row lingers remotely until
  // deleted again while online; local state is already correct either way.
  const session = useSyncStore.getState().session
  if (session) {
    supabase.from('items').delete().eq('id', id).then(
      () => {},
      () => {} // best-effort; local delete already stands regardless
    )
  }
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

// Full reset to Backlog — for items pulled into Dagens Fokus (or
// Prioriterad) too early. Unlike unschedule(), also drops status back to
// backlog and clears priority_rank, not just the date.
export async function sendToBacklog(id) {
  await updateItem(id, { status: 'backlog', scheduled_date: null, priority_rank: null })
}

export async function setRecurrence(id, days) {
  // Day-count and weekday-based recurrence are alternatives, not combined —
  // picking one clears the other so next_due_date has one unambiguous rule.
  await updateItem(id, { recurrence_days: days, recurrence_weekdays: null })
}

export async function setRecurrenceWeekdays(id, weekdays) {
  await updateItem(id, {
    recurrence_weekdays: weekdays && weekdays.length ? weekdays : null,
    recurrence_days: null,
  })
}

export async function toggleShoppingList(id) {
  const item = await db.items.get(id)
  if (!item) return
  await updateItem(id, { in_shopping_list: !item.in_shopping_list })
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

// Full copy as a starting point for "turns out it's actually three of
// these" — same type/title/description/priority/recurrence/tags, but
// always lands fresh in Backlog (not wherever the original currently is).
export async function cloneItem(id) {
  const original = await db.items.get(id)
  if (!original) return
  const clone = await createItem({
    type: original.type,
    title: original.title,
    description: original.description,
  })
  await updateItem(clone.id, {
    backlog_priority: original.backlog_priority,
    recurrence_days: original.recurrence_days,
    recurrence_weekdays: original.recurrence_weekdays,
  })

  const links = await db.item_tags.where('item_id').equals(id).toArray()
  for (const link of links) {
    await db.item_tags.put({ item_id: clone.id, tag_id: link.tag_id })
  }
  triggerPush()
  return clone
}

// Children default to the parent's current status/type — the common case
// (splitting a Prioriterad task into parts) means they immediately show up
// grouped in the same place, without a separate re-triage step.
export async function addChildItem(parentId, title) {
  const parent = await db.items.get(parentId)
  if (!parent) return
  const child = await createItem({ type: parent.type, title })
  await updateItem(child.id, { status: parent.status })

  // Inherit the parent's tags as a starting default — not a lock, the
  // child's tags can be changed or added to afterward like any other item.
  const parentTagLinks = await db.item_tags.where('item_id').equals(parentId).toArray()
  for (const link of parentTagLinks) {
    await db.item_tags.put({ item_id: child.id, tag_id: link.tag_id })
  }

  const existing = await db.item_relations
    .where({ from_item_id: parentId, relation_type: 'parent_child' })
    .count()
  const userId = useSyncStore.getState().session?.user?.id ?? null
  await db.item_relations.add({
    id: crypto.randomUUID(),
    user_id: userId,
    from_item_id: parentId,
    to_item_id: child.id,
    relation_type: 'parent_child',
    sort_order: existing,
    created_at: new Date().toISOString(),
  })
  triggerPush()
  return child
}

// Manual drag order for a parent's subtasks — mirrors reorderPrioritized
// but scoped to item_relations rows instead of items.priority_rank.
export async function reorderChildren(parentId, orderedChildIds) {
  const relations = await db.item_relations
    .where({ from_item_id: parentId, relation_type: 'parent_child' })
    .toArray()
  const relationByChildId = new Map(relations.map((r) => [r.to_item_id, r]))
  await db.transaction('rw', db.item_relations, async () => {
    for (let i = 0; i < orderedChildIds.length; i++) {
      const relation = relationByChildId.get(orderedChildIds[i])
      if (relation) await db.item_relations.update(relation.id, { sort_order: i })
    }
  })
  triggerPush()
}

// Un-links without deleting the child item itself — it becomes independent.
export async function removeChildRelation(parentId, childId) {
  await db.item_relations
    .where({ from_item_id: parentId, to_item_id: childId, relation_type: 'parent_child' })
    .delete()
  const session = useSyncStore.getState().session
  if (session) {
    supabase.from('item_relations')
      .delete()
      .match({ from_item_id: parentId, to_item_id: childId, relation_type: 'parent_child' })
      .then(() => {}, () => {})
  }
}

// Marking a parent done while it still has open children needs an explicit
// yes — otherwise it's too easy to lose track of unfinished subtasks.
export async function markDoneWithConfirm(id) {
  const relations = await db.item_relations.where('from_item_id').equals(id).toArray()
  const childRelations = relations.filter((r) => r.relation_type === 'parent_child')
  if (childRelations.length > 0) {
    const children = (await db.items.bulkGet(childRelations.map((r) => r.to_item_id))).filter(Boolean)
    const incomplete = children.filter((c) => c.status !== 'klar')
    if (incomplete.length > 0) {
      const noun = incomplete.length === 1 ? 'deluppgift' : 'deluppgifter'
      const ok = window.confirm(
        `Den här KanDo'n har ${incomplete.length} ej klarmarkerad${incomplete.length === 1 ? '' : 'e'} ${noun}. Markera alla som klara?`
      )
      if (!ok) return
      for (const child of incomplete) await markDone(child.id)
    }
  }
  await markDone(id)
  // Mirror image of the check above: a subtask can be dragged/completed
  // independently anywhere in the app (Kanban included), so completing the
  // *last* remaining sibling should offer to close out the parent too,
  // instead of leaving it silently open with nothing left to do.
  await maybeOfferToCompleteParent(id)
}

async function maybeOfferToCompleteParent(childId) {
  const parentRelation = await db.item_relations
    .where({ to_item_id: childId, relation_type: 'parent_child' })
    .first()
  if (!parentRelation) return
  const parent = await db.items.get(parentRelation.from_item_id)
  if (!parent || parent.status === 'klar') return

  const siblingRelations = await db.item_relations
    .where({ from_item_id: parent.id, relation_type: 'parent_child' })
    .toArray()
  const siblings = (await db.items.bulkGet(siblingRelations.map((r) => r.to_item_id))).filter(Boolean)
  if (siblings.length === 0 || !siblings.every((s) => s.status === 'klar')) return

  const ok = window.confirm(`Alla deluppgifter för "${parent.title}" är klara. Markera "${parent.title}" som klar också?`)
  if (ok) await markDoneWithConfirm(parent.id)
}

// Recurring items marked done reappear in Backlog once their frequency
// elapses, instead of staying in Utförda forever. Runs on app load — this
// is a local-first app with no server cron, so "due" is checked whenever
// a device happens to open the app.
export async function reactivateDueRecurringItems() {
  const today = todayISO()
  const due = await db.items
    .filter((i) => i.status === 'klar' && (!!i.recurrence_days || !!i.recurrence_weekdays?.length) && i.next_due_date && i.next_due_date <= today)
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

// "Backlog Arkiv" — pause an item out of the way until a future date
// (specific measurements for a build starting next spring, say) instead of
// scrolling past it in Backlog every day.
export async function pauseItem(id, untilDateISO) {
  await updateItem(id, { paused_until: untilDateISO })
}

export async function resumeItem(id) {
  await updateItem(id, { paused_until: null })
}

// Same on-load pattern as reactivateDueRecurringItems — no server cron,
// so "due" is checked whenever a device happens to open the app.
export async function reactivatePausedItems() {
  const today = todayISO()
  const due = await db.items
    .filter((i) => !!i.paused_until && i.paused_until <= today)
    .toArray()
  for (const item of due) {
    await updateItem(item.id, { paused_until: null })
  }
}
