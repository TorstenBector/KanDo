import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
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

// Existing tags are reused (case-insensitive within the same kind) instead of
// creating near-duplicates — mirrors the AI-capture reuse rule in spec.md.
export async function findOrCreateTag(name, kind = 'category') {
  const trimmed = name.trim()
  if (!trimmed) return null
  const existing = await db.tags
    .filter((t) => t.kind === kind && t.name.toLowerCase() === trimmed.toLowerCase())
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
