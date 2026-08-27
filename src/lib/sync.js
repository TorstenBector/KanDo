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
  for (const item of pendingItems) {
    const { _syncStatus, ...row } = item
    const { error } = await supabase.from('items').upsert({ ...row, user_id: userId })
    if (error) {
      throw new Error(`Kunde inte synka "${item.title}": ${error.message}`)
    }
    await db.items.update(item.id, { _syncStatus: 'synced' })
  }

  // Tags/links are cheap append-mostly data — just upsert the lot each time
  // rather than tracking a separate dirty flag for them.
  const localTags = await db.tags.where('user_id').equals(userId).toArray()
  if (localTags.length > 0) {
    const { error } = await supabase.from('tags').upsert(localTags)
    if (error) throw new Error(`Kunde inte synka taggar: ${error.message}`)
  }

  const localItemIds = (await db.items.where('user_id').equals(userId).primaryKeys())
  if (localItemIds.length > 0) {
    const links = await db.item_tags.where('item_id').anyOf(localItemIds).toArray()
    if (links.length > 0) {
      const { error } = await supabase.from('item_tags').upsert(links)
      if (error) throw new Error(`Kunde inte synka taggkopplingar: ${error.message}`)
    }
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
}

export async function runFullSync(userId) {
  if (!userId) return
  await pullRemoteChanges(userId)
  await pushPendingChanges(userId)
}
