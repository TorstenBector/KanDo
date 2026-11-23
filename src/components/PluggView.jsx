import { useState } from 'react'
import { setActivityArchived, usePluggActivities, usePluggDay, usePluggSessionsFor } from '../hooks/usePlugg'
import { daysUntil, describeSlot, formatMinutes } from '../lib/plugg'
import { formatShortDate, todayISO } from '../lib/date'
import PluggSessionCard from './PluggSessionCard'
import PluggActivityEditor from './PluggActivityEditor'
import PushSettings from './PushSettings'
import ConnectionsPanel from './ConnectionsPanel'
import { theme } from '../theme'

const UPCOMING_SHOWN = 4

// Fliken Plugg: dagens pass överst, sedan aktiviteterna (prov m.m.) med
// schema, framsteg och kommande pass.
export default function PluggView() {
  const [editing, setEditing] = useState(null) // null | 'new' | activity
  const [showFinished, setShowFinished] = useState(false)
  const today = todayISO()
  const activities = usePluggActivities()
  const todaySessions = usePluggDay(today)

  const isFinished = (a) => !!a.archived_at || (a.end_date && a.end_date < today)
  const current = (activities ?? []).filter((a) => !isFinished(a))
  const finished = (activities ?? []).filter(isFinished)

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.2rem', maxWidth: '720px' }}>
      <button onClick={() => setEditing('new')} style={newBtn}>+ Ny pluggaktivitet</button>

      <PushSettings />

      <section>
        <h2 style={h2}>Idag</h2>
        {todaySessions && todaySessions.length === 0 && (
          <p style={muted}>Inga pluggpass idag.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {(todaySessions ?? []).map(({ session, activity }) => (
            <PluggSessionCard key={session.id} session={session} activity={activity} />
          ))}
        </div>
      </section>

      <section>
        <h2 style={h2}>Aktiviteter</h2>
        {activities && current.length === 0 && (
          <p style={muted}>
            Lägg upp något du ska plugga till, t.ex. ett prov. Välj dagar och tider, så dyker passen upp här och i Dagens Fokus.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {current.map((a) => (
            <ActivityCard key={a.id} activity={a} onEdit={() => setEditing(a)} />
          ))}
        </div>
      </section>

      {finished.length > 0 && (
        <section>
          <button onClick={() => setShowFinished((s) => !s)} style={toggleBtn}>
            {showFinished ? '–' : '+'} Avslutade ({finished.length})
          </button>
          {showFinished && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.6rem' }}>
              {finished.map((a) => (
                <ActivityCard key={a.id} activity={a} onEdit={() => setEditing(a)} finished />
              ))}
            </div>
          )}
        </section>
      )}

      <ConnectionsPanel />

      {editing && (
        <PluggActivityEditor activity={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function ActivityCard({ activity, onEdit, finished = false }) {
  const [showAll, setShowAll] = useState(false)
  const sessions = usePluggSessionsFor(activity.id) ?? []
  const today = todayISO()

  const done = sessions.filter((s) => s.status === 'klar')
  const missed = sessions.filter((s) => s.status !== 'klar' && s.date < today)
  const upcoming = sessions.filter((s) => s.status !== 'klar' && s.date > today)
  const doneSeconds = done.reduce((sum, s) => sum + (s.actual_seconds ?? s.planned_minutes * 60), 0)
  const days = activity.end_date ? daysUntil(activity.end_date) : null
  const shownUpcoming = showAll ? upcoming : upcoming.slice(0, UPCOMING_SHOWN)

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: theme.colors.text }}>📚 {activity.title}</div>
          {activity.end_date && (
            <div style={{ fontSize: '0.85rem', color: theme.colors.textMuted, marginTop: '0.15rem' }}>
              Prov {formatShortDate(activity.end_date)}
              {days != null && days >= 0 && ` · ${days === 0 ? 'idag!' : days === 1 ? 'imorgon' : `om ${days} dagar`}`}
            </div>
          )}
        </div>
        <button onClick={onEdit} style={smallBtn}>✎ Ändra</button>
      </div>

      {activity.description && (
        <div style={{ fontSize: '0.9rem', color: theme.colors.text, whiteSpace: 'pre-wrap' }}>{activity.description}</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        {(activity.schedule ?? []).map((slot, i) => (
          <span key={i} style={slotChip}>{describeSlot(slot)}</span>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
        <span style={{ color: theme.colors.success, fontWeight: 700 }}>✓ {done.length} klara</span>
        {doneSeconds > 0 && <span style={{ color: theme.colors.text }}>{formatMinutes(doneSeconds)} pluggat</span>}
        {missed.length > 0 && <span style={{ color: theme.colors.textMuted }}>{missed.length} missade</span>}
        {!finished && <span style={{ color: theme.colors.textMuted }}>{upcoming.length} kommande</span>}
      </div>

      {!finished && shownUpcoming.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: theme.colors.textMuted, textTransform: 'uppercase' }}>Kommande</div>
          {shownUpcoming.map((s) => (
            <PluggSessionCard key={s.id} session={s} activity={activity} showDate hideTitle />
          ))}
          {upcoming.length > UPCOMING_SHOWN && (
            <button onClick={() => setShowAll((v) => !v)} style={{ ...toggleBtn, fontSize: '0.8rem' }}>
              {showAll ? 'Visa färre' : `Visa alla ${upcoming.length}`}
            </button>
          )}
        </div>
      )}

      <button onClick={() => setActivityArchived(activity.id, !activity.archived_at)} style={{ ...toggleBtn, fontSize: '0.8rem', alignSelf: 'flex-start' }}>
        {activity.archived_at ? 'Återaktivera' : 'Avsluta aktiviteten'}
      </button>
    </div>
  )
}

const h2 = { fontSize: '0.85rem', textTransform: 'uppercase', color: theme.colors.textMuted, margin: '0 0 0.5rem' }
const muted = { color: theme.colors.textMuted, fontSize: '0.9rem', margin: 0 }

const newBtn = {
  border: 'none',
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  borderRadius: theme.radius.md,
  padding: '0.75rem 1rem',
  fontSize: '1rem',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: theme.shadow.sm,
  alignSelf: 'flex-start',
}

const card = {
  background: theme.colors.surface,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.md,
  padding: '0.85rem',
  boxShadow: theme.shadow.sm,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
}

const slotChip = {
  background: theme.colors.bg,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '999px',
  padding: '0.2rem 0.6rem',
  fontSize: '0.8rem',
  color: theme.colors.text,
}

const smallBtn = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.bg,
  color: theme.colors.text,
  borderRadius: theme.radius.sm,
  padding: '0.3rem 0.6rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
  flexShrink: 0,
}

const toggleBtn = {
  border: 'none',
  background: 'transparent',
  color: theme.colors.primary,
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
}
