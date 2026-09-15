import { useCoOccurringTags } from '../hooks/useTags'
import { theme } from '../theme'

// "Brukar följa med" — chips for tags that have shown up together with the
// ones already on this item, so tagging e.g. "Vibe" + a project tag (KanDo,
// TidKoll, Konsultkoll…) consistently doesn't rely on remembering the
// convention every time. See useCoOccurringTags for the matching logic.
export default function TagCoOccurrenceSuggestions({ appliedTagIds, onAdd, max = 5 }) {
  const suggestions = useCoOccurringTags(appliedTagIds).slice(0, max)

  if (suggestions.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
      <span style={{ fontSize: '0.7rem', color: theme.colors.textMuted }}>Brukar följa med:</span>
      {suggestions.map(({ tag, count }) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => onAdd(tag)}
          title={`Taggad tillsammans på ${count} annat kort`}
          style={{
            fontSize: '0.75rem',
            padding: '0.15rem 0.5rem',
            borderRadius: '999px',
            border: `1px dashed ${theme.colors.border}`,
            background: 'transparent',
            color: theme.colors.textMuted,
            cursor: 'pointer',
          }}
        >
          + {tag.kind === 'context' ? '📍 ' : ''}{tag.name}
        </button>
      ))}
    </div>
  )
}
