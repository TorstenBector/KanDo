import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useSyncStore } from '../store/syncStore'
import { theme } from '../theme'

export default function AccountPanel() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const session = useSyncStore((s) => s.session)
  const syncing = useSyncStore((s) => s.syncing)
  const authMessage = useSyncStore((s) => s.authMessage)
  const sendMagicLink = useSyncStore((s) => s.sendMagicLink)
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
            {syncing ? '⟳ Synkar…' : pendingCount > 0 ? `● ${pendingCount} osynkat` : '✓ Synkad'}
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
            width: '260px',
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
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => sync()} style={secondaryBtn} disabled={syncing}>
                  {syncing ? 'Synkar…' : 'Synka nu'}
                </button>
                <button onClick={() => signOut()} style={secondaryBtn}>Logga ut</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: theme.colors.text, fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                Logga in för att synka mellan enheter.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="din@epost.se"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.4rem 0.5rem',
                  borderRadius: theme.radius.sm,
                  border: `1px solid ${theme.colors.border}`,
                  marginBottom: '0.5rem',
                }}
              />
              <button onClick={handleSend} style={primaryBtn}>Skicka inloggningslänk</button>
              {authMessage && (
                <p style={{ color: theme.colors.textMuted, fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  {authMessage}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
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
