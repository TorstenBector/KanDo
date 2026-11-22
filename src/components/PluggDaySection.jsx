import { usePluggDay } from '../hooks/usePlugg'
import PluggSessionCard from './PluggSessionCard'
import { theme } from '../theme'

// Dagens pluggpass överst i Dagens Fokus. Syns bara när dagen har pass.
export default function PluggDaySection({ dateISO }) {
  const day = usePluggDay(dateISO)
  if (!day || day.length === 0) return null
  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <h3 style={{ color: theme.colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase', margin: '0 0 0.4rem' }}>
        📚 Plugg ({day.length})
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '0.6rem',
          alignItems: 'start',
        }}
      >
        {day.map(({ session, activity }) => (
          <PluggSessionCard key={session.id} session={session} activity={activity} />
        ))}
      </div>
    </div>
  )
}
