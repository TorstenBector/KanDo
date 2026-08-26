import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { updateItem, deleteItem, markDone } from '../hooks/useItems'
import { findOrCreateTag, useItemTags } from '../hooks/useTags'
import { theme } from '../theme'

const TYPE_TABS = [
  { id: 'all', label: 'Alla' },
  { id: 'idea', label: 'Idéer' },
  { id: 'project', label: 'Projekt' },
  { id: 'task', label: 'Tasks' },
]

const PRIORITY_OPTIONS = [
  { value: '', label: 'Ingen prio' },
  { value: 'hog', label: 'Hög' },
  { value: 'medel', label: 'Medel' },
  { value: 'lag', label: 'Låg' },
]

export default function BacklogView() {
  const [typeFilter, setTypeFilter] = useState('all')
  const items = useLiveQuery(
    async () => {
      const all = await db.items.orderBy('created_at').reverse().toArray()
      // Completed items move to the Utförda tab instead of lingering here.
      return all.filter((i) => i.status !== 'klar')
    },
    []
  ) ?? []

  const visible = useMemo(
    () => (typeFilter === 'all' ? items : items.filter((i) => i.type === typeFilter)),
    [items, typeFilter]
  )

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {TYPE_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTypeFilter(t.id)}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: theme.radius.sm,
              border: `1px solid ${theme.colors.border}`,
              background: typeFilter === t.id ? theme.colors.primary : theme.colors.surface,
              color: typeFilter === t.id ? theme.colors.textOnPrimary : theme.colors.text,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {visible.map((item) => (
          <BacklogItemRow key={item.id} item={item} />
        ))}
        {visible.length === 0 && (
          <p style={{ color: theme.colors.textMuted }}>Tomt här. Använd Snabbfånga för att lägga till något.</p>
        )}
      </div>
    </div>
  )
}

function BacklogItemRow({ item }) {
  const [tagInput, setTagInput] = useState('')
  const tags = useItemTags(item.id) ?? []

  async function addTag(kind) {
    const name = tagInput.trim()
    if (!name) return
    const tag = await findOrCreateTag(name, kind)
    await db.item_tags.put({ item_id: item.id, tag_id: tag.id })
    setTagInput('')
  }

  async function removeTag(tagId) {
    await db.item_tags.where({ item_id: item.id, tag_id: tagId }).delete()
  }

  return (
    <div
      style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.sm,
        padding: '0.6rem 0.8rem',
        boxShadow: theme.shadow.sm,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <button
          onClick={() => markDone(item.id)}
          title="Markera som klar"
          style={{
            border: `1.5px solid ${theme.colors.border}`,
            background: theme.colors.bg,
            borderRadius: '50%',
            width: '1.3rem',
            height: '1.3rem',
            flexShrink: 0,
            marginTop: '0.15rem',
            cursor: 'pointer',
            padding: 0,
            color: theme.colors.success,
            fontSize: '0.8rem',
          }}
        >
          ✓
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.1rem' }}>
            <select
              value={item.type}
              onChange={(e) => updateItem(item.id, { type: e.target.value })}
              title="Idéer kan utvecklas till Task eller Projekt"
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                color: theme.colors.textMuted,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <option value="idea">Idé</option>
              <option value="project">Projekt</option>
              <option value="task">Task</option>
            </select>
            <span style={{ fontSize: '0.7rem', color: theme.colors.textMuted }}>· {item.status}</span>
          </div>
          <input
            value={item.title}
            onChange={(e) => updateItem(item.id, { title: e.target.value })}
            style={{
              border: 'none',
              background: 'transparent',
              color: theme.colors.text,
              fontWeight: 500,
              fontSize: '1rem',
              width: '100%',
              padding: '0.15rem 0',
            }}
          />
        </div>
        <select
          value={item.backlog_priority ?? ''}
          onChange={(e) => updateItem(item.id, { backlog_priority: e.target.value || null })}
          style={{
            borderRadius: theme.radius.sm,
            border: `1px solid ${theme.colors.border}`,
            padding: '0.25rem 0.4rem',
            fontSize: '0.8rem',
            background: theme.colors.bg,
            color: theme.colors.text,
          }}
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={() => deleteItem(item.id)}
          aria-label="Ta bort"
          style={{ border: 'none', background: 'transparent', color: theme.colors.danger, cursor: 'pointer', fontSize: '0.9rem' }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem', alignItems: 'center' }}>
        {tags.map((tag) => (
          <span
            key={tag.id}
            onClick={() => removeTag(tag.id)}
            title="Klicka för att ta bort"
            style={{
              fontSize: '0.75rem',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px',
              background: tag.kind === 'category' ? theme.colors.surfaceGreen : theme.colors.accentSoft,
              color: theme.colors.text,
              cursor: 'pointer',
            }}
          >
            {tag.kind === 'context' ? '📍 ' : ''}{tag.name}
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTag('category')}
          placeholder="+ tagg"
          style={{
            fontSize: '0.75rem',
            border: `1px dashed ${theme.colors.border}`,
            borderRadius: '999px',
            padding: '0.15rem 0.5rem',
            width: '90px',
            background: 'transparent',
            color: theme.colors.text,
          }}
        />
        {tagInput && (
          <>
            <button onClick={() => addTag('category')} style={miniBtn}>som kategori</button>
            <button onClick={() => addTag('context')} style={miniBtn}>som sammanhang</button>
          </>
        )}
      </div>
    </div>
  )
}

const miniBtn = {
  fontSize: '0.7rem',
  border: 'none',
  background: 'transparent',
  color: theme.colors.primary,
  cursor: 'pointer',
  textDecoration: 'underline',
}
