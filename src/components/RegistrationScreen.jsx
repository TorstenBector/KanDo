import { useState } from 'react'
import { theme } from '../theme'

export default function RegistrationScreen({ email, onSave, onSetPassword }) {
  const [alias, setAlias] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!alias.trim()) {
      setError('Alias krävs.')
      return
    }
    if (password && password.length < 6) {
      setError('Lösenordet måste vara minst 6 tecken (eller lämna tomt).')
      return
    }
    setSaving(true)
    setError(null)
    const { error: saveError } = await onSave({ alias: alias.trim(), phone: phone.trim() })
    if (saveError) {
      setSaving(false)
      setError(saveError.message)
      return
    }
    if (password) {
      const { error: pwError } = await onSetPassword(password)
      if (pwError) {
        setSaving(false)
        setError(`Profil sparad, men lösenordet gick inte att sätta: ${pwError.message}`)
        return
      }
    }
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.colors.bg, display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          background: theme.colors.primary,
          color: theme.colors.textOnPrimary,
          padding: '0.75rem 1rem',
        }}
      >
        <strong style={{ fontSize: '1.1rem' }}>KanDo</strong>
      </header>

      <main style={{ maxWidth: '420px', margin: '0 auto', padding: '2.5rem 1.25rem', width: '100%', boxSizing: 'border-box' }}>
        <h1 style={{ color: theme.colors.text, fontSize: '1.4rem', margin: '0 0 0.5rem' }}>Välkommen!</h1>
        <p style={{ color: theme.colors.textMuted, fontSize: '0.95rem', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
          Först behöver du bara ett alias — så vet vi vad vi ska kalla dig. Mobilnummer är valfritt
          just nu, men gör det möjligt att skicka inloggningslänkar via SMS längre fram.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.85rem', color: theme.colors.text, fontWeight: 500 }}>Alias</span>
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="t.ex. Torsten"
              autoFocus
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.85rem', color: theme.colors.text, fontWeight: 500 }}>
              Mobilnummer <span style={{ color: theme.colors.textMuted, fontWeight: 400 }}>(valfritt)</span>
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07X-XXX XX XX"
              type="tel"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.85rem', color: theme.colors.text, fontWeight: 500 }}>
              Lösenord <span style={{ color: theme.colors.textMuted, fontWeight: 400 }}>(valfritt — slipp mejla länk nästa gång)</span>
            </span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minst 6 tecken"
              type="password"
              autoComplete="new-password"
              style={inputStyle}
            />
          </label>

          <p style={{ color: theme.colors.textMuted, fontSize: '0.8rem', margin: 0 }}>
            E-post: <strong>{email}</strong>
          </p>

          {error && <p style={{ color: theme.colors.danger, fontSize: '0.85rem', margin: 0 }}>{error}</p>}

          <button
            type="submit"
            disabled={saving}
            style={{
              background: theme.colors.primary,
              color: theme.colors.textOnPrimary,
              border: 'none',
              borderRadius: theme.radius.md,
              padding: '0.75rem',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              boxShadow: theme.shadow.sm,
            }}
          >
            {saving ? 'Sparar…' : 'Kom igång'}
          </button>
        </form>
      </main>
    </div>
  )
}

const inputStyle = {
  padding: '0.6rem 0.7rem',
  borderRadius: theme.radius.sm,
  border: `1px solid ${theme.colors.border}`,
  fontSize: '0.95rem',
  boxSizing: 'border-box',
}
