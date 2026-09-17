import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { supabase } from '../lib/supabaseClient'
import { useSyncStore } from '../store/syncStore'

export function useTags(kind) {
  return useLiveQuery(async () => {
    const all = await db.tags.toArray()
    return kind ? all.filter((t) => t.kind === kind) : all
  }, [kind])
}

// Tags without a sort_order (created before manual ordering existed, or
// brand new) sort after every explicitly-ordered tag, alphabetically among
// themselves — never jumbled in with the ordered ones by insertion order.
export function sortTagsByOrder(tags) {
  return [...tags].sort((a, b) => {
    const aHas = a.sort_order != null
    const bHas = b.sort_order != null
    if (aHas && bHas) return a.sort_order - b.sort_order
    if (aHas !== bHas) return aHas ? -1 : 1
    return a.name.localeCompare(b.name, 'sv')
  })
}

// Same shape as reorderPrioritized (items) / reorderChildren (subtasks) —
// drag-to-reorder in Tagghantering, driving both the chip bar everywhere
// and Dagens Fokus's "group by tag" order.
export async function reorderTags(orderedIds) {
  const now = new Date().toISOString()
  await Promise.all(orderedIds.map((id, index) =>
    db.tags.update(id, { sort_order: index, updated_at: now, _syncStatus: 'pending' })
  ))
  useSyncStore.getState().pushOnly()
}

// Adds a tag to an item, cascading up to the parent tag if it has one —
// e.g. tagging something "Inne" also tags it "Hus", so selecting the
// top-level "Hus" filter finds it without the filter logic needing to know
// about the tag tree at all (see TagChipBar). Two levels only (enforced by
// setTagParent below), so this never needs to cascade more than once.
// Every "add a tag to an item" call site (TagInput's onAdd in
// ItemDetailModal/BacklogView, QuickCapture's save loop, the
// co-occurrence-suggestion chips) should go through this instead of a bare
// db.item_tags.put, or a child tag stops reliably implying its parent.
export async function addItemTag(itemId, tagId) {
  await db.item_tags.put({ item_id: itemId, tag_id: tagId })
  const tag = await db.tags.get(tagId)
  if (tag?.parent_tag_id) {
    await db.item_tags.put({ item_id: itemId, tag_id: tag.parent_tag_id })
  }
  useSyncStore.getState().pushOnly()
}

// Sets (or clears, with parentTagId=null) which tag a tag belongs under.
// Kept to two flat levels: refuses if `tagId` already has children of its
// own (would make it both a parent and a child) or if `parentTagId` itself
// already has a parent (would make a grandchild). Returns null on success,
// or a user-facing Swedish error string to show instead of applying anything.
//
// Setting a parent backfills every item currently tagged `tagId` with the
// parent tag too, so existing KanDo's already filed under e.g. "Inne" show
// up under "Hus" immediately — not just ones tagged after the fact.
export async function setTagParent(tagId, parentTagId) {
  if (tagId === parentTagId) return 'En tagg kan inte vara sin egen förälder.'

  if (parentTagId) {
    const [ownChildren, parentTag] = await Promise.all([
      db.tags.where('parent_tag_id').equals(tagId).count(),
      db.tags.get(parentTagId),
    ])
    if (ownChildren > 0) return 'Den här taggen har redan egna undertaggar — bara två nivåer stöds.'
    if (parentTag?.parent_tag_id) return `"${parentTag.name}" har själv en förälder — bara två nivåer stöds.`
  }

  await db.tags.update(tagId, {
    parent_tag_id: parentTagId ?? null,
    updated_at: new Date().toISOString(),
    _syncStatus: 'pending',
  })

  if (parentTagId) {
    const links = await db.item_tags.where('tag_id').equals(tagId).toArray()
    await Promise.all(links.map((l) => db.item_tags.put({ item_id: l.item_id, tag_id: parentTagId })))
  }

  useSyncStore.getState().pushOnly()
  return null
}

export function useItemTags(itemId) {
  return useLiveQuery(async () => {
    if (!itemId) return []
    const links = await db.item_tags.where('item_id').equals(itemId).toArray()
    const tags = await Promise.all(links.map((l) => db.tags.get(l.tag_id)))
    return tags.filter(Boolean)
  }, [itemId])
}

