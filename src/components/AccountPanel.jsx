import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useSyncStore, countUnsyncedChanges } from '../store/syncStore'
import SetPasswordModal from './SetPasswordModal'
import AuthForm from './AuthForm'
import { theme } from '../theme'

// open/onOpenChange are optional — lets SyncNudgeBanner's "Logga in"-knapp
// öppna den här panelen utan att duplicera inloggningsformuläret. Utan dem
// beter sig komponenten precis som förut, med egen intern state.
export default function AccountPanel({ open: controlledOpen, onOpenChange } = {}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

  const session = useSyncStore((s) => s.session)
  const syncing = useSyncStore((s) => s.syncing)
  const syncError = useSyncStore((s) => s.syncError)
  // Länken från "Glömt lösenord" loggar in och ska direkt låta en välja
  // nytt lösenord.
  const passwordRecovery = useSyncStore((s) => s.passwordRecovery)
  const clearPasswordRecovery = useSyncStore((s) => s.clearPasswordRecovery)
  const signOut = useSyncStore((s) => s.signOut)
  const sync = useSyncStore((s) => s.sync)

  const pendingCount = useLiveQuery(
    () => db.items.filter((i) => i._syncStatus === 'pending').count(),
    []
  )
  const [updating, setUpdating] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  // Utloggning rensar enhetens lokala data. Försök synka först; finns det
  // ändå osynkade ändringar kvar (offline, synkfel) måste användaren
  // aktivt bekräfta att de försvinner.
  async function handleSignOut() {
    setSigningOut(true)
    try {
      await sync()
      const unsynced = await countUnsyncedChanges()
      const message = unsynced > 0
        ? `⚠ ${unsynced} ${unsynced === 1 ? 'ändring är' : 'ändringar är'} inte synkade och försvinner permanent om du loggar ut.

Logga ut ändå?`
        : 'Logga ut? KanDo-korten tas bort från den här enheten (de finns kvar i ditt konto).'
      if (!window.confirm(message)) return
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  // A stale PWA build (old service worker + cached assets) is a different
  // failure mode than a sync error — this app can genuinely look out of
  // date on one device with no error shown anywhere. This is the "nuclear"
  // fix: drop every service worker + cache this origin has and hard-reload,
  // guaranteeing the next load fetches the current deployed build. Doesn't
  // touch IndexedDB — no local data is affected.
  //
  // Avslutas med en ny navigering till en unik URL istället för
  // location.reload(): en installerad iOS-PWA kan annars svara från sin
  // HTTP-cache med samma gamla index.html. Närmaste vi kommer "stäng och
  // öppna appen igen" inifrån appen — all JS-state (t.ex. en synk som
  // fastnat) börjar om från noll. ?omstart tas bort igen i main.jsx.
  async function forceUpdate() {
    setUpdating(true)
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((r) => r.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } finally {
      const url = new URL(window.location.href)
      url.searchParams.set('omstart', Date.now().toString())
      window.location.replace(url.toString())
    }
  }


  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={
          session
            ? {
                background: 'transparent',
                border: 'none',
                color: theme.colors.textOnPrimary,
                cursor: 'pointer',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }
            : {
                // Utloggat läge syns lätt bort som vanlig text i headern —
                // det här är läget där INGET synkar alls, så det ska sticka
                // ut, inte smälta in bredvid "✓ Synkad".
                background: theme.colors.warning,
                border: 'none',
                color: theme.colors.primaryDark,
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                borderRadius: '999px',
                padding: '0.25rem 0.6rem',
              }
        }
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
          '⚠ Ej inloggad'
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
          <button
            onClick={() => setOpen(false)}
            title="Stäng"
            aria-label="Stäng"
            style={{
              position: 'absolute',
              top: '0.4rem',
              right: '0.5rem',
              border: 'none',
              background: 'transparent',
              color: theme.colors.textMuted,
              fontSize: '1.1rem',
              lineHeight: 1,
              cursor: 'pointer',
              padding: '0.2rem',
            }}
          >
            ✕
          </button>
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
                <button onClick={handleSignOut} style={secondaryBtn} disabled={signingOut || syncing}>
                  {signingOut ? 'Loggar ut…' : 'Logga ut'}
                </button>
              </div>

              <button onClick={() => setPasswordModalOpen(true)} style={miniLinkBtn}>
                + Sätt lösenord (slipp mejla länk nästa gång)
              </button>
            </>
          ) : (
            <>
              <p style={{ color: theme.colors.text, fontSize: '0.85rem', margin: '0 1.2rem 0.6rem 0' }}>
                Logga in för att synka mellan enheter.
              </p>
              <AuthForm compact />
            </>
          )}

          <div style={{ borderTop: `1px solid ${theme.colors.border}`, marginTop: '0.75rem', paddingTop: '0.6rem' }}>
            <button onClick={forceUpdate} disabled={updating} style={{ ...miniLinkBtn, color: theme.colors.textMuted }}>
              {updating ? '🔄 Startar om…' : '🔄 Ser gammalt ut? Uppdatera & starta om'}
            </button>
          </div>
        </div>
      )}

      <SetPasswordModal
        open={passwordModalOpen || passwordRecovery}
        onClose={() => {
          setPasswordModalOpen(false)
          clearPasswordRecovery()
        }}
      />
    </div>
  )
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

const miniLinkBtn = {
  background: 'transparent',
  border: 'none',
  color: theme.colors.primary,
  cursor: 'pointer',
  fontSize: '0.75rem',
  padding: 0,
  textAlign: 'left',
}
