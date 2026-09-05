import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { updateItem, markDoneWithConfirm } from '../hooks/useItems'
import { useParent, useChildren } from '../hooks/useRelations'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const PRIORITY_LABEL = { hog: 'Hög', medel: 'Medel', lag: 'Låg' }
const PRIORITY_COLOR = { hog: theme.colors.danger, medel: theme.colors.warning, lag: theme.colors.textMuted }
const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'prioriterad', label: 'Prioriterad' },
  { value: 'planerad', label: 'Planerad' },
  { value: 'pagar', label: 'Pågår' },
  { value: 'klar', label: 'Klar' },
]

export default function ItemCard({ item, onOpenDetail }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const parent = useParent(item.id)
  const children = useChildren(item.id)
  const [expanded, setExpanded] = useState(false)

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
    flexDirection: 'column',
    gap: expanded && children.length > 0 ? '0.5rem' : 0,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
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
          {item.claimed_by && (
            <div style={{ fontSize: '0.65rem', color: theme.colors.textMuted, marginTop: '0.15rem' }}>
              🙋 {item.claimed_by}
            </div>
          )}
        </div>
        {children.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title={expanded ? 'Dölj deluppgifter' : 'Visa deluppgifter'}
            aria-expanded={expanded}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              border: `1px solid ${theme.colors.border}`,
              background: theme.colors.surface,
              borderRadius: '999px',
              padding: '0.1rem 0.45rem',
              cursor: 'pointer',
              color: theme.colors.textMuted,
              fontSize: '0.7rem',
              flexShrink: 0,
            }}
          >
            <span>{children.length}</span>
            <span style={{ transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s ease' }}>
              ▸
            </span>
          </button>
        )}
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

      {expanded && children.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            borderTop: `1px dashed ${theme.colors.border}`,
            paddingTop: '0.4rem',
          }}
        >
          {children.map((child) => (
            <ChildStatusRow key={child.id} item={child} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      )}
    </div>
  )
}

// Dragging a child card across a narrow/mobile board separately from its
// parent is awkward — this is the point of the expand toggle above: reflect
// a subtask's own progress via a direct status pick instead of a drag.
function ChildStatusRow({ item, onOpenDetail }) {
  const done = item.status === 'klar'
  return (
    <div
      style={{
        background: theme.colors.childTint,
        border: `1px solid ${theme.colors.childTintBorder}`,
        borderRadius: theme.radius.sm,
        padding: '0.4rem 0.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
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
          fontSize: '0.65rem',
        }}
      >
        ✓
      </button>
      <span
        onClick={() => onOpenDetail(item.id)}
        style={{
          flex: 1,
          cursor: 'pointer',
          fontSize: '0.82rem',
          color: done ? theme.colors.textMuted : theme.colors.text,
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        {item.title}
      </span>
      <select
        value={item.status}
        onChange={(e) => updateItem(item.id, { status: e.target.value, kanban_entered: true })}
        title="Flytta till..."
        style={{
          fontSize: '0.7rem',
          border: `1px solid ${theme.colors.childTintBorder}`,
          borderRadius: theme.radius.sm,
          padding: '0.15rem 0.3rem',
          background: theme.colors.bg,
          color: theme.colors.text,
          flexShrink: 0,
        }}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
