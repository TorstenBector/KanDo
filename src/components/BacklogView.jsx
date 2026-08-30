import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { updateItem, deleteItem, markDoneWithConfirm, scheduleToday, unschedule, setRecurrence, togglePrioritized, resumeItem } from '../hooks/useItems'
import { findOrCreateTag, useItemTags } from '../hooks/useTags'
import { useChildrenByParent } from '../hooks/useRelations'
import ItemDetailModal from './ItemDetailModal'
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

const RECURRENCE_PRESETS = [
  { value: '', label: '🔁 Ingen upprepning' },
  { value: '7', label: '🔁 Varje vecka' },
  { value: '14', label: '🔁 Var 14:e dag' },
  { value: 'custom', label: '🔁 Anpassat…' },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function BacklogView({ tagFilter }) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [detailItemId, setDetailItemId] = useState(null)
  const [showPaused, setShowPaused] = useState(false)
  // Parents with children start expanded (matches the previous
  // always-shown behavior) — collapsing is an opt-in per parent.
  const [collapsedParents, setCollapsedParents] = useState(() => new Set())
  const toggleParent = (id) =>
    setCollapsedParents((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const { childrenByParent, childIdSet } = useChildrenByParent()
  const taggedItemIds = useLiveQuery(async () => {
    if (!tagFilter) return null
    const links = await db.item_tags.where('tag_id').equals(tagFilter).toArray()
    return new Set(links.map((l) => l.item_id))
  }, [tagFilter])
  const allItems = useLiveQuery(
    async () => {
      const all = await db.items.orderBy('created_at').reverse().toArray()
      // Completed items move to the Utförda tab instead of lingering here.
      return all.filter((i) => i.status !== 'klar')
    },
    []
  ) ?? []

  // Paused ("Bibliotek") items stay out of the main list entirely until
  // their date passes — see pauseItem/reactivatePausedItems.
  const today = todayISO()
  const items = useMemo(() => allItems.filter((i) => !(i.paused_until && i.paused_until > today)), [allItems, today])
  const pausedItems = useMemo(() => allItems.filter((i) => i.paused_until && i.paused_until > today), [allItems, today])

  const visible = useMemo(() => {
    let result = typeFilter === 'all' ? items : items.filter((i) => i.type === typeFilter)
    if (tagFilter && taggedItemIds) result = result.filter((i) => taggedItemIds.has(i.id))
    return result
  }, [items, typeFilter, tagFilter, taggedItemIds])
  // Children render nested under their parent instead of as separate
  // top-level rows — see spec discussion: "presenteras ihop i Backlog".
  const topLevel = useMemo(() => visible.filter((i) => !childIdSet.has(i.id)), [visible, childIdSet])

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

      <div style={itemGridStyle}>
        {topLevel.map((item) => {
          const children = childrenByParent.get(item.id) ?? []
          const collapsed = collapsedParents.has(item.id)
          return (
            <div key={item.id}>
              <BacklogItemRow
                item={item}
                onOpenDetail={setDetailItemId}
                childCount={children.length}
                collapsed={collapsed}
                onToggleCollapse={() => toggleParent(item.id)}
              />
              {children.length > 0 && !collapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                  {children.map((child) => (
                    <div key={child.id} style={{ marginLeft: '1.6rem' }}>
                      <BacklogItemRow item={child} onOpenDetail={setDetailItemId} isChild />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {topLevel.length === 0 && (
          <p style={{ color: theme.colors.textMuted }}>Tomt här. Använd Snabbfånga för att lägga till något.</p>
        )}
      </div>

      {pausedItems.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <button
            onClick={() => setShowPaused((s) => !s)}
            style={{
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.sm,
              padding: '0.5rem 0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              color: theme.colors.text,
            }}
          >
            <span style={{ fontSize: '1rem' }}>🗄</span>
            <span style={{ fontWeight: 700 }}>Pausade ({pausedItems.length})</span>
            <span style={{ marginLeft: 'auto', fontSize: '1.2rem', color: theme.colors.textMuted }}>
              {showPaused ? '⌃' : '⌄'}
            </span>
          </button>

          {showPaused && (
            <div style={{ ...itemGridStyle, marginTop: '0.5rem' }}>
              {pausedItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.radius.sm, padding: '0.6rem 0.8rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.65rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
                      Pausad till {item.paused_until}
                    </div>
                    <div style={{ color: theme.colors.text, fontWeight: 500 }}>{item.title}</div>
                  </div>
                  <button onClick={() => resumeItem(item.id)} style={miniBtn}>Återuppta</button>
                  <button onClick={() => setDetailItemId(item.id)} title="Öppna detaljer" style={{ ...miniBtn, textDecoration: 'none' }}>✎</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ItemDetailModal itemId={detailItemId} onClose={() => setDetailItemId(null)} />
    </div>
  )
}

function BacklogItemRow({ item, onOpenDetail, childCount = 0, collapsed = false, onToggleCollapse, isChild = false }) {
  const [tagInput, setTagInput] = useState('')
  const [customRecurrence, setCustomRecurrence] = useState(false)
  const tags = useItemTags(item.id) ?? []
  const isScheduledToday = item.scheduled_date === todayISO()
  const isPrioritized = item.status === 'prioriterad'
  const recurrencePreset = [7, 14].includes(item.recurrence_days) ? String(item.recurrence_days) : (item.recurrence_days ? 'custom' : '')

  function handleRecurrenceChange(value) {
    if (value === 'custom') {
      setCustomRecurrence(true)
      return
    }
    setCustomRecurrence(false)
    setRecurrence(item.id, value ? Number(value) : null)
  }

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
        background: isChild ? theme.colors.childTint : theme.colors.surface,
        border: `1px solid ${isChild ? theme.colors.childTintBorder : theme.colors.border}`,
        borderRadius: theme.radius.sm,
        padding: isChild ? '0.45rem 0.7rem' : '0.6rem 0.8rem',
        boxShadow: isChild ? 'none' : theme.shadow.sm,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <button
          onClick={() => markDoneWithConfirm(item.id)}
          title="Markera som klar"
          style={{
            border: `1.5px solid ${theme.colors.border}`,
            background: theme.colors.bg,
            borderRadius: '50%',
            width: isChild ? '1.1rem' : '1.3rem',
            height: isChild ? '1.1rem' : '1.3rem',
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
              fontSize: isChild ? '0.87rem' : '1rem',
              width: '100%',
              padding: '0.15rem 0',
            }}
          />
        </div>
        {childCount > 0 && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Visa deluppgifter' : 'Dölj deluppgifter'}
            aria-expanded={!collapsed}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              border: `1px solid ${theme.colors.border}`,
              background: theme.colors.bg,
              borderRadius: '999px',
              padding: '0.15rem 0.55rem',
              cursor: 'pointer',
              color: theme.colors.textMuted,
              fontSize: '0.75rem',
              flexShrink: 0,
            }}
          >
            <span>{childCount}</span>
            <span style={{ transform: collapsed ? 'none' : 'rotate(90deg)', display: 'inline-block', transition: 'transform 0.15s ease' }}>
              ▸
            </span>
          </button>
        )}
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
          onClick={() => onOpenDetail(item.id)}
          aria-label="Redigera"
          title="Öppna detaljer"
          style={{
            border: `1px solid ${theme.colors.border}`,
            background: theme.colors.bg,
            borderRadius: theme.radius.sm,
            color: theme.colors.text,
            cursor: 'pointer',
            fontSize: '1.05rem',
            width: '1.9rem',
            height: '1.9rem',
            flexShrink: 0,
          }}
        >
          ✎
        </button>
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
        <button
          onClick={() => togglePrioritized(item.id)}
          style={{
            fontSize: '0.75rem',
            border: `1px solid ${isPrioritized ? theme.colors.primary : theme.colors.border}`,
            borderRadius: '999px',
            padding: '0.2rem 0.6rem',
            background: isPrioritized ? theme.colors.primary : 'transparent',
            color: isPrioritized ? theme.colors.textOnPrimary : theme.colors.textMuted,
            cursor: 'pointer',
          }}
        >
          {isPrioritized ? '✓ I Prioriterad' : '+ Prioriterad'}
        </button>

        <button
          onClick={() => (isScheduledToday ? unschedule(item.id) : scheduleToday(item.id))}
          style={{
            fontSize: '0.75rem',
            border: `1px solid ${isScheduledToday ? theme.colors.primary : theme.colors.border}`,
            borderRadius: '999px',
            padding: '0.2rem 0.6rem',
            background: isScheduledToday ? theme.colors.primary : 'transparent',
            color: isScheduledToday ? theme.colors.textOnPrimary : theme.colors.textMuted,
            cursor: 'pointer',
          }}
        >
          {isScheduledToday ? '✓ I Dagens Fokus' : '+ Dagens Fokus'}
        </button>

        <select
          value={recurrencePreset}
          onChange={(e) => handleRecurrenceChange(e.target.value)}
          style={{
            fontSize: '0.75rem',
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '999px',
            padding: '0.2rem 0.5rem',
            background: item.recurrence_days ? theme.colors.surfaceGreen : 'transparent',
            color: theme.colors.text,
          }}
        >
          {RECURRENCE_PRESETS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {customRecurrence && (
          <input
            type="number"
            min="1"
            autoFocus
            placeholder="antal dagar"
            defaultValue={item.recurrence_days && ![7, 14].includes(item.recurrence_days) ? item.recurrence_days : ''}
            onBlur={(e) => {
              const days = Number(e.target.value)
              if (days > 0) setRecurrence(item.id, days)
              setCustomRecurrence(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
            style={{
              fontSize: '0.75rem',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.sm,
              padding: '0.2rem 0.4rem',
              width: '80px',
            }}
          />
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

// Wide desktop screens get several cards side by side instead of one row
// stretched edge-to-edge; narrow/mobile viewports naturally collapse to a
// single column since there's no room for a second 340px card.
const itemGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
  gap: '0.75rem',
  alignItems: 'start',
}
