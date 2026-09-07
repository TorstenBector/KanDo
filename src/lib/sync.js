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
    // short_id is server-assigned (Postgres identity column) — never echo
    // a local copy of it back on write. The column tolerates an explicit
    // value now (BY DEFAULT, not ALWAYS), but there's no reason for the
    // client to ever send one; stripping it here is the client's half of
    // keeping that field truly read-only from its side.
    const { _syncStatus, short_id, ...row } = item
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

  // Every one of these used to ignore `error` entirely — if a fetch failed
  // (network hiccup, a transient PostgREST schema-cache lag right after a
  // migration, anything), `data` came back null, `?? []`/`?.length` quietly
  // treated that as "nothing to pull", and the sync still reported success
  // with nothing pulled and nothing on screen ever explaining why. Now every
  // failure is collected and surfaced as a real ⚠ Synkfel instead of a
  // silent no-op that looks identical to "already up to date".
  const pullErrors = []

  const { data: remoteItems, error: itemsErr } = await supabase.from('items').select('*').eq('user_id', userId)
  if (itemsErr) pullErrors.push(`KanDo's: ${itemsErr.message}`)
  for (const remote of remoteItems ?? []) {
    const local = await db.items.get(remote.id)
    if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
      await db.items.put({ ...remote, _syncStatus: 'synced' })
    } else if (local.short_id == null && remote.short_id != null) {
      // short_id is assigned by Postgres the moment an item first reaches
      // the server — but that doesn't bump updated_at, so the branch above
      // would otherwise never pull it down onto a local copy that's
      // "already up to date" on everything else. Patch just this one
      // server-authoritative field rather than touching anything else.
      await db.items.update(remote.id, { short_id: remote.short_id })
    }
  }

  const { data: remoteTags, error: tagsErr } = await supabase.from('tags').select('*').eq('user_id', userId)
  if (tagsErr) pullErrors.push(`taggar: ${tagsErr.message}`)
  if (remoteTags?.length) await db.tags.bulkPut(remoteTags)

  // RLS scopes this to the caller's own items automatically.
  const { data: remoteLinks, error: linksErr } = await supabase.from('item_tags').select('item_id, tag_id')
  if (linksErr) pullErrors.push(`taggkopplingar: ${linksErr.message}`)
  if (remoteLinks?.length) await db.item_tags.bulkPut(remoteLinks)

  const { data: remoteRelations, error: relErr } = await supabase.from('item_relations').select('*').eq('user_id', userId)
  if (relErr) pullErrors.push(`relationer: ${relErr.message}`)
  if (remoteRelations?.length) await db.item_relations.bulkPut(remoteRelations)

  // Images are immutable once created (only added/removed, never edited),
  // so only fetch the ones we don't already have locally — re-downloading
  // every existing photo's base64 content on every sync would be wasteful.
  const { data: remoteImageIds, error: imgIdsErr } = await supabase.from('item_images').select('id').eq('user_id', userId)
  if (imgIdsErr) pullErrors.push(`bilder: ${imgIdsErr.message}`)
  if (remoteImageIds?.length) {
    const localIds = new Set(await db.item_images.toCollection().primaryKeys())
    const missingIds = remoteImageIds.map((r) => r.id).filter((id) => !localIds.has(id))
    if (missingIds.length > 0) {
      const { data: fullImages, error: imgErr } = await supabase.from('item_images').select('*').in('id', missingIds)
      if (imgErr) pullErrors.push(`bilder: ${imgErr.message}`)
      if (fullImages?.length) {
        await db.item_images.bulkPut(fullImages.map((img) => ({ ...img, _syncStatus: 'synced' })))
      }
    }
  }

  if (pullErrors.length > 0) {
    const summary = pullErrors.length === 1
      ? pullErrors[0]
      : `${pullErrors.length} delar av synkningen misslyckades, t.ex. ${pullErrors[0]}`
    throw new Error(summary)
  }
}

export async function runFullSync(userId) {
  if (!userId) return
  // Run both regardless of whether the other failed — a flaky pull
  // shouldn't also block pending local edits from at least trying to push,
  // and vice versa. Errors from either are aggregated, not swallowed.
  const errors = []
  try {
    await pullRemoteChanges(userId)
  } catch (err) {
    errors.push(err?.message ?? String(err))
  }
  try {
    await pushPendingChanges(userId)
  } catch (err) {
    errors.push(err?.message ?? String(err))
  }
  if (errors.length > 0) throw new Error(errors.join(' | '))
}
