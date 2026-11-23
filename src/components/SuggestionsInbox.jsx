import { useCallback, useEffect, useState } from 'react'
import { listSuggestions, respondSuggestion, withdrawSuggestion } from '../lib/pluggSuggestions'
import { createActivity } from '../hooks/usePlugg'
import { describeSlot } from '../lib/plugg'
import { formatShortDate } from '../lib/date'
import { useSyncStore } from '../store/syncStore'
import { useNow } from '../hooks/useNow'
import PluggActivityEditor from './PluggActivityEditor'
import { theme } from '../theme'

// Överst i Plugg: inkomna planeringsförslag (Lägg till / Ändra först /
// Nej tack) och status på förslag man själv skickat. Online-only.
export default function SuggestionsInbox() {
  const session = useSyncStore((s) => s.session)
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [justAdded, setJustAdded] = useState(null)
  const now = useNow(60000)

  const load = useCallback(() => listSuggestions().then(setItems, (err) => setError(err.message)), [])

  useEffect(() => {
    if (!session) return undefined
    let alive = true
    const refresh = () => listSuggestions().then(
      (list) => { if (alive) setItems(list) },
      (err) => { if (alive) setError(err.message) },
    )
    refresh()
    // Ett förslag kan komma medan appen ligger i bakgrunden.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session])

  if (!session) return null

  const incoming = items.filter((s) => s.incoming && s.status === 'pending')
  // Skickade: visa väntande, och svar från senaste veckan.
  const weekAgo = now - 7 * 86400000
  const sent = items.filter((s) => !s.incoming && (s.status === 'pending' || Date.parse(s.responded_at ?? s.created_at) > weekAgo))
  if (incoming.length === 0 && sent.length === 0 && !justAdded && !error) return null

  async function accept(s) {
    setBusyId(s.id)
    setError(null)
    try {
      await createActivity({ title: s.title, description: s.description, end_date: s.end_date, schedule: s.schedule })
      await respondSuggestion(s.id, true)
      setJustAdded(s.title)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function decline(s) {
    if (!window.confirm(`Tacka nej till "${s.title}"?`)) return
    setBusyId(s.id)
    try {
      await respondSuggestion(s.id, false)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function withdraw(s) {
    if (!window.confirm(`Återkalla förslaget "${s.title}" till ${s.other_name}?`)) return
    try {
      await withdrawSuggestion(s.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {error && <div style={{ color: theme.colors.danger, fontSize: '0.85rem' }}>⚠ {error}</div>}
      {justAdded && (
        <div style={{ ...card, background: theme.colors.surfaceGreen, borderColor: theme.colors.success }}>
          ✓ <strong>{justAdded}</strong> är tillagd — passen syns nedan och i Dagens Fokus.
          <button onClick={() => setJustAdded(null)} style={{ ...linkBtn, marginLeft: '0.5rem' }}>OK</button>
        </div>
      )}

      {incoming.map((s) => (
        <div key={s.id} style={{ ...card, borderColor: theme.colors.orange, borderWidth: 2 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: theme.colors.orange, textTransform: 'uppercase' }}>
            📬 Förslag från {s.other_name}
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>📚 {s.title}</div>
          {s.end_date && <div style={muted}>Prov {formatShortDate(s.end_date)}</div>}
          {s.message && <div style={{ fontStyle: 'italic' }}>"{s.message}"</div>}
          {s.description && <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{s.description}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {(s.schedule ?? []).map((slot, i) => <span key={i} style={chip}>{describeSlot(slot)}</span>)}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button disabled={busyId === s.id} onClick={() => accept(s)} style={primaryBtn}>
              {busyId === s.id ? 'Lägger till…' : '✓ Lägg till'}
            </button>
            <button disabled={busyId === s.id} onClick={() => setEditing(s)} style={secondaryBtn}>✎ Ändra först</button>
            <button disabled={busyId === s.id} onClick={() => decline(s)} style={linkBtn}>Nej tack</button>
          </div>
        </div>
      ))}

      {sent.length > 0 && (
        <div style={{ ...card, gap: '0.35rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: theme.colors.textMuted, textTransform: 'uppercase' }}>Skickade förslag</div>
          {sent.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{s.title}</strong> → {s.other_name}{' '}
                <span style={muted}>
                  {s.status === 'pending' ? '· väntar' : s.status === 'accepted' ? '· ✓ tillagd' : '· avböjd'}
                </span>
              </span>
              {s.status === 'pending' && <button onClick={() => withdraw(s)} style={linkBtn}>Återkalla</button>}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <PluggActivityEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await respondSuggestion(editing.id, true).catch((err) => setError(err.message))
            setJustAdded(editing.title)
            await load()
          }}
        />
      )}
    </section>
  )
}

const card = {
  background: theme.colors.surface,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.md,
  padding: '0.8rem 0.85rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  color: theme.colors.text,
  fontSize: '0.9rem',
}
const muted = { color: theme.colors.textMuted, fontSize: '0.85rem' }
const chip = {
  background: theme.colors.bg, border: `1px solid ${theme.colors.border}`, borderRadius: '999px',
  padding: '0.2rem 0.6rem', fontSize: '0.8rem',
}
const primaryBtn = {
  border: 'none', background: theme.colors.primary, color: theme.colors.textOnPrimary, borderRadius: theme.radius.sm,
  padding: '0.5rem 0.9rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
}
const secondaryBtn = {
  border: `1px solid ${theme.colors.border}`, background: theme.colors.bg, color: theme.colors.text, borderRadius: theme.radius.sm,
  padding: '0.45rem 0.8rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
}
const linkBtn = {
  border: 'none', background: 'transparent', color: theme.colors.textMuted, fontSize: '0.85rem',
  textDecoration: 'underline', cursor: 'pointer', padding: 0,
}
