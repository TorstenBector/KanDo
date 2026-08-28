import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { markDone, reopenItem, unschedule } from '../hooks/useItems'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function DagensFokus() {
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

  // Done items float to the top (see markDone/reopenItem below); within
  // each group, keep the same order as the Prio tab's priority_rank —
  // items never sent through Prioriterad (no rank) sort after ranked ones.
  const list = [...rawList].sort((a, b) => {
    const aDone = a.status === 'klar' ? 0 : 1
    const bDone = b.status === 'klar' ? 0 : 1
    if (aDone !== bDone) return aDone - bDone
    return (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999)
  })

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ color: theme.colors.text, margin: '0 0 0.25rem' }}>Dagens Fokus</h2>
      <p style={{ color: theme.colors.textMuted, fontSize: '0.9rem', margin: '0 0 0.75rem' }}>
        {showScheduled ? 'Schemalagt idag' : 'Inget schemalagt idag — de fem högst prioriterade'}
      </p>

      {list.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>
          Inget att visa än. Fånga något med Snabbfånga, eller flytta objekt till "Prioriterad" i Kanban.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {list.map((item) => {
          const done = item.status === 'klar'
          return (
            <div
              key={item.id}
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
        })}
      </div>
    </div>
  )
}
