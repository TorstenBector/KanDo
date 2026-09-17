import { useTags, sortTagsByOrder } from '../hooks/useTags'
import { theme } from '../theme'

// Multi-select tag filter, shared across every list/board view — click a
// chip to add it to the filter, click again to remove it. One selected chip
// shows only items with that tag; several selected show items matching ANY
// of them (union, not intersection); none selected shows everything.
//
// Two-level tag tree (Vibe #2768): only top-level tags (no parent) show up
// here normally. Selecting one that has children reveals them in a second
// row for narrowing further — but the top-level chip alone already finds
// everything filed under it, since a child tag cascades onto its parent the
// moment it's applied to an item (see addItemTag in useTags.js). So picking
// "Hus" needs no tree-aware filtering logic anywhere else in the app: it's
// just another literal tag id, same as always.
export default function TagChipBar({ selectedTagIds, onToggle }) {
  const tags = useTags() ?? []
  // One shared order across both kinds (not category-then-context) — set
  // by dragging in Tagghantering, so e.g. "Jobb" can sit first even though
  // it's a category tag and "Vibe" (also category) sits last.
  const allTags = sortTagsByOrder(tags)
  const topLevel = allTags.filter((t) => !t.parent_tag_id)
  const visibleChildren = allTags.filter((t) => t.parent_tag_id && selectedTagIds.has(t.parent_tag_id))

  if (topLevel.length === 0) return null

  return (
    <div>
      <TagRow tags={topLevel} selectedTagIds={selectedTagIds} onToggle={onToggle} style={{ padding: '0.6rem 1rem' }} />
      {visibleChildren.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0 1rem 0.6rem' }}>
          <span style={{ fontSize: '0.7rem', color: theme.colors.textMuted, flexShrink: 0 }}>Förfina:</span>
          <TagRow tags={visibleChildren} selectedTagIds={selectedTagIds} onToggle={onToggle} small />
        </div>
      )}
    </div>
  )
}

function TagRow({ tags, selectedTagIds, onToggle, small, style }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', ...style }}>
      {tags.map((tag) => {
        const active = selectedTagIds.has(tag.id)
        const activeBg = tag.kind === 'context' ? theme.colors.accentSoft : theme.colors.surfaceGreen
        return (
          <button
            key={tag.id}
            onClick={() => onToggle(tag.id)}
            style={{
              flexShrink: 0,
              fontSize: small ? '0.72rem' : '0.8rem',
              fontWeight: active ? 700 : 400,
              padding: small ? '0.22rem 0.55rem' : '0.3rem 0.7rem',
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
