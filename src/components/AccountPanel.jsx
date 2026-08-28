import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useSyncStore } from '../store/syncStore'
import SetPasswordModal from './SetPasswordModal'
import { theme } from '../theme'

export default function AccountPanel() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('magiclink') // 'magiclink' | 'password'
  const [email, setEmail] = useState('')
  const [password, setPasswordInput] = useState('')
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

  const session = useSyncStore((s) => s.session)
  const syncing = useSyncStore((s) => s.syncing)
  const syncError = useSyncStore((s) => s.syncError)
  const authMessage = useSyncStore((s) => s.authMessage)
  const sendMagicLink = useSyncStore((s) => s.sendMagicLink)
  const signInWithPassword = useSyncStore((s) => s.signInWithPassword)
  const signOut = useSyncStore((s) => s.signOut)
  const sync = useSyncStore((s) => s.sync)

  const pendingCount = useLiveQuery(
    () => db.items.filter((i) => i._syncStatus === 'pending').count(),
    []
  )

  async function handleSend() {
    if (!email.trim()) return
    await sendMagicLink(email.trim())
  }

  async function handlePasswordLogin() {
    if (!email.trim() || !password) return
    await signInWithPassword(email.trim(), password)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'transparent',
          border: 'none',
          color: theme.colors.textOnPrimary,
          cursor: 'pointer',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
        }}
      >
        {session ? (
          <>
            {syncing
              ? '⟳ Synkar…'
              : syncError
                ? '⚠ Synkfel'
                : pendingCount > 0
                  ? `● ${pendingCount} osynkat`
                  : '✓ Synkad'}
          </>
        ) : (
          '⚠ Logga in'
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '2rem',
            right: 0,
            background: theme.colors.bg,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            boxShadow: theme.shadow.md,
            padding: '1rem',
            width: '280px',
            zIndex: 200,
          }}
        >
          {session ? (
            <>
              <p style={{ color: theme.colors.text, fontSize: '0.85rem', margin: '0 0 0.5rem', wordBreak: 'break-all' }}>
                Inloggad som<br /><strong>{session.user.email}</strong>
              </p>
              <p style={{ color: theme.colors.textMuted, fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
                {pendingCount > 0 ? `${pendingCount} ändringar väntar på synk.` : 'Allt synkat.'}
              </p>
              {syncError && (
                <p style={{ color: theme.colors.danger, fontSize: '0.75rem', margin: '0 0 0.75rem' }}>
                  ⚠ {syncError}
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <button onClick={() => sync()} style={secondaryBtn} disabled={syncing}>
                  {syncing ? 'Synkar…' : 'Synka nu'}
                </button>
                <button onClick={() => signOut()} style={secondaryBtn}>Logga ut</button>
              </div>

              <button onClick={() => setPasswordModalOpen(true)} style={miniLinkBtn}>
                + Sätt lösenord (slipp mejla länk nästa gång)
              </button>
            </>
          ) : (
            <>
              <p style={{ color: theme.colors.text, fontSize: '0.85rem', margin: '0 0 0.6rem' }}>
                Logga in för att synka mellan enheter.
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <button
                  onClick={() => setMode('magiclink')}
                  style={mode === 'magiclink' ? tabBtnActive : tabBtn}
                >
                  Magisk länk
                </button>
                <button
                  onClick={() => setMode('password')}
                  style={mode === 'password' ? tabBtnActive : tabBtn}
                >
                  Lösenord
                </button>
              </div>

              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="din@epost.se"
                style={{ ...inputStyle, marginBottom: '0.5rem' }}
              />

              {mode === 'magiclink' ? (
                <button onClick={handleSend} style={primaryBtn}>Skicka inloggningslänk</button>
              ) : (
                <>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Lösenord"
                    style={{ ...inputStyle, marginBottom: '0.5rem' }}
                  />
                  <button onClick={handlePasswordLogin} style={primaryBtn}>Logga in</button>
                  <p style={{ color: theme.colors.textMuted, fontSize: '0.7rem', marginTop: '0.4rem' }}>
                    Kräver att du satt ett lösenord tidigare (via Magisk länk → Sätt lösenord).
                  </p>
                </>
              )}

              {authMessage && (
                <p style={{ color: theme.colors.textMuted, fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  {authMessage}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <SetPasswordModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} />
    </div>
  )
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.4rem 0.5rem',
  borderRadius: theme.radius.sm,
  border: `1px solid ${theme.colors.border}`,
}

const primaryBtn = {
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  border: 'none',
  borderRadius: theme.radius.sm,
  padding: '0.4rem 0.8rem',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.8rem',
  width: '100%',
}

const secondaryBtn = {
  background: 'transparent',
  color: theme.colors.text,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  padding: '0.35rem 0.6rem',
  cursor: 'pointer',
  fontSize: '0.75rem',
  flex: 1,
}

const tabBtn = {
  flex: 1,
  background: 'transparent',
  color: theme.colors.textMuted,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  padding: '0.3rem 0.4rem',
  cursor: 'pointer',
  fontSize: '0.75rem',
}

const tabBtnActive = {
  ...tabBtn,
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  border: `1px solid ${theme.colors.primary}`,
  fontWeight: 600,
}

const miniLinkBtn = {
  background: 'transparent',
  border: 'none',
  color: theme.colors.primary,
  cursor: 'pointer',
  fontSize: '0.75rem',
  padding: 0,
  textAlign: 'left',
}
