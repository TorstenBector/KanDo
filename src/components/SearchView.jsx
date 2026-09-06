import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import ItemDetailModal from './ItemDetailModal'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const STATUS_LABEL = { backlog: 'Backlog', prioriterad: 'Prioriterad', planerad: 'Planerad', pagar: 'Pågår', klar: 'Klar' }

export default function SearchView() {
  const [query, setQuery] = useState('')
  const [detailItemId, setDetailItemId] = useState(null)
  const allItems = useLiveQuery(() => db.items.toArray(), []) ?? []

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allItems
      .filter((i) => i.title?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }, [allItems, query])

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
          marginBottom: '1rem',
        }}
      />

      {!query.trim() && (
        <p style={{ color: theme.colors.textMuted }}>Skriv för att söka bland alla dina KanDo's.</p>
      )}
      {query.trim() && results.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>Inga träffar på "{query.trim()}".</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {results.map((item) => (
          <ResultRow key={item.id} item={item} query={query.trim()} onOpen={() => setDetailItemId(item.id)} />
        ))}
      </div>

      <ItemDetailModal itemId={detailItemId} onClose={() => setDetailItemId(null)} />
    </div>
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

function ResultRow({ item, query, onOpen }) {
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
        {TYPE_LABEL[item.type]} · {STATUS_LABEL[item.status]}
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
    </div>
  )
}
