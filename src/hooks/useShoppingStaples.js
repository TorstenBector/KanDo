import { db } from '../lib/db'
import { supabase } from '../lib/supabaseClient'
import { useSyncStore } from '../store/syncStore'

function triggerPush() {
  useSyncStore.getState().pushOnly()
}

const DEFAULT_STAPLES = ['Mjölk', 'Kvarg', 'Bröd', 'Pålägg', 'Smör', 'Fil', 'Frukt', 'Grönsaker', 'Potatis']

// Seeds the example template on first use only — a no-op once the user has
// any staples at all, including if they've deleted every default down to
// zero on purpose (there's no separate "seeded before" flag to tell that
// apart from "never seeded", so an empty list always looks first-time).
// The count-check and bulkAdd run inside one transaction so React
// StrictMode's double-invoked effect (or any other concurrent call) can't
// race two "count is 0" reads past each other and seed the list twice —
// readwrite transactions on the same store serialize in IndexedDB.
export async function seedDefaultStaplesIfEmpty() {
  const userId = useSyncStore.getState().session?.user?.id ?? null
  const now = new Date().toISOString()
  const seeded = await db.transaction('rw', db.shopping_staples, async () => {
    const count = await db.shopping_staples.count()
    if (count > 0) return false
    const rows = DEFAULT_STAPLES.map((name, i) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      name,
      checked: false,
      sort_order: i,
      created_at: now,
      updated_at: now,
      _syncStatus: 'pending',
    }))
    await db.shopping_staples.bulkAdd(rows)
    return true
  })
  if (seeded) triggerPush()
}

export async function addStaple(name) {
  const trimmed = name.trim()
  if (!trimmed) return
  const userId = useSyncStore.getState().session?.user?.id ?? null
  const now = new Date().toISOString()
  const existing = await db.shopping_staples.toArray()
  const maxOrder = existing.reduce((max, s) => Math.max(max, s.sort_order ?? 0), -1)
  await db.shopping_staples.add({
    id: crypto.randomUUID(),
    user_id: userId,
    name: trimmed,
    checked: false,
    sort_order: maxOrder + 1,
    created_at: now,
    updated_at: now,
    _syncStatus: 'pending',
  })
  triggerPush()
}

export async function toggleStapleChecked(id) {
  const staple = await db.shopping_staples.get(id)
  if (!staple) return
  await db.shopping_staples.update(id, {
    checked: !staple.checked,
    updated_at: new Date().toISOString(),
    _syncStatus: 'pending',
  })
  triggerPush()
}

export async function renameStaple(id, name) {
  const trimmed = name.trim()
  if (!trimmed) return
  await db.shopping_staples.update(id, {
    name: trimmed,
    updated_at: new Date().toISOString(),
    _syncStatus: 'pending',
  })
  triggerPush()
}

export async function deleteStaple(id) {
  await db.shopping_staples.delete(id)
  const session = useSyncStore.getState().session
  if (session) {
    supabase.from('shopping_staples').delete().eq('id', id).then(
      () => {},
      () => {} // best-effort; local delete already stands regardless
    )
  }
}

// "Återställ" — uncheck everything that was bocked off during the last
// store run, so the template is ready for next time.
export async function resetCheckedStaples() {
  const all = await db.shopping_staples.toArray()
  const checkedIds = all.filter((s) => s.checked).map((s) => s.id)
  if (checkedIds.length === 0) return
  const now = new Date().toISOString()
  await db.transaction('rw', db.shopping_staples, async () => {
    for (const id of checkedIds) {
      await db.shopping_staples.update(id, { checked: false, updated_at: now, _syncStatus: 'pending' })
    }
  })
  triggerPush()
}
