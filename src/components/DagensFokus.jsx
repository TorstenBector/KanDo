import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { markDone } from '../hooks/useItems'
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
  const list = showScheduled ? scheduledToday : (topPriority ?? [])

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
        {list.map((item) => (
          <div
            key={item.id}
            style={{
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.sm,
              padding: '0.6rem 0.8rem',
              boxShadow: theme.shadow.sm,
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
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
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
                {TYPE_LABEL[item.type]}
              </div>
              <div style={{ color: theme.colors.text, fontWeight: 500 }}>{item.title}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
