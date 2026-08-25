import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const PRIORITY_LABEL = { hog: 'Hög', medel: 'Medel', lag: 'Låg' }
const PRIORITY_COLOR = { hog: theme.colors.danger, medel: theme.colors.warning, lag: theme.colors.textMuted }

export default function ItemCard({ item }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: theme.colors.bg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    padding: '0.5rem 0.6rem',
    boxShadow: theme.shadow.sm,
    cursor: 'grab',
    touchAction: 'none',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
        {TYPE_LABEL[item.type]}
      </div>
      <div style={{ color: theme.colors.text, fontWeight: 500 }}>{item.title}</div>
      {item.backlog_priority && (
        <div style={{ fontSize: '0.7rem', color: PRIORITY_COLOR[item.backlog_priority], marginTop: '0.25rem' }}>
          ● {PRIORITY_LABEL[item.backlog_priority]}
        </div>
      )}
    </div>
  )
}
