import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { supabase } from '../lib/supabaseClient'
import { useSyncStore } from '../store/syncStore'

// Downscale + re-encode before storing — these sync as plain base64 text
// (see item_images migration), so keeping each one to roughly 150-400KB
// instead of a raw multi-MB phone photo matters a lot for sync cost.
function compressImage(file, maxDim = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export function useItemImages(itemId) {
  return useLiveQuery(async () => {
    if (!itemId) return []
    const images = await db.item_images.where('item_id').equals(itemId).toArray()
    return images.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }, [itemId]) ?? []
}

export async function addImage(itemId, file) {
  const dataUrl = await compressImage(file)
  const userId = useSyncStore.getState().session?.user?.id ?? null
  const image = {
    id: crypto.randomUUID(),
    user_id: userId,
    item_id: itemId,
    data_url: dataUrl,
    created_at: new Date().toISOString(),
    _syncStatus: 'pending',
  }
  await db.item_images.add(image)
  useSyncStore.getState().pushOnly()
  return image
}

export async function removeImage(imageId) {
  await db.item_images.delete(imageId)
  const session = useSyncStore.getState().session
  if (session) {
    supabase.from('item_images').delete().eq('id', imageId).then(() => {}, () => {})
  }
}
