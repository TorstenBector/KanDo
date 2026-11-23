import { useEffect, useState } from 'react'
import { acceptInvite, clearPendingInvite, getInvite } from '../lib/connections'
import { isIos, isStandalone } from '../lib/push'
import { useSyncStore } from '../store/syncStore'
import AuthForm from './AuthForm'
import { theme } from '../theme'

// Visas när någon öppnat en inbjudningslänk (?koppla=<kod>). Utloggad:
// uppmaning att logga in (koden sparas och modalen kommer tillbaka efteråt).
// Inloggad: "Koppla ihop".
export default function InviteAcceptModal({ token, onDone }) {
  const session = useSyncStore((s) => s.session)
  const [invite, setInvite] = useState(null)
  const [state, setState] = useState('idle') // idle | busy | done | error
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let alive = true
    getInvite(token).then(
      (inv) => { if (alive) setInvite(inv) },
      () => { if (alive) setInvite({ status: 'unknown' }) },
    )
    return () => { alive = false }
  }, [token])

  function close() {
    clearPendingInvite()
    onDone()
  }

  async function accept() {
    setState('busy')
    try {
      const res = await acceptInvite(token)
      clearPendingInvite()
      setMessage(`Du och ${res?.inviter_alias ?? 'den som bjöd in dig'} är nu kopplade i KanDo.`)
      setState('done')
    } catch (err) {
      setMessage(err.message)
      setState('error')
    }
  }

  const from = invite?.inviter_alias ?? 'Någon'
  let body
  if (!invite) {
    body = <p style={p}>Hämtar inbjudan…</p>
  } else if (state === 'done') {
    body = (
      <>
        <p style={{ ...p, fontWeight: 700 }}>🎉 {message}</p>
        {isIos() && !isStandalone() && (
          <p style={p}>
            Tips: lägg till KanDo på hemskärmen (Safari → <strong>Dela</strong> → <strong>Lägg till på hemskärmen</strong>) och slå på
            påminnelser under <strong>Plugg</strong>, så får du en notis inför varje pass.
          </p>
        )}
        <button onClick={onDone} style={primaryBtn}>Kom igång</button>
      </>
    )
  } else if (invite.status !== 'ok') {
    const text = {
      used: 'Den här inbjudan har redan använts.',
      expired: 'Inbjudan har gått ut. Be om en ny.',
      unknown: 'Inbjudan hittades inte. Kontrollera länken eller koden.',
    }[invite.status] ?? 'Inbjudan kan inte användas.'
    body = (
      <>
        <p style={p}>{text}</p>
        <button onClick={close} style={primaryBtn}>Stäng</button>
      </>
    )
  } else {
    body = (
      <>
        <p style={{ ...p, fontSize: '1.05rem' }}>
          <strong>{from}</strong> har bjudit in dig till KanDo.
        </p>
        <p style={p}>
          KanDo hjälper dig planera pluggandet: lägg upp pass inför prov, få en påminnelse innan och en timer när du kör. När ni är
          kopplade kan ni dela planer och utmana varandra.
        </p>
        {session ? (
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button disabled={state === 'busy'} onClick={accept} style={primaryBtn}>
              {state === 'busy' ? 'Kopplar…' : `Koppla ihop med ${from}`}
            </button>
            <button onClick={close} style={linkBtn}>Inte nu</button>
          </div>
        ) : (
          <>
            <p style={{ ...p, fontWeight: 600 }}>Steg 1: skapa ett konto (har du redan ett — välj Logga in).</p>
            <AuthForm initialMode="signup" />
            <button onClick={close} style={{ ...linkBtn, alignSelf: 'flex-start' }}>Inte nu</button>
          </>
        )}
        {state === 'error' && <p style={{ ...p, color: theme.colors.danger }}>⚠ {message}</p>}
      </>
    )
  }

  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={{ fontWeight: 800, fontSize: '1.2rem', color: theme.colors.primary }}>📬 Inbjudan till KanDo</div>
        {body}
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(26,58,26,0.45)',
  zIndex: 260,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: '3.5rem 1rem 1rem',
  overflowY: 'auto',
}

const panel = {
  background: theme.colors.bg,
  borderRadius: theme.radius.lg,
  boxShadow: theme.shadow.md,
  padding: '1.1rem 1.1rem 1.2rem',
  width: '100%',
  maxWidth: '440px',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.7rem',
}

const p = { margin: 0, color: theme.colors.text, fontSize: '0.95rem', lineHeight: 1.45 }

const primaryBtn = {
  border: 'none',
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  borderRadius: theme.radius.sm,
  padding: '0.6rem 1.1rem',
  fontSize: '0.95rem',
  fontWeight: 700,
  cursor: 'pointer',
  alignSelf: 'flex-start',
}

const linkBtn = {
  border: 'none',
  background: 'transparent',
  color: theme.colors.textMuted,
  fontSize: '0.85rem',
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0,
}
