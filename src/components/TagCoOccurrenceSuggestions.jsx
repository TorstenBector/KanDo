import { useCoOccurringTags } from '../hooks/useTags'
import { theme } from '../theme'

// "Brukar följa med" — chips for tags that have shown up together with the
// ones already on this item, so tagging e.g. "Vibe" + a project tag (KanDo,
// TidKoll, Konsultkoll…) consistently doesn't rely on remembering the
// convention every time. See useCoOccurringTags for the matching logic.
//
// First version's chips were dashed-border, muted-grey, 0.75rem text —
// read as decorative/disabled rather than something to tap (KanDo Vibe
// #2483: "logiken funkar men chipset är för litet och otydligt"). Solid
// fill + a full-size "+" affordance instead, matching how an actual tag
// chip looks elsewhere in the app, just in the accent color so it still
// reads as "not applied yet, tap to add" rather than an existing tag.
export default function TagCoOccurrenceSuggestions({ appliedTagIds, onAdd, max = 5 }) {
  const suggestions = useCoOccurringTags(appliedTagIds).slice(0, max)

  if (suggestions.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
      <span style={{ fontSize: '0.78rem', color: theme.colors.text, fontWeight: 600 }}>
        Brukar följa med — klicka för att lägga till:
      </span>
      {suggestions.map(({ tag, count }) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => onAdd(tag)}
          title={`Taggad tillsammans på ${count} annat kort`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            padding: '0.3rem 0.7rem',
            borderRadius: '999px',
            border: `1.5px solid ${theme.colors.primary}`,
            background: theme.colors.accentSoft,
            color: theme.colors.primaryDark,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '1rem', lineHeight: 1 }}>+</span>
          {tag.kind === 'context' ? '📍 ' : ''}{tag.name}
        </button>
      ))}
    </div>
  )
}
