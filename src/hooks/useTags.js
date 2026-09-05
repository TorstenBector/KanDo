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

export function useItemTags(itemId) {
  return useLiveQuery(async () => {
    if (!itemId) return []
    const links = await db.item_tags.where('item_id').equals(itemId).toArray()
    const tags = await Promise.all(links.map((l) => db.tags.get(l.tag_id)))
    return tags.filter(Boolean)
  }, [itemId])
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
  const tag = {
    id: crypto.randomUUID(),
    user_id: userId,
    name: trimmed,
    kind,
    created_at: new Date().toISOString(),
  }
  await db.tags.add(tag)
  useSyncStore.getState().pushOnly()
  return tag
}

export async function renameTag(tagId, newName) {
  const trimmed = newName.trim()
  if (!trimmed) return
  await db.tags.update(tagId, { name: trimmed })
  useSyncStore.getState().pushOnly()
}

export async function setTagKind(tagId, kind) {
  await db.tags.update(tagId, { kind })
  useSyncStore.getState().pushOnly()
}

// Deletes a tag and every item's link to it (the item itself is untouched,
// it just loses that tag) — used from Tagghantering with an explicit
// confirmation showing how many items are affected.
export async function deleteTagEverywhere(tagId) {
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
