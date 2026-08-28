import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { markDone, reopenItem, unschedule } from '../hooks/useItems'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const COLLAPSE_THRESHOLD = 3

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function DagensFokus() {
  const [showDone, setShowDone] = useState(false)

  const scheduledToday = useLiveQuery(async () => {
    return db.items.where('scheduled_date').equals(todayISO()).toArray()
  }, [])

  const topPriority = useLiveQuery(async () => {
    const all = await db.items.where('status').equals('prioriterad').toArray()
    return all
      .sort((a, b) => (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999))
      .slice(0, 5)
  }, [])

  const showScheduled = (scheduledToday?.length ?? 0) > 0
  const rawList = showScheduled ? scheduledToday : (topPriority ?? [])

  const byPriority = (a, b) => (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999)
  const activeItems = rawList.filter((i) => i.status !== 'klar').sort(byPriority)
  const doneItems = rawList.filter((i) => i.status === 'klar').sort(byPriority)
  const collapseDone = doneItems.length > COLLAPSE_THRESHOLD

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ color: theme.colors.text, margin: '0 0 0.25rem' }}>Dagens Fokus</h2>
      <p style={{ color: theme.colors.textMuted, fontSize: '0.9rem', margin: '0 0 0.75rem' }}>
        {showScheduled ? 'Schemalagt idag' : 'Inget schemalagt idag — de fem högst prioriterade'}
      </p>

      {rawList.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>
          Inget att visa än. Fånga något med Snabbfånga, eller flytta objekt till "Prioriterad" i Kanban.
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
              fontWeight: 500,
            }}
          >
            <span style={{ color: theme.colors.success, fontSize: '1rem' }}>✓</span>
            Utförda ({doneItems.length})
            <span style={{ marginLeft: 'auto', color: theme.colors.textMuted, fontSize: '0.8rem' }}>Visa ▾</span>
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
              <FocusRow key={item.id} item={item} showScheduled={showScheduled} />
            ))}
          </>
        )}

        {activeItems.map((item) => (
          <FocusRow key={item.id} item={item} showScheduled={showScheduled} />
        ))}
      </div>
    </div>
  )
}

function FocusRow({ item, showScheduled }) {
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
        onClick={() => (done ? reopenItem(item.id) : markDone(item.id))}
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
      <div style={{ flex: 1 }}>
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
          onClick={() => unschedule(item.id)}
          title="Ta bort från Dagens Fokus"
          style={{
            border: 'none',
            background: 'transparent',
            color: theme.colors.textMuted,
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
