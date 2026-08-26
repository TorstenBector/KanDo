import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { reopenItem } from '../hooks/useItems'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfWeek(d) {
  const x = startOfDay(d)
  const day = (x.getDay() + 6) % 7 // Monday = 0
  x.setDate(x.getDate() - day)
  return x
}

function startOfMonth(d) {
  const x = startOfDay(d)
  x.setDate(1)
  return x
}

function groupByRecency(items) {
  const now = new Date()
  const today = startOfDay(now)
  const week = startOfWeek(now)
  const month = startOfMonth(now)

  const groups = { Idag: [], 'Den här veckan': [], 'Den här månaden': [], Tidigare: [] }
  for (const item of items) {
    const completed = new Date(item.completed_at)
    if (completed >= today) groups['Idag'].push(item)
    else if (completed >= week) groups['Den här veckan'].push(item)
    else if (completed >= month) groups['Den här månaden'].push(item)
    else groups['Tidigare'].push(item)
  }
  return groups
}

export default function UtfordaView() {
  const items = useLiveQuery(async () => {
    const all = await db.items.where('status').equals('klar').toArray()
    return all.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
  }, []) ?? []

  const groups = groupByRecency(items)

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ color: theme.colors.text, margin: '0 0 1rem' }}>Utförda</h2>

      {items.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>Inget klarmarkerat än.</p>
      )}

      {Object.entries(groups).map(([label, groupItems]) =>
        groupItems.length === 0 ? null : (
          <div key={label} style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ color: theme.colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>
              {label}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {groupItems.map((item) => (
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
                  <span style={{ color: theme.colors.success, fontSize: '1rem' }}>✓</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.65rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
                      {TYPE_LABEL[item.type]}
                    </div>
                    <div style={{ color: theme.colors.text, fontWeight: 500, textDecoration: 'line-through' }}>
                      {item.title}
                    </div>
                    {item.recurrence_days && item.next_due_date && (
                      <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textDecoration: 'none' }}>
                        🔁 Återkommer {item.next_due_date}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => reopenItem(item.id)}
                    title="Ångra"
                    style={{
                      border: `1px solid ${theme.colors.border}`,
                      background: 'transparent',
                      borderRadius: theme.radius.sm,
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.7rem',
                      color: theme.colors.textMuted,
                      cursor: 'pointer',
                    }}
                  >
                    Ångra
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}
