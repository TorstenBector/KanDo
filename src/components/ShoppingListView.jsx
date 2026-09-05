import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { markDoneWithConfirm, toggleShoppingList } from '../hooks/useItems'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }

export default function ShoppingListView({ selectedTagIds }) {
  const allItems = useLiveQuery(async () => {
    const all = await db.items.where('status').notEqual('klar').toArray()
    return all.filter((i) => i.in_shopping_list).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, []) ?? []

  const taggedItemIds = useLiveQuery(async () => {
    if (!selectedTagIds || selectedTagIds.size === 0) return null
    const links = await db.item_tags.where('tag_id').anyOf([...selectedTagIds]).toArray()
    return new Set(links.map((l) => l.item_id))
  }, [selectedTagIds])
  const items = selectedTagIds?.size > 0 && taggedItemIds
    ? allItems.filter((i) => taggedItemIds.has(i.id))
    : allItems

  return (
    <div style={{ padding: '1rem' }}>
      {items.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>
          Inköpslistan är tom. Kryssa i "+ Inköpslista" på en KanDo (i Backlog, Snabbfånga eller detaljvyn) för att lägga den hit.
        </p>
      )}

      <div style={itemGridStyle}>
        {items.map((item) => (
          <ShoppingRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

function ShoppingRow({ item }) {
  return (
    <div
      style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.sm,
        padding: '0.6rem 0.8rem',
        boxShadow: theme.shadow.sm,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
      }}
    >
      <button
        onClick={() => markDoneWithConfirm(item.id)}
        title="Köpt — markera som klar"
        style={{
          border: `1.5px solid ${theme.colors.border}`,
          background: theme.colors.bg,
          borderRadius: '50%',
          width: '1.3rem',
          height: '1.3rem',
          flexShrink: 0,
          cursor: 'pointer',
          padding: 0,
          color: theme.colors.success,
          fontSize: '0.8rem',
        }}
      >
        ✓
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
          {TYPE_LABEL[item.type]}
        </div>
        <div style={{ color: theme.colors.text, fontWeight: 500 }}>{item.title}</div>
      </div>
      <button
        onClick={() => toggleShoppingList(item.id)}
        title="Ta bort från inköpslistan (tar inte bort KanDo'n)"
        style={{
          border: `1px solid ${theme.colors.border}`,
          background: 'transparent',
          borderRadius: theme.radius.sm,
          padding: '0.25rem 0.5rem',
          fontSize: '0.7rem',
          color: theme.colors.textMuted,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}

// Wide desktop screens get several cards side by side instead of one row
// stretched edge-to-edge; narrow/mobile viewports naturally collapse to a
// single column since there's no room for a second 340px card.
const itemGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
  gap: '0.75rem',
  alignItems: 'start',
}
