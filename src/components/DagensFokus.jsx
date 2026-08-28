import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { markDoneWithConfirm, reopenItem, sendToBacklog } from '../hooks/useItems'
import ItemDetailModal from './ItemDetailModal'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const COLLAPSE_THRESHOLD = 3

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function addDaysISO(iso, days) {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDateLabel(iso) {
  const d = new Date(iso)
  const label = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export default function DagensFokus() {
  const [showDone, setShowDone] = useState(false)
  const [detailItemId, setDetailItemId] = useState(null)
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const isToday = selectedDate === todayISO()

  const scheduled = useLiveQuery(async () => {
    return db.items.where('scheduled_date').equals(selectedDate).toArray()
  }, [selectedDate])

  // The "top 5 priorities" fallback only makes sense for today — a future
  // date with nothing scheduled yet should just look empty, not borrow
  // today's priority list.
  const topPriority = useLiveQuery(async () => {
    if (!isToday) return []
    const all = await db.items.where('status').equals('prioriterad').toArray()
    return all
      .sort((a, b) => (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999))
      .slice(0, 5)
  }, [isToday])

  const showScheduled = (scheduled?.length ?? 0) > 0
  const rawList = showScheduled ? scheduled : (topPriority ?? [])

  const byPriority = (a, b) => (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999)
  const activeItems = rawList.filter((i) => i.status !== 'klar').sort(byPriority)
  const doneItems = rawList.filter((i) => i.status === 'klar').sort(byPriority)
  const collapseDone = doneItems.length > COLLAPSE_THRESHOLD

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ color: theme.colors.text, margin: '0 0 0.25rem' }}>
        {isToday ? 'Dagens Fokus' : formatDateLabel(selectedDate)}
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.75rem' }}>
        <button onClick={() => setSelectedDate(addDaysISO(selectedDate, -1))} style={dateNavBtn}>‹</button>
        <span style={{ color: theme.colors.textMuted, fontSize: '0.85rem', minWidth: '7rem', textAlign: 'center' }}>
          {isToday ? 'Schemalagt idag' : selectedDate}
        </span>
        <button onClick={() => setSelectedDate(addDaysISO(selectedDate, 1))} style={dateNavBtn}>›</button>
        {!isToday && (
          <button onClick={() => setSelectedDate(todayISO())} style={{ ...dateNavBtn, width: 'auto', padding: '0 0.6rem' }}>
            Idag
          </button>
        )}
      </div>

      {isToday && !showScheduled && (
        <p style={{ color: theme.colors.textMuted, fontSize: '0.85rem', margin: '-0.5rem 0 0.75rem' }}>
          Inget schemalagt idag — de fem högst prioriterade
        </p>
      )}

      {rawList.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>
          {isToday
            ? 'Inget att visa än. Fånga något med Snabbfånga, eller flytta objekt till "Prioriterad" i Kanban.'
            : 'Inget schemalagt för den här dagen än. Öppna en KanDo (✎) och sätt schemalagt datum för att lägga den hit.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* Done items float to the top, but collapse into one line past the
            threshold so what's left to do gets the visual space instead. */}
        {collapseDone && !showDone ? (
          <button
            onClick={() => setShowDone(true)}
            style={{
              background: theme.colors.surfaceGreen,
              border: `1px solid ${theme.colors.success}`,
              borderRadius: theme.radius.sm,
              padding: '0.6rem 0.8rem',
              boxShadow: theme.shadow.sm,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              color: theme.colors.text,
            }}
          >
            <span style={{ color: theme.colors.success, fontSize: '1.1rem' }}>✓</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Utförda ({doneItems.length})</span>
            <span
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                color: theme.colors.textMuted,
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              Visa
              <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>⌄</span>
            </span>
          </button>
        ) : (
          <>
            {collapseDone && (
              <button
                onClick={() => setShowDone(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: theme.colors.textMuted,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  padding: '0 0 0.1rem',
                  alignSelf: 'flex-start',
                }}
              >
                – Dölj utförda
              </button>
            )}
            {doneItems.map((item) => (
              <FocusRow key={item.id} item={item} showScheduled={showScheduled} onOpenDetail={setDetailItemId} />
            ))}
          </>
        )}

        {activeItems.map((item) => (
          <FocusRow key={item.id} item={item} showScheduled={showScheduled} onOpenDetail={setDetailItemId} />
        ))}
      </div>

      <ItemDetailModal itemId={detailItemId} onClose={() => setDetailItemId(null)} />
    </div>
  )
}

function FocusRow({ item, showScheduled, onOpenDetail }) {
  const done = item.status === 'klar'
  return (
    <div
      style={{
        background: done ? theme.colors.surfaceGreen : theme.colors.surface,
        border: `1px solid ${done ? theme.colors.success : theme.colors.border}`,
        borderRadius: theme.radius.sm,
        padding: '0.6rem 0.8rem',
        boxShadow: theme.shadow.sm,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
      }}
    >
      <button
        onClick={() => (done ? reopenItem(item.id) : markDoneWithConfirm(item.id))}
        title={done ? 'Ångra' : 'Markera som klar'}
        style={{
          border: `1.5px solid ${theme.colors.success}`,
          background: done ? theme.colors.success : theme.colors.bg,
          borderRadius: '50%',
          width: '1.3rem',
          height: '1.3rem',
          flexShrink: 0,
          cursor: 'pointer',
          padding: 0,
          color: done ? '#ffffff' : theme.colors.success,
          fontSize: '0.8rem',
          fontWeight: 700,
        }}
      >
        ✓
      </button>
      <div onClick={() => onOpenDetail(item.id)} style={{ flex: 1, cursor: 'pointer' }}>
        <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
          {TYPE_LABEL[item.type]}
        </div>
        <div
          style={{
            color: done ? theme.colors.textMuted : theme.colors.text,
            fontWeight: 500,
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {item.title}
        </div>
      </div>
      {showScheduled && (
        <button
          onClick={() => sendToBacklog(item.id)}
          title="Tillbaka till Backlog"
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
      )}
    </div>
  )
}

const dateNavBtn = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  color: theme.colors.text,
  borderRadius: theme.radius.sm,
  width: '1.8rem',
  height: '1.8rem',
  cursor: 'pointer',
  fontSize: '1rem',
}
