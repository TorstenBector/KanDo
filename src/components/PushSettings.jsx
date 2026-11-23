import { useEffect, useState } from 'react'
import { disablePush, enablePush, getPushState, sendTestPush } from '../lib/push'
import { useSyncStore } from '../store/syncStore'
import { theme } from '../theme'

// Slå på/av pushnotiser för pluggpass på den här enheten.
export default function PushSettings() {
  const session = useSyncStore((s) => s.session)
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let alive = true
    getPushState().then((s) => { if (alive) setState(s) }, () => { if (alive) setState('unsupported') })
    return () => { alive = false }
  }, [])

  async function run(fn, okMessage) {
    setBusy(true)
    setMessage(null)
    try {
      const result = await fn()
      setState(await getPushState())
      setMessage(typeof okMessage === 'function' ? okMessage(result) : okMessage)
    } catch (err) {
      setMessage(`⚠ ${err?.message ?? 'Något gick fel'}`)
      setState(await getPushState().catch(() => 'unsupported'))
    } finally {
      setBusy(false)
    }
  }

  if (state === null) return null

  let content
  if (!session) {
    content = <span>🔔 Logga in för att få påminnelser på mobilen inför dina pass.</span>
  } else if (state === 'ios-install') {
    content = (
      <span>
        🔔 För påminnelser på iPhone: öppna KanDo i Safari, tryck på <strong>Dela</strong> → <strong>Lägg till på hemskärmen</strong>, och öppna KanDo därifrån.
      </span>
    )
  } else if (state === 'unsupported') {
    content = <span>🔔 Den här webbläsaren kan inte ta emot påminnelser.</span>
  } else if (state === 'denied') {
    content = <span>🔔 Notiser är blockerade för KanDo. Tillåt dem i telefonens inställningar för att få påminnelser.</span>
  } else if (state === 'off') {
    content = (
      <>
        <span style={{ flex: 1, minWidth: '12rem' }}>🔔 Få en påminnelse 15 min före varje pass, och när tiden är ute.</span>
        <button disabled={busy} onClick={() => run(enablePush, '✓ Påminnelser är på för den här enheten.')} style={primaryBtn}>
          Slå på påminnelser
        </button>
      </>
    )
  } else {
    content = (
      <>
        <span style={{ flex: 1, minWidth: '10rem', fontWeight: 600 }}>🔔 Påminnelser är på</span>
        <button
          disabled={busy}
          onClick={() => run(sendTestPush, (r) => (r?.delivered ? '✓ Testnotis skickad.' : '⚠ Ingen enhet tog emot testnotisen.'))}
          style={secondaryBtn}
        >
          Skicka testnotis
        </button>
        <button disabled={busy} onClick={() => run(disablePush, 'Påminnelser avstängda på den här enheten.')} style={linkBtn}>
          Stäng av
        </button>
      </>
    )
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>{content}</div>
      {message && <div style={{ fontSize: '0.85rem', marginTop: '0.4rem', color: theme.colors.text }}>{message}</div>}
    </div>
  )
}

const box = {
  background: theme.colors.surfaceGreen,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.md,
  padding: '0.7rem 0.85rem',
  fontSize: '0.9rem',
  color: theme.colors.text,
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
  padding: '0.4rem 0.8rem',
  fontSize: '0.85rem',
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
