import { useEffect } from 'react'
import { useNow } from '../hooks/useNow'
import { completeSession, confirmSession, extendSession, pauseSession, resetSession, resumeSession, startSession } from '../hooks/usePlugg'
import { EXTEND_MINUTES, elapsedSeconds, formatClock, formatMinutes, sessionPhase, sessionStart, targetSeconds } from '../lib/plugg'
import { chimeOnce, unlockAudio } from '../lib/pluggSound'
import { formatShortDate, todayISO } from '../lib/date'
import { theme } from '../theme'

const PHASE_STYLE = {
  planerad: { bg: theme.colors.surface, border: theme.colors.border },
  snart: { bg: theme.colors.orangeSoft, border: theme.colors.orange },
  pagar: { bg: theme.colors.surfaceGreen, border: theme.colors.primary },
  pausad: { bg: theme.colors.surfaceGreen, border: theme.colors.border },
  tidenUte: { bg: theme.colors.surfaceGreen, border: theme.colors.success },
  klar: { bg: theme.colors.surfaceGreen, border: theme.colors.success },
  missad: { bg: theme.colors.warningSoft, border: theme.colors.warning },
}

// Ett pluggpass: tid, aktivitet och — beroende på läge — Starta, timer med
// Paus, eller Klar / Kör 10 min till. Blir orange 15 min innan start.
export default function PluggSessionCard({ session, activity, showDate = false, hideTitle = false }) {
  const running = session.status === 'pagar' && !session.paused_at
  const now = useNow(running ? 1000 : 30000)
  const phase = sessionPhase(session, now)
  const style = PHASE_STYLE[phase]
  const target = targetSeconds(session)
  const elapsed = elapsedSeconds(session, now)
  const isToday = session.date === todayISO()

  // Pip bara precis när tiden tar slut — inte när man öppnar appen långt
  // efteråt på ett pass som blev liggande.
  const justEnded = phase === 'tidenUte' && elapsed - target < 120
  useEffect(() => {
    if (justEnded) chimeOnce(`${session.id}|${target}`)
  }, [justEnded, session.id, target])

  const minutesToStart = Math.ceil((sessionStart(session).getTime() - now) / 60000)

  return (
    <div
      style={{
        background: style.bg,
        border: `${phase === 'snart' || phase === 'pagar' ? 2 : 1}px solid ${style.border}`,
        borderRadius: theme.radius.md,
        padding: '0.7rem 0.85rem',
        boxShadow: theme.shadow.sm,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span
          style={{
            fontWeight: 700,
            fontSize: '0.95rem',
            fontVariantNumeric: 'tabular-nums',
            color: phase === 'snart' ? theme.colors.orange : theme.colors.text,
            flexShrink: 0,
          }}
        >
          {showDate ? `${formatShortDate(session.date)} ` : ''}{session.start_time}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hideTitle ? '' : `📚 ${activity?.title ?? 'Plugg'}`}
        </span>
        <span style={{ fontSize: '0.8rem', color: theme.colors.textMuted, flexShrink: 0 }}>
          {session.planned_minutes} min{session.extra_minutes ? ` +${session.extra_minutes}` : ''}
        </span>
      </div>

      {phase === 'snart' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{ color: theme.colors.orange, fontWeight: 700, fontSize: '0.9rem' }}>
            {minutesToStart > 0 ? `⏰ Börjar om ${minutesToStart} min` : '⏰ Dags nu!'}
          </span>
          {session.confirmed_at ? (
            <span style={{ fontSize: '0.8rem', color: theme.colors.textMuted }}>👍 Bekräftad</span>
          ) : (
            <button onClick={() => confirmSession(session.id)} style={{ ...linkBtn, color: theme.colors.orange, fontWeight: 600 }}>
              👍 Det ska jag komma ihåg
            </button>
          )}
        </div>
      )}

      {phase === 'missad' && (
        <div style={{ color: theme.colors.text, fontSize: '0.85rem' }}>Missat</div>
      )}

      {phase === 'klar' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <span style={{ color: theme.colors.success, fontWeight: 700 }}>✓ Klart</span>
          {session.actual_seconds != null && (
            <span style={{ color: theme.colors.textMuted }}>{formatMinutes(session.actual_seconds)} pluggat</span>
          )}
          <button onClick={() => resetSession(session.id)} style={{ ...linkBtn, marginLeft: 'auto' }}>Ångra</button>
        </div>
      )}

      {(phase === 'pagar' || phase === 'pausad') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: phase === 'pausad' ? theme.colors.textMuted : theme.colors.primary,
              lineHeight: 1,
            }}
            aria-label="Tid kvar"
          >
            {formatClock(target - elapsed)}
          </span>
          {phase === 'pausad' && <span style={{ color: theme.colors.textMuted, fontSize: '0.85rem' }}>Pausad</span>}
          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
            {phase === 'pagar' ? (
              <button onClick={() => pauseSession(session.id)} style={secondaryBtn}>⏸ Paus</button>
            ) : (
              <button onClick={() => { unlockAudio(); resumeSession(session.id) }} style={primaryBtn}>▶ Fortsätt</button>
            )}
            <button onClick={() => completeSession(session.id)} style={secondaryBtn}>✓ Klar</button>
          </div>
        </div>
      )}

      {phase === 'tidenUte' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontWeight: 700, color: theme.colors.text }}>🎉 Tiden är ute! Bra jobbat.</div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => completeSession(session.id)} style={primaryBtn}>✓ Klar</button>
            <button onClick={() => { unlockAudio(); extendSession(session.id) }} style={secondaryBtn}>
              Kör {EXTEND_MINUTES} min till
            </button>
          </div>
        </div>
      )}

      {(phase === 'planerad' || phase === 'snart') && isToday && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => { unlockAudio(); startSession(session.id) }}
            style={phase === 'snart' ? { ...primaryBtn, background: theme.colors.orange, color: '#fff' } : primaryBtn}
          >
            ▶ Starta
          </button>
          <button onClick={() => completeSession(session.id)} style={secondaryBtn}>✓ Klar</button>
        </div>
      )}

      {phase === 'missad' && (
        <button onClick={() => completeSession(session.id)} style={{ ...linkBtn, alignSelf: 'flex-start' }}>
          Jag gjorde det ändå
        </button>
      )}
    </div>
  )
}

const primaryBtn = {
  border: 'none',
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  borderRadius: theme.radius.sm,
  padding: '0.45rem 0.9rem',
  fontSize: '0.9rem',
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryBtn = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.bg,
  color: theme.colors.text,
  borderRadius: theme.radius.sm,
  padding: '0.45rem 0.9rem',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const linkBtn = {
  border: 'none',
  background: 'transparent',
  color: theme.colors.textMuted,
  fontSize: '0.8rem',
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0,
}
