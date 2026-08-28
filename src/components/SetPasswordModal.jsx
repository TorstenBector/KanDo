import { useState } from 'react'
import { useSyncStore } from '../store/syncStore'
import { theme } from '../theme'

export default function SetPasswordModal({ open, onClose }) {
  const setPassword = useSyncStore((s) => s.setPassword)
  const [password, setPasswordInput] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  function reset() {
    setPasswordInput('')
    setConfirm('')
    setError(null)
    setSaving(false)
    setDone(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSave() {
    if (password.length < 6) {
      setError('Minst 6 tecken.')
      return
    }
    if (password !== confirm) {
      setError('Lösenorden matchar inte.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: saveError } = await setPassword(password)
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setDone(true)
  }

  if (!open) return null

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,58,26,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.bg,
          borderRadius: theme.radius.lg,
          padding: '1.25rem',
          width: '100%',
          maxWidth: '360px',
          boxShadow: theme.shadow.md,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontWeight: 600, color: theme.colors.text, marginBottom: '0.25rem', fontSize: '1.05rem' }}>
          Sätt lösenord
        </div>

        {done ? (
          <>
            <p style={{ color: theme.colors.textMuted, fontSize: '0.9rem', margin: '0.75rem 0 1rem' }}>
              Klart! Du kan nu logga in med lösenord istället för magisk länk.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleClose} style={primaryBtn}>Stäng</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: theme.colors.textMuted, fontSize: '0.85rem', margin: '0.25rem 0 1rem' }}>
              Så slipper du mejla efter en inloggningslänk nästa gång.
            </p>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: theme.colors.text, fontWeight: 500 }}>Nytt lösenord</span>
              <input
                type="password"
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Minst 6 tecken"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: theme.colors.text, fontWeight: 500 }}>Upprepa lösenord</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="Samma igen"
                style={inputStyle}
              />
            </label>

            {error && <p style={{ color: theme.colors.danger, fontSize: '0.8rem', margin: '0 0 0.75rem' }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button onClick={handleClose} style={secondaryBtn}>Avbryt</button>
              <button onClick={handleSave} disabled={saving} style={primaryBtn}>
                {saving ? 'Sparar…' : 'Spara'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  padding: '0.5rem 0.6rem',
  borderRadius: theme.radius.sm,
  border: `1px solid ${theme.colors.border}`,
  fontSize: '0.9rem',
  boxSizing: 'border-box',
}

const primaryBtn = {
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  border: 'none',
  borderRadius: theme.radius.sm,
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  fontWeight: 600,
}

const secondaryBtn = {
  background: 'transparent',
  color: theme.colors.textMuted,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  padding: '0.5rem 1rem',
  cursor: 'pointer',
}
