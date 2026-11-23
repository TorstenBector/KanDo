import { useState } from 'react'
import { useSyncStore } from '../store/syncStore'
import { theme } from '../theme'

// Inloggning/konto: Logga in (lösenord) · Skapa konto · Länk via mejl ·
// Glömt lösenord. Lösenordsvägarna kräver inget mejl alls, så de fungerar
// även när mejlet öppnas i fel webbläsare eller mejlgränsen är nådd.
// Används i kontopanelen och i inbjudningsrutan.
export default function AuthForm({ initialMode = 'login', compact = false }) {
  const [mode, setMode] = useState(initialMode) // login | signup | magiclink | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState(null)
  const [busy, setBusy] = useState(false)

  const authMessage = useSyncStore((s) => s.authMessage)
  const signInWithPassword = useSyncStore((s) => s.signInWithPassword)
  const signUpWithPassword = useSyncStore((s) => s.signUpWithPassword)
  const sendMagicLink = useSyncStore((s) => s.sendMagicLink)
  const resetPassword = useSyncStore((s) => s.resetPassword)

  function switchMode(next) {
    setMode(next)
    setLocalError(null)
    useSyncStore.setState({ authMessage: null })
  }

  async function submit(e) {
    e?.preventDefault()
    const cleanEmail = email.trim()
    if (!cleanEmail) return setLocalError('Fyll i din e-post.')
    setLocalError(null)
    if (mode === 'signup') {
      if (password.length < 6) return setLocalError('Lösenordet måste vara minst 6 tecken.')
      if (password !== confirm) return setLocalError('Lösenorden matchar inte.')
    }
    if (mode === 'login' && !password) return setLocalError('Fyll i ditt lösenord.')
    setBusy(true)
    try {
      if (mode === 'login') await signInWithPassword(cleanEmail, password)
      else if (mode === 'signup') {
        const res = await signUpWithPassword(cleanEmail, password)
        if (res.exists) setMode('login')
      } else if (mode === 'magiclink') await sendMagicLink(cleanEmail)
      else if (mode === 'reset') await resetPassword(cleanEmail)
    } finally {
      setBusy(false)
    }
  }

  const tabs = [
    ['login', 'Logga in'],
    ['signup', 'Skapa konto'],
    ['magiclink', 'Länk via mejl'],
  ]
  const label = { login: 'Logga in', signup: 'Skapa konto', magiclink: 'Skicka inloggningslänk', reset: 'Skicka återställningslänk' }[mode]

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {mode !== 'reset' && (
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {tabs.map(([m, text]) => (
            <button key={m} type="button" onClick={() => switchMode(m)} style={mode === m ? tabActive : tab}>
              {text}
            </button>
          ))}
        </div>
      )}

      {mode === 'reset' && (
        <p style={hint}>Fyll i din e-post så skickar vi en länk där du väljer ett nytt lösenord.</p>
      )}
      {mode === 'signup' && (
        <p style={hint}>Välj e-post och lösenord — du blir inloggad direkt, inget mejl behövs.</p>
      )}
      {mode === 'magiclink' && (
        <p style={hint}>Öppna länken i mejlet på den här enheten. Enklare: skapa konto eller logga in med lösenord.</p>
      )}

      <input
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="din@epost.se"
        style={input(compact)}
      />

      {(mode === 'login' || mode === 'signup') && (
        <input
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'signup' ? 'Välj lösenord (minst 6 tecken)' : 'Lösenord'}
          style={input(compact)}
        />
      )}
      {mode === 'signup' && (
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Upprepa lösenordet"
          style={input(compact)}
        />
      )}

      <button type="submit" disabled={busy} style={{ ...primary(compact), opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Vänta…' : label}
      </button>

      {mode === 'login' && (
        <button type="button" onClick={() => switchMode('reset')} style={link}>Glömt lösenord?</button>
      )}
      {mode === 'reset' && (
        <button type="button" onClick={() => switchMode('login')} style={link}>← Tillbaka</button>
      )}

      {(localError || authMessage) && (
        <p style={{ ...hint, color: localError || authMessage?.startsWith('Fel') ? theme.colors.danger : theme.colors.text }}>
          {localError || authMessage}
        </p>
      )}
    </form>
  )
}

const hint = { margin: 0, fontSize: '0.75rem', color: theme.colors.textMuted, lineHeight: 1.4 }

const input = (compact) => ({
  width: '100%',
  boxSizing: 'border-box',
  padding: compact ? '0.45rem 0.55rem' : '0.6rem 0.7rem',
  borderRadius: theme.radius.sm,
  border: `1px solid ${theme.colors.border}`,
  // 16px förhindrar att iOS zoomar in när fältet får fokus.
  fontSize: '16px',
  background: '#fff',
  color: theme.colors.text,
})

const primary = (compact) => ({
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  border: 'none',
  borderRadius: theme.radius.sm,
  padding: compact ? '0.5rem 0.8rem' : '0.65rem 1rem',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: compact ? '0.85rem' : '0.95rem',
  width: '100%',
})

const tab = {
  flex: 1,
  background: 'transparent',
  color: theme.colors.textMuted,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  padding: '0.35rem 0.3rem',
  cursor: 'pointer',
  fontSize: '0.75rem',
}

const tabActive = {
  ...tab,
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  borderColor: theme.colors.primary,
  fontWeight: 700,
}

const link = {
  border: 'none',
  background: 'transparent',
  color: theme.colors.primary,
  fontSize: '0.75rem',
  cursor: 'pointer',
  padding: 0,
  alignSelf: 'flex-start',
  textDecoration: 'underline',
}
