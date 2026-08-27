import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { markDone, reorderPrioritized, togglePrioritized } from '../hooks/useItems'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }

export default function PrioListView() {
  const items = useLiveQuery(async () => {
    const all = await db.items.where('status').equals('prioriterad').toArray()
    return all.sort((a, b) => (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999))
  }, []) ?? []

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
      <h2 style={{ color: theme.colors.text, margin: '0 0 0.25rem' }}>Prioriterad</h2>
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
              <PrioRow key={item.id} item={item} rank={index + 1} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function PrioRow({ item, rank }) {
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
        onClick={() => markDone(item.id)}
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

      <div {...attributes} {...listeners} style={{ flex: 1, cursor: 'grab', touchAction: 'none' }}>
        <div style={{ fontSize: '0.65rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
          {TYPE_LABEL[item.type]}
        </div>
        <div style={{ color: theme.colors.text, fontWeight: 500 }}>{item.title}</div>
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