// Given the tag ids already applied to the item being edited, finds other
// tags that have shown up TOGETHER with any of them on at least one other
// item, ranked by how often — e.g. once a couple of items carry both
// "Vibe" + "TidKoll" and others carry "Vibe" + "KanDo", picking "Vibe" on a
// new item surfaces TidKoll/KanDo as one-click suggestions. Used to guide
// consistent double-tagging (project tag + "Vibe") across several apps
// sharing one KanDo instance, instead of relying on remembering the
// convention every time.
export function useCoOccurringTags(appliedTagIds) {
  const key = appliedTagIds && appliedTagIds.size > 0 ? [...appliedTagIds].sort().join(',') : ''
  return useLiveQuery(async () => {
    if (!key) return []
    const selected = new Set(key.split(','))
    const links = await db.item_tags.toArray()
    const tagIdsByItem = new Map()
    for (const link of links) {
      if (!tagIdsByItem.has(link.item_id)) tagIdsByItem.set(link.item_id, new Set())
      tagIdsByItem.get(link.item_id).add(link.tag_id)
    }
    const counts = new Map()
    for (const itemTagIds of tagIdsByItem.values()) {
      if (![...selected].some((id) => itemTagIds.has(id))) continue
      for (const tagId of itemTagIds) {
        if (selected.has(tagId)) continue
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1)
      }
    }
    if (counts.size === 0) return []
    const tagIds = [...counts.keys()]
    const tags = await db.tags.bulkGet(tagIds)
    return tags
      .map((tag, i) => (tag ? { tag, count: counts.get(tagIds[i]) } : null))
      .filter(Boolean)
      .sort((a, b) => b.count - a.count)
  }, [key]) ?? []
}

// How many items currently carry this tag — shown in Tagghantering so a
// merge/delete decision isn't made blind.
export function useTagUsageCounts() {
  return useLiveQuery(async () => {
    const links = await db.item_tags.toArray()
    const counts = new Map()
    for (const link of links) counts.set(link.tag_id, (counts.get(link.tag_id) ?? 0) + 1)
    return counts
  }, []) ?? new Map()
}

// Existing tags are reused case-insensitively by name ALONE now — name is
// the uniqueness key, not name+kind. Two tags named "Jobb" (one category,
// one context) used to coexist as separate chips just because of which
// button got clicked at creation; now whichever kind the tag already has
// wins, so retyping an existing name can never spawn a duplicate chip.
export async function findOrCreateTag(name, kind = 'category') {
  const trimmed = name.trim()
  if (!trimmed) return null
  const existing = await db.tags
    .filter((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    .first()
  if (existing) return existing
  const userId = useSyncStore.getState().session?.user?.id ?? null
  const now = new Date().toISOString()
  const tag = {
    id: crypto.randomUUID(),
    user_id: userId,
    name: trimmed,
    kind,
    created_at: now,
    updated_at: now,
    _syncStatus: 'pending',
  }
  await db.tags.add(tag)
  useSyncStore.getState().pushOnly()
  return tag
}

export async function renameTag(tagId, newName) {
  const trimmed = newName.trim()
  if (!trimmed) return
  await db.tags.update(tagId, { name: trimmed, updated_at: new Date().toISOString(), _syncStatus: 'pending' })
  useSyncStore.getState().pushOnly()
}

export async function setTagKind(tagId, kind) {
  await db.tags.update(tagId, { kind, updated_at: new Date().toISOString(), _syncStatus: 'pending' })
  useSyncStore.getState().pushOnly()
}

// Deletes a tag and every item's link to it (the item itself is untouched,
// it just loses that tag) — used from Tagghantering with an explicit
// confirmation showing how many items are affected.
export async function deleteTagEverywhere(tagId) {
  // Un-parent any children locally too — Postgres does this itself
  // (parent_tag_id references tags on delete set null) but only remotely;
  // without this, a child tag would still dangle-reference the just-
  // deleted parent until the next pull sync happened to correct it.
  const orphanedChildren = await db.tags.where('parent_tag_id').equals(tagId).toArray()
  await Promise.all(orphanedChildren.map((c) =>
    db.tags.update(c.id, { parent_tag_id: null, updated_at: new Date().toISOString(), _syncStatus: 'pending' })
  ))
  await db.item_tags.where('tag_id').equals(tagId).delete()
  await db.tags.delete(tagId)
  const session = useSyncStore.getState().session
  if (session) {
    supabase.from('item_tags').delete().eq('tag_id', tagId).then(() => {}, () => {})
    supabase.from('tags').delete().eq('id', tagId).then(() => {}, () => {})
  }
}

// "Work" and "Jobb" are the same tag to a person, not to a string compare —
// pick one surviving tag (name/kind stay as they already are) and fold
// every other selected tag's item links into it, then remove the rest.
export async function mergeTags(tagIds, survivingTagId) {
  const otherIds = tagIds.filter((id) => id !== survivingTagId)
  for (const oldId of otherIds) {
    const links = await db.item_tags.where('tag_id').equals(oldId).toArray()
    for (const link of links) {
      const alreadyHasSurvivor = await db.item_tags.get([link.item_id, survivingTagId])
      await db.item_tags.delete([link.item_id, oldId])
      if (!alreadyHasSurvivor) {
        await db.item_tags.put({ item_id: link.item_id, tag_id: survivingTagId })
      }
    }
    await db.tags.delete(oldId)
    const session = useSyncStore.getState().session
    if (session) {
      supabase.from('item_tags').delete().eq('tag_id', oldId).then(() => {}, () => {})
      supabase.from('tags').delete().eq('id', oldId).then(() => {}, () => {})
    }
  }
  useSyncStore.getState().pushOnly()
}
