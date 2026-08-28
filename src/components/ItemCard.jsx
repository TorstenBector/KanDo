import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { markDoneWithConfirm } from '../hooks/useItems'
import { useParent } from '../hooks/useRelations'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const PRIORITY_LABEL = { hog: 'Hög', medel: 'Medel', lag: 'Låg' }
const PRIORITY_COLOR = { hog: theme.colors.danger, medel: theme.colors.warning, lag: theme.colors.textMuted }

export default function ItemCard({ item, onOpenDetail }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const parent = useParent(item.id)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: theme.colors.bg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    padding: '0.5rem 0.6rem',
    boxShadow: theme.shadow.sm,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.4rem',
  }

  return (
    <div ref={setNodeRef} style={style}>
      {item.status !== 'klar' && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            markDoneWithConfirm(item.id)
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Markera som klar"
          style={{
            border: `1.5px solid ${theme.colors.border}`,
            background: theme.colors.surface,
            borderRadius: '50%',
            width: '1.1rem',
            height: '1.1rem',
            flexShrink: 0,
            marginTop: '0.15rem',
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
            color: theme.colors.success,
            fontSize: '0.7rem',
          }}
        >
          ✓
        </button>
      )}
      <div {...attributes} {...listeners} style={{ flex: 1, cursor: 'grab', touchAction: 'none' }}>
        <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
          {TYPE_LABEL[item.type]}
        </div>
        <div style={{ color: theme.colors.text, fontWeight: 500 }}>{item.title}</div>
        {parent && (
          <div style={{ fontSize: '0.65rem', color: theme.colors.textMuted, marginTop: '0.15rem' }}>
            ↳ {parent.title}
          </div>
        )}
        {item.backlog_priority && (
          <div style={{ fontSize: '0.7rem', color: PRIORITY_COLOR[item.backlog_priority], marginTop: '0.25rem' }}>
            ● {PRIORITY_LABEL[item.backlog_priority]}
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onOpenDetail(item.id)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title="Öppna detaljer"
        style={{
          border: 'none',
          background: 'transparent',
          color: theme.colors.textMuted,
          cursor: 'pointer',
          fontSize: '0.8rem',
          flexShrink: 0,
        }}
      >
        ✎
      </button>
    </div>
  )
}
