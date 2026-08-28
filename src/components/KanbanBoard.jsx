import { useMemo, useState } from 'react'
import { DndContext, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { updateItem, reorderPrioritized } from '../hooks/useItems'
import { useTags } from '../hooks/useTags'
import KanbanColumn from './KanbanColumn'
import { theme } from '../theme'

// Status changes automatically when a card moves column; manual order
// (priority_rank) only matters within "prioriterad" — see spec.md.
// Note: "Idé" is an item *type* (Idé/Projekt/Task, shown as a badge on
// each card), not a workflow stage — it doesn't get its own column here.
const COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'prioriterad', label: 'Prioriterad' },
  { id: 'planerad', label: 'Planerad' },
  { id: 'pagar', label: 'Pågår' },
  { id: 'klar', label: 'Klar' },
]

export default function KanbanBoard() {
  const [laneFilter, setLaneFilter] = useState('all')
  const items = useLiveQuery(() => db.items.toArray(), []) ?? []
  const itemTagLinks = useLiveQuery(() => db.item_tags.toArray(), []) ?? []
  const categoryTags = useTags('category') ?? []

  const tagIdsByItemId = useMemo(() => {
    const map = new Map()
    for (const link of itemTagLinks) {
      if (!map.has(link.item_id)) map.set(link.item_id, [])
      map.get(link.item_id).push(link.tag_id)
    }
    return map
  }, [itemTagLinks])

  const visibleItems = useMemo(() => {
    if (laneFilter === 'all') return items
    return items.filter((i) => (tagIdsByItemId.get(i.id) ?? []).includes(laneFilter))
  }, [items, laneFilter, tagIdsByItemId])

  const columnsData = useMemo(() => {
    const map = {}
    for (const col of COLUMNS) {
      // Klar only shows items actively pulled into the board (dragged here
      // at some point) — otherwise every quick checkmark from Dagens Fokus/
      // Backlog/Prio would clutter it. Those still show in Utförda either way.
      const colItems = visibleItems.filter(
        (i) => i.status === col.id && (col.id !== 'klar' || i.kanban_entered)
      )
      if (col.id === 'prioriterad') {
        colItems.sort((a, b) => (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999))
      } else {
        colItems.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      }
      map[col.id] = colItems
    }
    return map
  }, [visibleItems])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return

    const activeItem = items.find((i) => i.id === active.id)
    if (!activeItem) return

    const overColumn = COLUMNS.find((c) => c.id === over.id)
    const overItem = items.find((i) => i.id === over.id)
    const destStatus = overColumn ? overColumn.id : overItem ? overItem.status : activeItem.status

    if (destStatus !== activeItem.status) {
      // Any drag within the board marks it as actively tracked here — this
      // is what lets it show in Klar later instead of being filtered out.
      const changes = { status: destStatus, kanban_entered: true }
      if (destStatus === 'prioriterad') {
        changes.priority_rank = columnsData.prioriterad.length
      }
      await updateItem(activeItem.id, changes)
      return
    }

    if (destStatus === 'prioriterad' && overItem && overItem.id !== activeItem.id) {
      const destItems = columnsData.prioriterad
      const oldIndex = destItems.findIndex((i) => i.id === activeItem.id)
      const newIndex = destItems.findIndex((i) => i.id === overItem.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(destItems, oldIndex, newIndex)
      await reorderPrioritized(reordered.map((i) => i.id))
    }
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <label style={{ color: theme.colors.textMuted, fontSize: '0.9rem' }}>Swimlane:</label>
        <select
          value={laneFilter}
          onChange={(e) => setLaneFilter(e.target.value)}
          style={{
            padding: '0.4rem 0.6rem',
            borderRadius: theme.radius.sm,
            border: `1px solid ${theme.colors.border}`,
            background: theme.colors.surface,
            color: theme.colors.text,
          }}
        >
          <option value="all">Visa alla</option>
          {categoryTags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto' }}>
          {COLUMNS.map((col) => (
            <KanbanColumn key={col.id} column={col} items={columnsData[col.id]} />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
