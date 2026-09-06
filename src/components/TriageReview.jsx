import { useRef, useState } from 'react'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const SWIPE_THRESHOLD = 90

// The generalized version of Dagens Fokus's "Missade" swipe review — one
// card at a time, Tinder-style: right promotes to the next stage, left
// either demotes to the stage before it or (when onReject is null, e.g.
// Backlog has nowhere lower to go) just skips to the next card without
// changing anything. Used by Backlog, Prio, and Kanban's Planerad/Pågår
// columns — each supplies its own item queue + promote/reject actions.
export default function TriageReview({
  items, promoteLabel, rejectLabel, onPromote, onReject, onOpenDetail, onClose,
}) {
  // Backlog's "reject" has no backend action (nothing lower to send it to)
  // — skipping it just has to stop showing that card for this pass,
  // tracked locally instead of via a status change.
  const [skipped, setSkipped] = useState(() => new Set())
  const queue = items.filter((i) => !skipped.has(i.id))
  const item = queue[0]

  function reject(id) {
    if (onReject) {
      onReject(id)
    } else {
      setSkipped((prev) => new Set(prev).add(id))
    }
  }

  if (!item) {
    return (
      <div style={{ padding: '1.5rem 0', textAlign: 'center' }}>
        <p style={{ color: theme.colors.textMuted, margin: '0 0 0.75rem' }}>Klart — inget mer att gå igenom! 🎉</p>
        <button onClick={onClose} style={{ ...navBtn, width: 'auto', padding: '0 0.8rem' }}>Stäng Triage</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem 0 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <div style={{ color: theme.colors.textMuted, fontSize: '0.8rem' }}>{queue.length} kvar</div>
      <TriageCard
        key={item.id}
        item={item}
        onOpenDetail={onOpenDetail}
        onSwipeRight={() => onPromote(item.id)}
        onSwipeLeft={() => reject(item.id)}
      />
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button onClick={() => reject(item.id)} style={{ ...pillBtn, color: theme.colors.textMuted }}>
          {rejectLabel}
        </button>
        <button onClick={() => onPromote(item.id)} style={{ ...pillBtn, color: theme.colors.success, borderColor: theme.colors.success }}>
          {promoteLabel}
        </button>
      </div>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: theme.colors.textMuted, fontSize: '0.8rem', cursor: 'pointer' }}>
        ✕ Stäng Triage
      </button>
    </div>
  )
}

function TriageCard({ item, onOpenDetail, onSwipeRight, onSwipeLeft }) {
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef(0)
  const movedRef = useRef(false)

  function handlePointerDown(e) {
    setDragging(true)
    movedRef.current = false
    startXRef.current = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function handlePointerMove(e) {
    if (!dragging) return
    const delta = e.clientX - startXRef.current
    if (Math.abs(delta) > 4) movedRef.current = true
    setDragX(delta)
  }
  function handlePointerUp() {
    setDragging(false)
    if (dragX > SWIPE_THRESHOLD) onSwipeRight()
    else if (dragX < -SWIPE_THRESHOLD) onSwipeLeft()
    setDragX(0)
  }

  const rotation = dragX / 18
  const rightHintOpacity = Math.min(Math.max(dragX / SWIPE_THRESHOLD, 0), 1)
  const leftHintOpacity = Math.min(Math.max(-dragX / SWIPE_THRESHOLD, 0), 1)

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={() => { if (!movedRef.current) onOpenDetail(item.id) }}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '360px',
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.md,
        padding: '1.2rem 1rem',
        boxShadow: theme.shadow.md,
        transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
        transition: dragging ? 'none' : 'transform 0.25s ease',
        touchAction: 'pan-y',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute', top: '0.6rem', right: '0.8rem',
          fontWeight: 700, fontSize: '0.9rem', color: theme.colors.success,
          opacity: rightHintOpacity, textTransform: 'uppercase',
        }}
      >
        ✓
      </span>
      <span
        style={{
          position: 'absolute', top: '0.6rem', left: '0.8rem',
          fontWeight: 700, fontSize: '0.9rem', color: theme.colors.textMuted,
          opacity: leftHintOpacity, textTransform: 'uppercase',
        }}
      >
        ✕
      </span>
      <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase', marginTop: '1rem' }}>
        {TYPE_LABEL[item.type]}
        {item.backlog_priority && ` · Prio: ${item.backlog_priority === 'hog' ? 'Hög' : item.backlog_priority === 'medel' ? 'Medel' : 'Låg'}`}
      </div>
      <div style={{ color: theme.colors.text, fontWeight: 600, fontSize: '1.1rem', marginTop: '0.3rem' }}>
        {item.title}
      </div>
    </div>
  )
}

const pillBtn = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  borderRadius: '999px',
  padding: '0.5rem 1.1rem',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const navBtn = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  color: theme.colors.text,
  borderRadius: theme.radius.sm,
  cursor: 'pointer',
  fontSize: '1rem',
  height: '1.8rem',
}
