import { useMemo, useState } from 'react'
import { useTags, useTagUsageCounts, renameTag, setTagKind, deleteTagEverywhere, mergeTags } from '../hooks/useTags'
import { theme } from '../theme'

// "Work" and "Jobb" ended up as two separate chips purely because of which
// button got clicked when each was created — this is where that gets fixed
// after the fact: rename, reclassify (🏷/📍), merge duplicates, or delete
// an unused tag. See useTags.js for the underlying operations.
export default function TagManagementView() {
  const allTags = useTags() ?? []
  const usageCounts = useTagUsageCounts()
  const [selected, setSelected] = useState(() => new Set())
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')

  const sortedTags = useMemo(
    () => [...allTags].sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [allTags]
  )

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function startEdit(tag) {
    setEditingId(tag.id)
    setEditValue(tag.name)
  }

  async function commitEdit(tagId) {
    const name = editValue.trim()
    if (name) await renameTag(tagId, name)
    setEditingId(null)
  }

  async function handleDelete(tag) {
    const count = usageCounts.get(tag.id) ?? 0
    const msg = count > 0
      ? `Ta bort taggen "${tag.name}"? Den tas bort från ${count} KanDo${count === 1 ? '' : 's'}.`
      : `Ta bort taggen "${tag.name}"?`
    if (!window.confirm(msg)) return
    await deleteTagEverywhere(tag.id)
  }

  async function handleMerge() {
    const ids = [...selected]
    if (ids.length < 2) return
    const selectedTags = sortedTags.filter((t) => selected.has(t.id))
    const names = selectedTags.map((t) => t.name).join('", "')
    const answer = window.prompt(
      `Slå ihop "${names}" till en tagg.\nSkriv in namnet på den tagg som ska vara kvar (exakt som den redan heter):`,
      selectedTags[0]?.name ?? ''
    )
    if (answer === null) return
    const survivor = selectedTags.find((t) => t.name.toLowerCase() === answer.trim().toLowerCase())
    if (!survivor) {
      window.alert('Hittade ingen av de valda taggarna med det namnet — inget slogs ihop.')
      return
    }
    await mergeTags(ids, survivor.id)
    setSelected(new Set())
  }

  return (
    <div style={{ padding: '1rem' }}>
      <p style={{ color: theme.colors.textMuted, fontSize: '0.9rem', margin: '0 0 1rem' }}>
        Byt namn, byt typ (🏷 tagg / 📍 sammanhang), ta bort en tagg helt, eller kryssa i flera som är samma sak
        (t.ex. "Work" och "Jobb") och slå ihop dem till en.
      </p>

      {selected.size >= 2 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem',
            background: theme.colors.surfaceGreen, border: `1px solid ${theme.colors.success}`,
            borderRadius: theme.radius.sm, padding: '0.6rem 0.8rem',
          }}
        >
          <span style={{ fontSize: '0.85rem', color: theme.colors.text }}>{selected.size} taggar valda</span>
          <button onClick={handleMerge} style={primaryBtn}>Slå ihop valda</button>
          <button onClick={() => setSelected(new Set())} style={secondaryBtn}>Avbryt val</button>
        </div>
      )}

      {sortedTags.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>Inga taggar än.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {sortedTags.map((tag) => {
          const count = usageCounts.get(tag.id) ?? 0
          const editing = editingId === tag.id
          return (
            <div
              key={tag.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radius.sm, padding: '0.5rem 0.7rem',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(tag.id)}
                onChange={() => toggleSelected(tag.id)}
                style={{ width: '1.1rem', height: '1.1rem', flexShrink: 0, cursor: 'pointer' }}
              />
              <button
                onClick={() => setTagKind(tag.id, tag.kind === 'context' ? 'category' : 'context')}
                title={tag.kind === 'context' ? 'Sammanhang — klicka för att göra till vanlig tagg' : 'Vanlig tagg — klicka för att göra till sammanhang'}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}
              >
                {tag.kind === 'context' ? '📍' : '🏷'}
              </button>

              {editing ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(tag.id)}
                  onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                  style={{
                    flex: 1, fontSize: '0.9rem', padding: '0.2rem 0.4rem',
                    border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm,
                  }}
                />
              ) : (
                <span
                  onClick={() => startEdit(tag)}
                  title="Klicka för att byta namn"
                  style={{ flex: 1, color: theme.colors.text, fontWeight: 500, cursor: 'text' }}
                >
                  {tag.name}
                </span>
              )}

              <span style={{ fontSize: '0.75rem', color: theme.colors.textMuted, flexShrink: 0 }}>
                {count} KanDo{count === 1 ? '' : 's'}
              </span>
              <button
                onClick={() => handleDelete(tag)}
                title="Ta bort tagg"
                style={{ border: 'none', background: 'transparent', color: theme.colors.danger, cursor: 'pointer', fontSize: '0.9rem', flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const primaryBtn = {
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  border: 'none',
  borderRadius: theme.radius.sm,
  padding: '0.4rem 0.9rem',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.85rem',
}

const secondaryBtn = {
  background: 'transparent',
  color: theme.colors.text,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  padding: '0.4rem 0.9rem',
  cursor: 'pointer',
  fontSize: '0.85rem',
}
