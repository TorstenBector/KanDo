import { todayISO, formatShortDate } from '../lib/date'
import { theme } from '../theme'
import { pill, pillActive } from './captureStyles'

// Kontroller som delas av Snabbfånga (QuickCapture) och kortets editläge
// (ItemDetailModal), så båda har samma utseende och logiska upplägg
// (KanDo Vibe #6267).

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

// Snabbvalsraden ovanför Beskrivning — samma i Snabbfånga och kortets
// editläge. Dagens Fokus är knappen man trycker på hela tiden, så den får
// växa och fylla ut mellan Prioriterad och Inköpslista (som ligger mot
// högerkanten) och har en tydligare ram (KanDo Vibe #8510).
export function QuickToggles({ prioritized, onTogglePrioritized, inFocus, onToggleFocus, inShoppingList, onToggleShoppingList }) {
  const side = { whiteSpace: 'nowrap', flexShrink: 0 }
  const focusBase = {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap',
    fontSize: '0.9rem',
    fontWeight: 700,
    padding: '0.45rem 0.6rem',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
      <button onClick={onTogglePrioritized} style={{ ...(prioritized ? pillActive : pill), ...side }}>
        {prioritized ? '✓ Prioriterad' : '+ Prioriterad'}
      </button>
      <button
        onClick={onToggleFocus}
        style={
          inFocus
            ? { ...pillActive, ...focusBase, border: `2px solid ${theme.colors.primary}` }
            : { ...pill, ...focusBase, border: `2px solid ${theme.colors.primary}`, color: theme.colors.primary, background: theme.colors.surfaceGreen }
        }
      >
        {inFocus ? '✓ Dagens Fokus' : '+ Dagens Fokus'}
      </button>
      <button onClick={onToggleShoppingList} style={{ ...(inShoppingList ? pillActive : pill), ...side }}>
        {inShoppingList ? '✓ Inköpslista' : '+ Inköpslista'}
      </button>
    </div>
  )
}
