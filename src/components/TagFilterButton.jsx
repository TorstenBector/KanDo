import { useState } from 'react'
import { useTags } from '../hooks/useTags'
import { theme } from '../theme'

// Excel-style column filter — a single active tag, shared between Backlog
// and Prio so switching tabs keeps working within the same category.
export default function TagFilterButton({ tagFilter, setTagFilter }) {
  const [open, setOpen] = useState(false)
  const categoryTags = useTags('category') ?? []
  const contextTags = useTags('context') ?? []
  const activeTag = [...categoryTags, ...contextTags].find((t) => t.id === tagFilter)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: activeTag ? theme.colors.accentSoft : 'transparent',
          border: `1px solid ${theme.colors.textOnPrimary}`,
          borderRadius: theme.radius.sm,
          color: activeTag ? theme.colors.primaryDark : theme.colors.textOnPrimary,
          cursor: 'pointer',
          fontSize: '0.85rem',
          padding: '0.3rem 0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          maxWidth: '9rem',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeTag ? activeTag.name : 'Filter'}
        </span>
        <span style={{ fontSize: '0.7rem' }}>▾</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 190 }} />
          <div
            style={{
              position: 'absolute',
              top: '2.1rem',
              right: 0,
              background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              boxShadow: theme.shadow.md,
              padding: '0.4rem',
              width: '200px',
              maxHeight: '60vh',
              overflowY: 'auto',
              zIndex: 200,
            }}
          >
            <FilterOption label="Alla (ingen filtrering)" active={!tagFilter} onClick={() => { setTagFilter(null); setOpen(false) }} />
            {categoryTags.length > 0 && <Group label="Kategori" />}
            {categoryTags.map((t) => (
              <FilterOption key={t.id} label={t.name} active={tagFilter === t.id} onClick={() => { setTagFilter(t.id); setOpen(false) }} />
            ))}
            {contextTags.length > 0 && <Group label="Sammanhang" />}
            {contextTags.map((t) => (
              <FilterOption key={t.id} label={`📍 ${t.name}`} active={tagFilter === t.id} onClick={() => { setTagFilter(t.id); setOpen(false) }} />
            ))}
            {categoryTags.length === 0 && contextTags.length === 0 && (
              <p style={{ color: theme.colors.textMuted, fontSize: '0.8rem', padding: '0.4rem', margin: 0 }}>
                Inga taggar än.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Group({ label }) {
  return (
    <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, fontWeight: 600, padding: '0.4rem 0.5rem 0.2rem', textTransform: 'uppercase' }}>
      {label}
    </div>
  )
}

function FilterOption({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '0.5rem 0.6rem',
        border: 'none',
        borderRadius: theme.radius.sm,
        background: active ? theme.colors.surfaceGreen : 'transparent',
        color: theme.colors.text,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        fontSize: '0.85rem',
      }}
    >
      {label}
    </button>
  )
}
