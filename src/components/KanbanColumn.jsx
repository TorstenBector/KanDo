import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import ItemCard from './ItemCard'
import { theme } from '../theme'

export default function KanbanColumn({ column, items, onOpenDetail, onTriage }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: '220px',
        flex: '1 0 220px',
        background: isOver ? theme.colors.surfaceGreen : theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: '0.5rem',
        border: `1px solid ${theme.colors.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
        <div style={{ fontWeight: 600, color: theme.colors.text }}>
          {column.label} <span style={{ color: theme.colors.textMuted, fontWeight: 400 }}>({items.length})</span>
        </div>
        {onTriage && items.length > 0 && (
          <button
            onClick={onTriage}
            title="Gå igenom kolumnen ett kort i taget"
            style={{
              marginLeft: 'auto',
              border: `1px solid ${theme.colors.border}`,
              background: theme.colors.bg,
              borderRadius: '999px',
              width: '1.6rem',
              height: '1.6rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            🔀
          </button>
        )}
      </div>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '40px' }}>
          {items.map((item) => (
            <ItemCard key={item.id} item={item} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
