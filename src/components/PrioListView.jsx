import { useMemo, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { markDoneWithConfirm, reorderPrioritized, togglePrioritized } from '../hooks/useItems'
import { useChildrenByParent } from '../hooks/useRelations'
import ItemDetailModal from './ItemDetailModal'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }

export default function PrioListView() {
  const [detailItemId, setDetailItemId] = useState(null)
  const { childrenByParent, childIdSet } = useChildrenByParent()
  const allItems = useLiveQuery(async () => {
    const all = await db.items.where('status').equals('prioriterad').toArray()
    return all.sort((a, b) => (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999))
  }, []) ?? []

  // Children are presented grouped under their parent, not as independently
  // draggable rows — see spec discussion: "presenteras ihop i Backlog och Prio".
  const items = useMemo(() => allItems.filter((i) => !childIdSet.has(i.id)), [allItems, childIdSet])

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
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map((item, index) => (
              <div key={item.id}>
                <PrioRow item={item} rank={index + 1} onOpenDetail={setDetailItemId} />
                {(childrenByParent.get(item.id) ?? []).map((child) => (
                  <div key={child.id} style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                    <ChildRow item={child} onOpenDetail={setDetailItemId} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <ItemDetailModal itemId={detailItemId} onClose={() => setDetailItemId(null)} />
    </div>
  )
}

function PrioRow({ item, rank, onOpenDetail }) {
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

function ChildRow({ item, onOpenDetail }) {
  const done = item.status === 'klar'
  return (
    <div
      style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.sm,
        padding: '0.5rem 0.7rem',
        boxShadow: theme.shadow.sm,
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
          width: '1.1rem',
          height: '1.1rem',
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
          flex: 1, cursor: 'pointer', fontSize: '0.9rem',
          color: done ? theme.colors.textMuted : theme.colors.text,
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        {item.title}
      </span>
    </div>
  )
}
