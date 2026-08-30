import { useMemo, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { markDoneWithConfirm, reorderPrioritized, togglePrioritized } from '../hooks/useItems'
import { useChildrenByParent } from '../hooks/useRelations'
import ItemDetailModal from './ItemDetailModal'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }

export default function PrioListView({ tagFilter }) {
  const [detailItemId, setDetailItemId] = useState(null)
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
  const allItems = useLiveQuery(async () => {
    const all = await db.items.where('status').equals('prioriterad').toArray()
    return all.sort((a, b) => (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999))
  }, []) ?? []

  // Children are presented grouped under their parent, not as independently
  // draggable rows — see spec discussion: "presenteras ihop i Backlog och Prio".
  const items = useMemo(() => {
    let result = allItems.filter((i) => !childIdSet.has(i.id))
    if (tagFilter && taggedItemIds) result = result.filter((i) => taggedItemIds.has(i.id))
    return result
  }, [allItems, childIdSet, tagFilter, taggedItemIds])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(items, oldIndex, newIndex)
    await reorderPrioritized(reordered.map((i) => i.id))
  }

  return (
    <div style={{ padding: '1rem' }}>
      <p style={{ color: theme.colors.textMuted, fontSize: '0.9rem', margin: '0 0 1rem' }}>
        Dra för att ändra ordning. Översta är viktigast.
      </p>

      {items.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>
          Tomt här. Flytta något hit från Backlog eller Kanban.
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div style={itemGridStyle}>
            {items.map((item, index) => {
              const children = childrenByParent.get(item.id) ?? []
              const collapsed = collapsedParents.has(item.id)
              return (
                <div key={item.id}>
                  <PrioRow
                    item={item}
                    rank={index + 1}
                    onOpenDetail={setDetailItemId}
                    childCount={children.length}
                    collapsed={collapsed}
                    onToggleCollapse={() => toggleParent(item.id)}
                  />
                  {children.length > 0 && !collapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                      {children.map((child) => (
                        <div key={child.id} style={{ marginLeft: '1.6rem' }}>
                          <ChildRow item={child} onOpenDetail={setDetailItemId} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      <ItemDetailModal itemId={detailItemId} onClose={() => setDetailItemId(null)} />
    </div>
  )
}

function PrioRow({ item, rank, onOpenDetail, childCount = 0, collapsed = false, onToggleCollapse }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    padding: '0.6rem 0.8rem',
    boxShadow: theme.shadow.sm,
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
  }

  return (
    <div ref={setNodeRef} style={style}>
      <button
        onClick={() => markDoneWithConfirm(item.id)}
        title="Markera som klar"
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

      <span style={{ color: theme.colors.textMuted, fontSize: '0.85rem', width: '1.2rem', flexShrink: 0 }}>
        {rank}
      </span>

      <div onClick={() => onOpenDetail(item.id)} style={{ flex: 1, cursor: 'pointer' }}>
        <div style={{ fontSize: '0.65rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
          {TYPE_LABEL[item.type]}
        </div>
        <div style={{ color: theme.colors.text, fontWeight: 500 }}>{item.title}</div>
      </div>

      {childCount > 0 && (
        <button
          onClick={onToggleCollapse}
          onPointerDown={(e) => e.stopPropagation()}
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

      <div
        {...attributes}
        {...listeners}
        title="Dra för att ändra ordning"
        style={{
          flexShrink: 0,
          width: '1.75rem',
          height: '1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          touchAction: 'none',
          color: theme.colors.textMuted,
          fontSize: '1.1rem',
          letterSpacing: '-1px',
        }}
      >
        ⠿
      </div>

      <button
        onClick={() => togglePrioritized(item.id)}
        onPointerDown={(e) => e.stopPropagation()}
        title="Flytta tillbaka till Backlog"
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
        ← Backlog
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

function ChildRow({ item, onOpenDetail }) {
  const done = item.status === 'klar'
  return (
    <div
      style={{
        background: theme.colors.childTint,
        border: `1px solid ${theme.colors.childTintBorder}`,
        borderRadius: theme.radius.sm,
        padding: '0.45rem 0.7rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <button
        onClick={() => markDoneWithConfirm(item.id)}
        title="Markera som klar"
        style={{
          border: `1.5px solid ${theme.colors.success}`,
          background: done ? theme.colors.success : theme.colors.bg,
          borderRadius: '50%',
          width: '1rem',
          height: '1rem',
          flexShrink: 0,
          cursor: 'pointer',
          padding: 0,
          color: done ? '#fff' : theme.colors.success,
          fontSize: '0.7rem',
        }}
      >
        ✓
      </button>
      <span
        onClick={() => onOpenDetail(item.id)}
        style={{
          flex: 1, cursor: 'pointer', fontSize: '0.87rem',
          color: done ? theme.colors.textMuted : theme.colors.text,
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        {item.title}
      </span>
    </div>
  )
}
