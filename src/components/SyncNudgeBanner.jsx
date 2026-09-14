import { useState } from 'react'
import { useSyncStore } from '../store/syncStore'
import { theme } from '../theme'

// Being logged out is a legitimate, fully-supported state (offline-first —
// see spec.md) as long as the user knows it. Left silent, it's the exact
// state that caused the 2026-09-14 incident: a device sat logged out for
// a long time, kept working locally the whole time (by design), and no one
// noticed until Dagens Fokus looked wrong on a different device. The corner
// "⚠ Ej inloggad" badge already got louder, but it's still opt-in to notice —
// this banner surfaces the same fact somewhere it can't be missed, and only
// while it's actually actionable (online — no point nagging with no network
// to log in over).
export default function SyncNudgeBanner({ onOpenAccount }) {
  const session = useSyncStore((s) => s.session)
  const isOnline = useSyncStore((s) => s.isOnline)
  const [dismissed, setDismissed] = useState(false)

  if (session || !isOnline || dismissed) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        background: theme.colors.warning,
        color: theme.colors.primaryDark,
        padding: '0.5rem 1rem',
        fontSize: '0.8rem',
      }}
    >
      <span style={{ flex: 1 }}>
        <strong>Inte inloggad</strong> — ändringar sparas bara på den här enheten, inget synkas till dina andra enheter.
      </span>
      <button
        onClick={onOpenAccount}
        style={{
          background: theme.colors.primaryDark,
          color: theme.colors.textOnPrimary,
          border: 'none',
          borderRadius: theme.radius.sm,
          padding: '0.3rem 0.7rem',
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Logga in
      </button>
      <button
        onClick={() => setDismissed(true)}
        title="Dölj (visas igen nästa gång appen öppnas)"
        aria-label="Dölj"
        style={{
          background: 'transparent',
          border: 'none',
          color: theme.colors.primaryDark,
          fontSize: '1rem',
          lineHeight: 1,
          cursor: 'pointer',
          padding: '0.1rem 0.2rem',
        }}
      >
        ✕
      </button>
    </div>
  )
}
