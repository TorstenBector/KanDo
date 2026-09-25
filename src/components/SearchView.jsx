import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import ItemDetailModal from './ItemDetailModal'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const STATUS_LABEL = { backlog: 'Backlog', prioriterad: 'Prioriterad', planerad: 'Planerad', pagar: 'Pågår', klar: 'Klar' }

const STATUS_FILTERS = ['backlog', 'prioriterad', 'planerad', 'pagar', 'klar']
const ATTACHMENT_FILTERS = [
  { id: 'all', label: 'Alla' },
  { id: 'with', label: '📎 Har bilaga' },
  { id: 'without', label: 'Saknar bilaga' },
]

// Sök = fritext + filter (KanDo Vibe #7257). Taggfiltret är samma globala
// TagChipBar som i övriga vyer (union, som överallt annars) — plus att
// taggarna på varje träff går att klicka på för att lägga till dem i
// filtret. Status och bilaga är lokala filter för just sökvyn. Något
// aktivt filter räcker för att visa träffar, även utan söktext.
export default function SearchView({ selectedTagIds, onToggleTag }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(() => new Set())
  const [attachmentFilter, setAttachmentFilter] = useState('all')
  const [detailItemId, setDetailItemId] = useState(null)
  const allItems = useLiveQuery(() => db.items.toArray(), []) ?? []
  const tagsByItem = useLiveQuery(async () => {
    const [links, tags] = await Promise.all([db.item_tags.toArray(), db.tags.toArray()])
    const tagById = new Map(tags.map((t) => [t.id, t]))
    const map = new Map()
    for (const l of links) {
      const tag = tagById.get(l.tag_id)
      if (!tag) continue
      if (!map.has(l.item_id)) map.set(l.item_id, [])
      map.get(l.item_id).push(tag)
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'sv'))
    return map
  }, []) ?? EMPTY_MAP
  const itemsWithAttachment = useLiveQuery(async () => {
    const rows = await db.item_images.toArray()
    return new Set(rows.map((r) => r.item_id))
  }, []) ?? EMPTY_SET

  const hasTagFilter = selectedTagIds?.size > 0
  const hasFilter = hasTagFilter || statusFilter.size > 0 || attachmentFilter !== 'all'

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q && !hasFilter) return []
    // "#142" or bare "142" matches a KanDo by its short_id, alongside the
    // usual title/description substring search — not instead of it, since
    // a query could coincidentally be numeric for other reasons.
    const idQuery = q.replace(/^#/, '')
    const idIsNumeric = /^\d+$/.test(idQuery)
    return allItems
      .filter((i) =>
        !q ||
        i.title?.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q) ||
        (idIsNumeric && i.short_id != null && String(i.short_id).includes(idQuery))
      )
      .filter((i) => !hasTagFilter || (tagsByItem.get(i.id) ?? []).some((t) => selectedTagIds.has(t.id)))
      .filter((i) => statusFilter.size === 0 || statusFilter.has(i.status))
      .filter((i) => attachmentFilter === 'all' || (attachmentFilter === 'with') === itemsWithAttachment.has(i.id))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }, [allItems, query, hasFilter, hasTagFilter, selectedTagIds, tagsByItem, statusFilter, attachmentFilter, itemsWithAttachment])

  function toggleStatus(status) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  return (
    <div style={{ padding: '1rem' }}>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Sök på titel eller beskrivning…"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '0.6rem 0.8rem',
          borderRadius: theme.radius.md,
          border: `1px solid ${theme.colors.border}`,
          fontSize: '1rem',
          marginBottom: '0.6rem',
        }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.4rem' }}>
        {STATUS_FILTERS.map((status) => (
          <FilterPill key={status} active={statusFilter.has(status)} onClick={() => toggleStatus(status)}>
            {STATUS_LABEL[status]}
          </FilterPill>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
        {ATTACHMENT_FILTERS.map((f) => (
          <FilterPill key={f.id} active={attachmentFilter === f.id} onClick={() => setAttachmentFilter(f.id)}>
            {f.label}
          </FilterPill>
        ))}
      </div>

      {!query.trim() && !hasFilter && (
        <p style={{ color: theme.colors.textMuted }}>Skriv för att söka bland alla dina KanDo's, eller välj taggar/status/bilaga ovan.</p>
      )}
      {(query.trim() || hasFilter) && results.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>
          {query.trim() ? `Inga träffar på "${query.trim()}" med valda filter.` : "Inga KanDo's matchar valda filter."}
        </p>
      )}
      {results.length > 0 && (
        <p style={{ color: theme.colors.textMuted, fontSize: '0.8rem', margin: '0 0 0.5rem' }}>{results.length} träffar</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {results.map((item) => (
          <ResultRow
            key={item.id}
            item={item}
            query={query.trim()}
            tags={tagsByItem.get(item.id) ?? []}
            hasAttachment={itemsWithAttachment.has(item.id)}
            selectedTagIds={selectedTagIds}
            onToggleTag={onToggleTag}
            onOpen={() => setDetailItemId(item.id)}
          />
        ))}
      </div>

      <ItemDetailModal itemId={detailItemId} onClose={() => setDetailItemId(null)} />
    </div>
  )
}

const EMPTY_MAP = new Map()
const EMPTY_SET = new Set()

function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? theme.colors.primary : theme.colors.border}`,
        background: active ? theme.colors.primary : theme.colors.surface,
        color: active ? theme.colors.textOnPrimary : theme.colors.text,
        borderRadius: '999px',
        padding: '0.3rem 0.7rem',
        fontSize: '0.8rem',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

// Wraps the matching substring in <mark> so a hit is easy to spot in a
// longer title/description at a glance.
function Highlighted({ text, query }) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: theme.colors.accent, color: theme.colors.primaryDark, padding: '0 0.1rem' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function ResultRow({ item, query, tags, hasAttachment, selectedTagIds, onToggleTag, onOpen }) {
  const done = item.status === 'klar'
  return (
    <div
      onClick={onOpen}
      style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.sm,
        padding: '0.6rem 0.8rem',
        boxShadow: theme.shadow.sm,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
        {TYPE_LABEL[item.type]} · {STATUS_LABEL[item.status]}{item.short_id != null ? ` · #${item.short_id}` : ''}{hasAttachment ? ' · 📎' : ''}
      </div>
      <div
        style={{
          color: done ? theme.colors.textMuted : theme.colors.text,
          fontWeight: 500,
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        <Highlighted text={item.title} query={query} />
      </div>
      {item.description?.toLowerCase().includes(query.toLowerCase()) && (
        <div style={{ fontSize: '0.8rem', color: theme.colors.textMuted, marginTop: '0.2rem' }}>
          <Highlighted text={item.description} query={query} />
        </div>
      )}
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.35rem' }}>
          {tags.map((tag) => {
            const active = selectedTagIds?.has(tag.id)
            return (
              <button
                key={tag.id}
                onClick={(e) => {
                  e.stopPropagation() // öppna inte KanDo'n, bara filtrera
                  onToggleTag?.(tag.id)
                }}
                title={active ? `Ta bort ${tag.name} från filtret` : `Filtrera på ${tag.name}`}
                style={{
                  border: `1px solid ${active ? theme.colors.primary : theme.colors.border}`,
                  background: active ? theme.colors.primary : theme.colors.bg,
                  color: active ? theme.colors.textOnPrimary : theme.colors.text,
                  borderRadius: '999px',
                  padding: '0.15rem 0.55rem',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                }}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
