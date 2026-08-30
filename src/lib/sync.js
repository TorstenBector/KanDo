import { supabase } from './supabaseClient'
import { db } from './db'

// Local items/tags created before the user ever logged in have user_id: null.
// On first login, hand them to the newly authenticated account instead of
// leaving them stranded — nothing captured offline should be lost.
export async function claimLocalData(userId) {
  const orphanItems = await db.items.filter((i) => !i.user_id).toArray()
  for (const item of orphanItems) {
    await db.items.update(item.id, { user_id: userId, _syncStatus: 'pending' })
  }

  const orphanTags = await db.tags.filter((t) => !t.user_id).toArray()
  for (const tag of orphanTags) {
    await db.tags.update(tag.id, { user_id: userId })
  }
}

export async function pushPendingChanges(userId) {
  if (!userId) return

  const pendingItems = await db.items.filter((i) => i._syncStatus === 'pending').toArray()
  const itemErrors = []
  for (const item of pendingItems) {
    const { _syncStatus, ...row } = item
    const { error } = await supabase.from('items').upsert({ ...row, user_id: userId })
    if (error) {
      // Don't let one bad row block every other pending item in the batch —
      // skip it (stays 'pending', retried next sync) and keep going.
      itemErrors.push(`"${item.title}": ${error.message}`)
      continue
    }
    await db.items.update(item.id, { _syncStatus: 'synced' })
  }

  // Tags/links are cheap append-mostly data — just upsert the lot each time
  // rather than tracking a separate dirty flag for them.
  const localTags = await db.tags.where('user_id').equals(userId).toArray()
  if (localTags.length > 0) {
    const { error } = await supabase.from('tags').upsert(localTags)
    if (error) itemErrors.push(`taggar: ${error.message}`)
  }

  const localItemIds = (await db.items.where('user_id').equals(userId).primaryKeys())
  if (localItemIds.length > 0) {
    const links = await db.item_tags.where('item_id').anyOf(localItemIds).toArray()
    if (links.length > 0) {
      const { error } = await supabase.from('item_tags').upsert(links)
      if (error) itemErrors.push(`taggkopplingar: ${error.message}`)
    }
  }

  const localRelations = await db.item_relations.where('user_id').equals(userId).toArray()
  if (localRelations.length > 0) {
    const { error } = await supabase.from('item_relations').upsert(localRelations)
    if (error) itemErrors.push(`relationer: ${error.message}`)
  }

  // Images get their own dirty-flag (like items) rather than the tags-style
  // "upsert everything every cycle" — each row carries a full base64 image,
  // so re-uploading every existing photo on every sync would be wasteful.
  const pendingImages = await db.item_images.filter((i) => i._syncStatus === 'pending').toArray()
  for (const image of pendingImages) {
    const { _syncStatus, ...row } = image
    const { error } = await supabase.from('item_images').upsert({ ...row, user_id: userId })
    if (error) {
      itemErrors.push(`bild: ${error.message}`)
      continue
    }
    await db.item_images.update(image.id, { _syncStatus: 'synced' })
  }

  // Everything that *could* sync did; report what couldn't rather than
  // blocking the whole batch on the first failure.
  if (itemErrors.length > 0) {
    const summary = itemErrors.length === 1
      ? itemErrors[0]
      : `${itemErrors.length} objekt kunde inte synkas, t.ex. ${itemErrors[0]}`
    throw new Error(summary)
  }
}

export async function pullRemoteChanges(userId) {
  if (!userId) return

  const { data: remoteItems } = await supabase.from('items').select('*').eq('user_id', userId)
  for (const remote of remoteItems ?? []) {
    const local = await db.items.get(remote.id)
    if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
      await db.items.put({ ...remote, _syncStatus: 'synced' })
    }
  }

  const { data: remoteTags } = await supabase.from('tags').select('*').eq('user_id', userId)
  if (remoteTags?.length) await db.tags.bulkPut(remoteTags)

  // RLS scopes this to the caller's own items automatically.
  const { data: remoteLinks } = await supabase.from('item_tags').select('item_id, tag_id')
  if (remoteLinks?.length) await db.item_tags.bulkPut(remoteLinks)

  const { data: remoteRelations } = await supabase.from('item_relations').select('*').eq('user_id', userId)
  if (remoteRelations?.length) await db.item_relations.bulkPut(remoteRelations)

  // Images are immutable once created (only added/removed, never edited),
  // so only fetch the ones we don't already have locally — re-downloading
  // every existing photo's base64 content on every sync would be wasteful.
  const { data: remoteImageIds } = await supabase.from('item_images').select('id').eq('user_id', userId)
  if (remoteImageIds?.length) {
    const localIds = new Set(await db.item_images.toCollection().primaryKeys())
    const missingIds = remoteImageIds.map((r) => r.id).filter((id) => !localIds.has(id))
    if (missingIds.length > 0) {
      const { data: fullImages } = await supabase.from('item_images').select('*').in('id', missingIds)
      if (fullImages?.length) {
        await db.item_images.bulkPut(fullImages.map((img) => ({ ...img, _syncStatus: 'synced' })))
      }
    }
  }
}

export async function runFullSync(userId) {
  if (!userId) return
  await pullRemoteChanges(userId)
  await pushPendingChanges(userId)
}
