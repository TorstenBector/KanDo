import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { deleteTagEverywhere } from '../hooks/useTags'
import ItemDetailModal from './ItemDetailModal'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const STATUS_LABEL = { backlog: 'Backlog', prioriterad: 'Prioriterad', planerad: 'Planerad', pagar: 'Pågår', klar: 'Klar' }

// Answers the question Tagghantering itself can't: "which KanDo actually
// has this tag, and where is it?" — every status, not just the non-klar
// ones Backlog shows, since a tag whose only carrier is already Klar would
// otherwise look like a dead end. usageCounts in Tagghantering just counts
// item_tags rows, which can outlive a deleted item — bulkGet + filter(Boolean)
// below drops any such orphaned links rather than showing a blank row.
export default function TagItemsModal({ tag, onClose }) {
  const [detailItemId, setDetailItemId] = useState(null)

  const items = useLiveQuery(async () => {
    const links = await db.item_tags.where('tag_id').equals(tag.id).toArray()
    const found = await db.items.bulkGet(links.map((l) => l.item_id))
    return found.filter(Boolean).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }, [tag.id])

  async function handleCleanup() {
    if (!window.confirm(`Ingen KanDo har längre taggen "${tag.name}". Ta bort den?`)) return
    await deleteTagEverywhere(tag.id)
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(26,58,26,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 280,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.bg,
          borderRadius: `${theme.radius.lg} ${theme.radius.lg} 0 0`,
          padding: '1rem', width: '100%', maxWidth: '520px', maxHeight: '85vh',
          overflowY: 'auto', boxShadow: theme.shadow.md, boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 600, color: theme.colors.text }}>
            {tag.kind === 'context' ? '📍 ' : '🏷 '}{tag.name}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: theme.colors.textMuted, cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        {items === undefined && <p style={{ color: theme.colors.textMuted }}>Laddar…</p>}

        {items?.length === 0 && (
          <div>
            <p style={{ color: theme.colors.textMuted }}>
              Ingen KanDo har den här taggen just nu — den kan ha blivit borttagen, eller taggen kan ha slutat användas.
            </p>
            <button onClick={handleCleanup} style={dangerBtn}>Ta bort taggen</button>
          </div>
        )}

        {items?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map((item) => {
              const done = item.status === 'klar'
              return (
                <div
                  key={item.id}
                  onClick={() => setDetailItemId(item.id)}
                  style={{
                    background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.radius.sm, padding: '0.6rem 0.8rem', boxShadow: theme.shadow.sm, cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
                    {TYPE_LABEL[item.type]} · {STATUS_LABEL[item.status]}
                  </div>
                  <div style={{ color: done ? theme.colors.textMuted : theme.colors.text, fontWeight: 500, textDecoration: done ? 'line-through' : 'none' }}>
                    {item.title}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ItemDetailModal itemId={detailItemId} onClose={() => setDetailItemId(null)} />
    </div>
  )
}

const dangerBtn = {
  background: theme.colors.danger,
  color: '#fff',
  border: 'none',
  borderRadius: theme.radius.sm,
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  fontWeight: 600,
  marginTop: '0.5rem',
}
