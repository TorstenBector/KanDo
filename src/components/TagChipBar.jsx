import { useTags } from '../hooks/useTags'
import { theme } from '../theme'

// Multi-select tag filter, shared across every list/board view — click a
// chip to add it to the filter, click again to remove it. One selected chip
// shows only items with that tag; several selected show items matching ANY
// of them (union, not intersection); none selected shows everything.
export default function TagChipBar({ selectedTagIds, onToggle }) {
  const categoryTags = useTags('category') ?? []
  const contextTags = useTags('context') ?? []
  const allTags = [...categoryTags, ...contextTags]

  if (allTags.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.4rem',
        overflowX: 'auto',
        padding: '0.6rem 1rem',
        background: theme.colors.bg,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}
    >
      {allTags.map((tag) => {
        const active = selectedTagIds.has(tag.id)
        const activeBg = tag.kind === 'context' ? theme.colors.accentSoft : theme.colors.surfaceGreen
        return (
          <button
            key={tag.id}
            onClick={() => onToggle(tag.id)}
            style={{
              flexShrink: 0,
              fontSize: '0.8rem',
              fontWeight: active ? 700 : 400,
              padding: '0.3rem 0.7rem',
              borderRadius: '999px',
              border: `1px solid ${active ? theme.colors.primary : theme.colors.border}`,
              background: active ? activeBg : 'transparent',
              color: theme.colors.text,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tag.kind === 'context' ? '📍 ' : ''}{tag.name}
          </button>
        )
      })}
    </div>
  )
}
