import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { markDoneWithConfirm, toggleShoppingList } from '../hooks/useItems'
import { addStaple, deleteStaple, renameStaple, resetCheckedStaples, toggleStapleChecked } from '../hooks/useShoppingStaples'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }

export default function ShoppingListView({ selectedTagIds }) {
  const [mode, setMode] = useState('sallankop')

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <ModeButton active={mode === 'sallankop'} onClick={() => setMode('sallankop')}>
          Sällanköp
        </ModeButton>
        <ModeButton active={mode === 'stapelvaror'} onClick={() => setMode('stapelvaror')}>
          🔁 Stapelvaror
        </ModeButton>
      </div>

      {mode === 'sallankop' ? (
        <SallankopList selectedTagIds={selectedTagIds} />
      ) : (
        <StapelvarorList />
      )}
    </div>
  )
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? theme.colors.primary : theme.colors.border}`,
        background: active ? theme.colors.primary : theme.colors.surface,
        color: active ? theme.colors.textOnPrimary : theme.colors.text,
        borderRadius: theme.radius.sm,
        padding: '0.4rem 0.8rem',
        fontSize: '0.85rem',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

// Sällanköp — ad-hoc project purchases, backed by regular KanDo items
// flagged in_shopping_list (unchanged from before the Stapelvaror split).
function SallankopList({ selectedTagIds }) {
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
    <div>
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

// Stapelvaror — a fixed, reusable template (mjölk, bröd, ...) checked off
// before a store run and reset afterwards. Not KanDo items: no status
// lifecycle, just name + checked + a manual sort order.
function StapelvarorList() {
  const staples = useLiveQuery(async () => {
    const all = await db.shopping_staples.toArray()
    return all.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, []) ?? []
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')

  const checkedCount = staples.filter((s) => s.checked).length

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    await addStaple(newName)
    setNewName('')
  }

  function startEdit(staple) {
    setEditingId(staple.id)
    setEditingName(staple.name)
  }

  async function commitEdit() {
    if (editingName.trim()) await renameStaple(editingId, editingName)
    setEditingId(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <p style={{ color: theme.colors.textMuted, fontSize: '0.85rem', margin: 0 }}>
          Bocka av det du behöver köpa, återställ när du är klar i butiken.
        </p>
        <button
          onClick={resetCheckedStaples}
          disabled={checkedCount === 0}
          title="Bocka ur allt som är avbockat"
          style={{
            marginLeft: 'auto',
            flexShrink: 0,
            border: `1px solid ${checkedCount > 0 ? theme.colors.primary : theme.colors.border}`,
            background: checkedCount > 0 ? theme.colors.primary : theme.colors.surface,
            color: checkedCount > 0 ? theme.colors.textOnPrimary : theme.colors.textMuted,
            borderRadius: theme.radius.sm,
            padding: '0.35rem 0.7rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: checkedCount > 0 ? 'pointer' : 'default',
          }}
        >
          ↺ Återställ{checkedCount > 0 ? ` (${checkedCount})` : ''}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {staples.map((staple) => (
          <div
            key={staple.id}
            style={{
              background: staple.checked ? theme.colors.surfaceGreen : theme.colors.surface,
              border: `1px solid ${staple.checked ? theme.colors.success : theme.colors.border}`,
              borderRadius: theme.radius.sm,
              padding: '0.5rem 0.7rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            <button
              onClick={() => toggleStapleChecked(staple.id)}
              title={staple.checked ? 'Ångra' : 'Bocka av'}
              style={{
                border: `1.5px solid ${theme.colors.success}`,
                background: staple.checked ? theme.colors.success : theme.colors.bg,
                borderRadius: '50%',
                width: '1.3rem',
                height: '1.3rem',
                flexShrink: 0,
                cursor: 'pointer',
                padding: 0,
                color: staple.checked ? '#fff' : theme.colors.success,
                fontSize: '0.8rem',
              }}
            >
              ✓
            </button>

            {editingId === staple.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                style={{
                  flex: 1,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.sm,
                  padding: '0.3rem 0.5rem',
                  fontSize: '0.95rem',
                  background: theme.colors.bg,
                  color: theme.colors.text,
                }}
              />
            ) : (
              <div
                onClick={() => startEdit(staple)}
                title="Klicka för att byta namn"
                style={{
                  flex: 1,
                  cursor: 'text',
                  fontWeight: 500,
                  color: staple.checked ? theme.colors.textMuted : theme.colors.text,
                  textDecoration: staple.checked ? 'line-through' : 'none',
                }}
              >
                {staple.name}
              </div>
            )}

            <button
              onClick={() => deleteStaple(staple.id)}
              title="Ta bort från mallen"
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
        ))}
      </div>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Lägg till vara..."
          style={{
            flex: 1,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm,
            padding: '0.5rem 0.7rem',
            fontSize: '0.95rem',
            background: theme.colors.surface,
            color: theme.colors.text,
          }}
        />
        <button
          type="submit"
          style={{
            border: 'none',
            background: theme.colors.primary,
            color: theme.colors.textOnPrimary,
            borderRadius: theme.radius.sm,
            padding: '0.5rem 1rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Lägg till
        </button>
      </form>
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
