import { todayISO, formatShortDate } from '../lib/date'
import { theme } from '../theme'

// Kontroller som delas av Snabbfånga (QuickCapture) och kortets editläge
// (ItemDetailModal), så båda har samma utseende och logiska upplägg
// (KanDo Vibe #6267).

export const pill = {
  fontSize: '0.8rem',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '999px',
  padding: '0.3rem 0.7rem',
  background: 'transparent',
  color: theme.colors.textMuted,
  cursor: 'pointer',
}

export const pillActive = {
  ...pill,
  border: `1px solid ${theme.colors.primary}`,
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
}

export function TagChip({ tag, onRemove }) {
  const isContext = tag.kind === 'context'
  return (
    <span
      onClick={onRemove}
      title="Klicka för att ta bort"
      style={{
        fontSize: '0.75rem',
        fontWeight: 600,
        padding: '0.15rem 0.5rem',
        borderRadius: '999px',
        background: isContext ? theme.colors.accent : theme.colors.primary,
        color: isContext ? theme.colors.primaryDark : theme.colors.textOnPrimary,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {isContext ? '📍 ' : ''}{tag.name}
    </span>
  )
}

// "📅 Planerad till" — schemalägg ett annat datum än idag (idag sköts av
// "+ Dagens Fokus"-knappen), KanDo Vibe #6645. Ett genomskinligt datumfält
// ligger över knappen: iOS öppnar den inbyggda kalendern vid tryck och
// showPicker() täcker desktop-webbläsare.
export function PlannedDatePill({ value, onChange, min }) {
  const isOtherDay = !!value && value !== todayISO()
  return (
    <>
      <div style={{ position: 'relative', display: 'flex' }}>
        <span style={{ ...(isOtherDay ? pillActive : pill), display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
          {isOtherDay ? `📅 ${formatShortDate(value)}` : '📅 Planerad till'}
        </span>
        <input
          type="date"
          min={min}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          onClick={(e) => { try { e.currentTarget.showPicker?.() } catch { /* redan öppen / ej stöd */ } }}
          aria-label="Planerad till datum"
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
        />
      </div>
      {isOtherDay && (
        <button onClick={() => onChange(null)} title="Ta bort planerat datum" style={{ ...pill, padding: '0.3rem 0.6rem' }}>
          ✕
        </button>
      )}
    </>
  )
}
