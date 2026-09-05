import { useState } from 'react'
import { useTags, findOrCreateTag } from '../hooks/useTags'
import { theme } from '../theme'

// One consistent way to add a tag, used everywhere (Backlog, detail modal,
// Snabbfånga) instead of three slightly different patterns — the previous
// mix of "press Enter" / "click one of two buttons" / "type then Save" was
// the actual reason tags kept multiplying, not carelessness.
//
// Type, see matching existing tags as you go, either pick one (reused
// as-is) or press Enter to create a new one. New tags default to a plain
// 🏷 tag; tap the small icon first to mark this one as a 📍 sammanhang
// instead — a secondary, opt-in choice rather than two equally-weighted
// buttons every time.
export default function TagInput({ onAdd, placeholder = '+ tagg', excludeIds }) {
  const [value, setValue] = useState('')
  const [kind, setKind] = useState('category')
  const [open, setOpen] = useState(false)
  const allTags = useTags() ?? []

  const query = value.trim().toLowerCase()
  const suggestions = query
    ? allTags
        .filter((t) => t.name.toLowerCase().includes(query) && !excludeIds?.has(t.id))
        .slice(0, 6)
    : []
  const exactMatch = suggestions.some((t) => t.name.toLowerCase() === query)

  async function commitNew() {
    const name = value.trim()
    if (!name) return
    const tag = await findOrCreateTag(name, kind)
    onAdd(tag)
    setValue('')
    setOpen(false)
  }

  function pickSuggestion(tag) {
    onAdd(tag)
    setValue('')
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
      <button
        type="button"
        onClick={() => setKind((k) => (k === 'context' ? 'category' : 'context'))}
        title={kind === 'context' ? 'Ny tagg blir ett sammanhang (📍) — klicka för att byta' : 'Ny tagg blir en vanlig tagg — klicka för att göra den till ett sammanhang (📍)'}
        style={{
          border: `1px solid ${theme.colors.border}`,
          background: kind === 'context' ? theme.colors.accentSoft : 'transparent',
          borderRadius: '999px',
          width: '1.6rem',
          height: '1.6rem',
          flexShrink: 0,
          cursor: 'pointer',
          fontSize: '0.8rem',
          padding: 0,
        }}
      >
        {kind === 'context' ? '📍' : '🏷'}
      </button>
      <input
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commitNew() }
          if (e.key === 'Escape') setOpen(false)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        style={{
          fontSize: '0.8rem',
          border: `1px dashed ${theme.colors.border}`,
          borderRadius: '999px',
          padding: '0.2rem 0.6rem',
          width: '110px',
          background: 'transparent',
          color: theme.colors.text,
        }}
      />

      {open && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '0.25rem',
            background: theme.colors.bg,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm,
            boxShadow: theme.shadow.md,
            minWidth: '160px',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pickSuggestion(t) }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.4rem 0.6rem',
                border: 'none',
                background: 'transparent',
                color: theme.colors.text,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {t.kind === 'context' ? '📍 ' : '🏷 '}{t.name}
            </button>
          ))}
          {!exactMatch && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commitNew() }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.4rem 0.6rem',
                border: 'none',
                borderTop: `1px solid ${theme.colors.border}`,
                background: 'transparent',
                color: theme.colors.textMuted,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              + Ny tagg: "{value.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
