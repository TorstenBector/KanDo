import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { supabase } from '../lib/supabaseClient'
import { useSyncStore } from '../store/syncStore'

// Non-image attachments are stored raw (no re-encode), so unlike photos
// there's no compression step keeping them small — cap the source file
// itself. Kept modest since these sync as plain base64 text in the same
// item_images row/table as photos (see item_attachments migration).
export const MAX_ATTACHMENT_SIZE = 1 * 1024 * 1024 // 1 MB

const KIND_ICON = {
  markdown: '📝',
  text: '📄',
  excel: '📊',
}

// Canonical MIME per kind, stored instead of the raw file.type — a file
// pasted from the clipboard often has an empty type, and an empty
// mime_type would read as a legacy photo in isImageAttachment below
// (rendered as a broken <img>).
const KIND_MIME = {
  markdown: 'text/markdown',
  text: 'text/plain',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

// Detects kind from both MIME type and extension — a file pasted from the
// clipboard (vs. picked via <input type=file>) often arrives with an empty
// or generic `type` (e.g. "application/octet-stream"), so the extension is
// the more reliable signal in practice.
export function getAttachmentKind(file) {
  const name = file.name || ''
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (file.type?.startsWith('image/')) return 'image'
  if (ext === '.md' || ext === '.markdown' || file.type === 'text/markdown') return 'markdown'
  if (ext === '.txt' || file.type === 'text/plain') return 'text'
  if (
    ext === '.xlsx' || ext === '.xls' ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
  ) return 'excel'
  return null
}

export function attachmentIcon(kind) {
  return KIND_ICON[kind] ?? '📎'
}

// Returns an error message (Swedish, ready to show the user) if the file
// can't be attached, or null if it's fine.
export function checkAttachmentAllowed(file) {
  const kind = getAttachmentKind(file)
  if (!kind) return `Filtypen stöds inte (${file.name || 'okänd fil'}). Stödda format: bilder, Markdown, Excel, textfil.`
  if (kind !== 'image' && file.size > MAX_ATTACHMENT_SIZE) {
    return `"${file.name}" är för stor (max 1 MB för icke-bildfiler).`
  }
  return null
}

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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Decodes a non-image attachment's data: URL back to plain text, for the
// simple in-app preview (Markdown/textfiler render as-is, no styling).
export function decodeTextAttachment(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

export function useItemAttachments(itemId) {
  return useLiveQuery(async () => {
    if (!itemId) return []
    const rows = await db.item_images.where('item_id').equals(itemId).toArray()
    return rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }, [itemId]) ?? []
}

// Rows created before this feature have neither filename nor mime_type —
// that's the legacy "always a photo" case. Checking filename too (not just
// mime_type) keeps a stray empty mime_type on a real file from being
// mistaken for a photo.
export function isImageAttachment(row) {
  if (row.mime_type) return row.mime_type.startsWith('image/')
  return !row.filename
}

// Kind of a stored row (vs. getAttachmentKind, which takes a File).
export function attachmentKindOf(row) {
  if (isImageAttachment(row)) return 'image'
  return getAttachmentKind({ name: row.filename ?? '', type: row.mime_type ?? '' })
}

export async function addAttachment(itemId, file) {
  const error = checkAttachmentAllowed(file)
  if (error) throw new Error(error)

  const kind = getAttachmentKind(file)
  const dataUrl = kind === 'image' ? await compressImage(file) : await readFileAsDataUrl(file)
  const userId = useSyncStore.getState().session?.user?.id ?? null
  const row = {
    id: crypto.randomUUID(),
    user_id: userId,
    item_id: itemId,
    data_url: dataUrl,
    filename: kind === 'image' ? null : file.name,
    mime_type: kind === 'image' ? 'image/jpeg' : KIND_MIME[kind],
    created_at: new Date().toISOString(),
    _syncStatus: 'pending',
  }
  await db.item_images.add(row)
  useSyncStore.getState().pushOnly()
  return row
}

export async function removeAttachment(attachmentId) {
  await db.item_images.delete(attachmentId)
  const session = useSyncStore.getState().session
  if (session) {
    supabase.from('item_images').delete().eq('id', attachmentId).then(() => {}, () => {})
  }
}

// Triggers a browser download for a non-previewable attachment (Excel).
// Data: URLs opened via target="_blank" are silently blocked on iOS Safari
// (see ItemDetailModal's lightbox comment) — the `download` attribute on a
// synthetic click sidesteps that instead of navigating.
export function downloadAttachment(dataUrl, filename) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename || 'fil'
  a.click()
}
