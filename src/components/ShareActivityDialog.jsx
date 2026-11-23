import { useEffect, useState } from 'react'
import { listConnections } from '../lib/connections'
import { sendSuggestion } from '../lib/pluggSuggestions'
import { setActivityArchived } from '../hooks/usePlugg'
import { describeSlot } from '../lib/plugg'
import { useSyncStore } from '../store/syncStore'
import { useBodyScrollLock, useVisualViewport } from '../hooks/useVisualViewport'
import { theme } from '../theme'

// "Dela med…" på en pluggaktivitet: skickas som planeringsförslag till ett
// kopplat konto. Mottagaren lägger till den som sin egen — då är det
// mottagarens telefon som får påminnelserna.
export default function ShareActivityDialog({ activity, onClose }) {
  const session = useSyncStore((s) => s.session)
  const viewport = useVisualViewport()
  useBodyScrollLock(true)
  const [connections, setConnections] = useState(null)
  const [to, setTo] = useState(null)
  const [message, setMessage] = useState('')
  const [keepCopy, setKeepCopy] = useState(false)
  const [state, setState] = useState('idle') // idle | sending | sent
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!session) return undefined
    let alive = true
    listConnections().then(
      (list) => {
        if (!alive) return
        const accepted = list.filter((c) => c.accepted_at)
        setConnections(accepted)
        if (accepted.length === 1) setTo(accepted[0].other_user_id)
      },
      (err) => { if (alive) setError(err.message) },
    )
    return () => { alive = false }
  }, [session])

  const recipient = connections?.find((c) => c.other_user_id === to)

  async function send() {
    if (!to) return
    setState('sending')
    setError(null)
    try {
      await sendSuggestion(to, activity, message)
      // Annars får avsändaren själv påminnelser för någon annans pass.
      if (!keepCopy) await setActivityArchived(activity.id, true)
      setState('sent')
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  let body
  if (!session) {
    body = <p style={p}>Logga in för att dela.</p>
  } else if (connections === null) {
    body = <p style={p}>{error ? `⚠ ${error}` : 'Hämtar kopplade konton…'}</p>
  } else if (connections.length === 0) {
    body = (
      <p style={p}>
        Du har inga kopplade konton än. Bjud in den du vill dela med under <strong>👨‍👦 Kopplade konton</strong> längst ner i Plugg.
      </p>
    )
  } else if (state === 'sent') {
    body = (
      <>
        <p style={{ ...p, fontWeight: 700 }}>✓ Förslaget är skickat till {recipient?.other_name}.</p>
        <p style={p}>
          {recipient?.other_name} får en notis och väljer att lägga till det. Du ser svaret under <strong>Förslag</strong> överst i Plugg.
          {!keepCopy && ' Din egen kopia ligger under Avslutade.'}
        </p>
        <button onClick={onClose} style={primaryBtn}>Klar</button>
      </>
    )
  } else {
    body = (
      <>
        <p style={p}>
          Skicka <strong>{activity.title}</strong> som förslag. Mottagaren lägger till den i sin egen Plugg och får påminnelserna på sin telefon.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {(activity.schedule ?? []).map((slot, i) => (
            <span key={i} style={chip}>{describeSlot(slot)}</span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={label}>Till</div>
          {connections.map((c) => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', cursor: 'pointer' }}>
              <input type="radio" name="share-to" checked={to === c.other_user_id} onChange={() => setTo(c.other_user_id)} />
              {c.other_name}
            </label>
          ))}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={label}>Meddelande (valfritt)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="T.ex. Lycka till på provet! 💪"
            style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={keepCopy} onChange={(e) => setKeepCopy(e.target.checked)} />
          Behåll aktiviteten hos mig också (då får jag också påminnelser)
        </label>

        {error && <p style={{ ...p, color: theme.colors.danger }}>⚠ {error}</p>}

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button disabled={!to || state === 'sending'} onClick={send} style={{ ...primaryBtn, opacity: to ? 1 : 0.5 }}>
            {state === 'sending' ? 'Skickar…' : `📤 Skicka${recipient ? ` till ${recipient.other_name}` : ''}`}
          </button>
          <button onClick={onClose} style={linkBtn}>Avbryt</button>
        </div>
      </>
    )
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', left: 0, right: 0, top: viewport.offsetTop, height: viewport.height,
        background: 'rgba(26,58,26,0.45)', zIndex: 300, display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.bg, width: '100%', maxWidth: '480px', maxHeight: '100%', overflowY: 'auto',
          borderRadius: `0 0 ${theme.radius.lg} ${theme.radius.lg}`, boxShadow: theme.shadow.md,
          padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: theme.colors.primary }}>📤 Dela med…</div>
        {body}
      </div>
    </div>
  )
}

const p = { margin: 0, fontSize: '0.92rem', color: theme.colors.text, lineHeight: 1.45 }
const label = { fontSize: '0.8rem', fontWeight: 700, color: theme.colors.textMuted, textTransform: 'uppercase' }
const chip = {
  background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: '999px',
  padding: '0.2rem 0.6rem', fontSize: '0.8rem', color: theme.colors.text,
}
const input = {
  border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, color: theme.colors.text,
  borderRadius: theme.radius.sm, padding: '0.5rem 0.6rem', fontSize: '16px',
}
const primaryBtn = {
  border: 'none', background: theme.colors.primary, color: theme.colors.textOnPrimary, borderRadius: theme.radius.sm,
  padding: '0.6rem 1rem', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start',
}
const linkBtn = {
  border: 'none', background: 'transparent', color: theme.colors.textMuted, fontSize: '0.85rem',
  textDecoration: 'underline', cursor: 'pointer', padding: 0,
}
