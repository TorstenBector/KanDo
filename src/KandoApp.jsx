import { useEffect, useState } from 'react'
import QuickCapture from './components/QuickCapture'
import DagensFokus from './components/DagensFokus'
import BacklogView from './components/BacklogView'
import PrioListView from './components/PrioListView'
import KanbanBoard from './components/KanbanBoard'
import UtfordaView from './components/UtfordaView'
import AccountPanel from './components/AccountPanel'
import RegistrationScreen from './components/RegistrationScreen'
import { useSyncStore } from './store/syncStore'
import { useProfile } from './hooks/useProfile'
import { reactivateDueRecurringItems } from './hooks/useItems'
import { theme } from './theme'

const TABS = [
  { id: 'fokus', label: 'Dagens Fokus' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'prio', label: 'Prio' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'utforda', label: 'Utförda' },
]

export default function KandoApp() {
  const [tab, setTab] = useState('fokus')
  const initSync = useSyncStore((s) => s.init)
  const session = useSyncStore((s) => s.session)
  const { profile, loading: profileLoading, saveProfile } = useProfile(session)

  useEffect(() => {
    initSync()
    reactivateDueRecurringItems()
  }, [initSync])

  // First-time users (logged in, no profile row yet) see the registration
  // screen instead of the app. Local-first use with no login is unaffected —
  // this only gates the moment right after a first successful magic-link login.
  if (session && !profileLoading && profile === null) {
    return <RegistrationScreen email={session.user.email} onSave={saveProfile} />
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.colors.bg }}>
      <header
        style={{
          background: theme.colors.primary,
          color: theme.colors.textOnPrimary,
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <strong style={{ fontSize: '1.1rem' }}>KanDo</strong>
        <AccountPanel />
      </header>

      <nav
        style={{
          display: 'flex',
          overflowX: 'auto',
          borderBottom: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: '0 0 auto',
              whiteSpace: 'nowrap',
              padding: '0.65rem 0.9rem',
              border: 'none',
              background: 'transparent',
              borderBottom: tab === t.id ? `3px solid ${theme.colors.primary}` : '3px solid transparent',
              color: tab === t.id ? theme.colors.text : theme.colors.textMuted,
              fontWeight: tab === t.id ? 600 : 400,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main style={{ paddingBottom: '5rem' }}>
        {tab === 'fokus' && <DagensFokus />}
        {tab === 'backlog' && <BacklogView />}
        {tab === 'prio' && <PrioListView />}
        {tab === 'kanban' && <KanbanBoard />}
        {tab === 'utforda' && <UtfordaView />}
      </main>

      <QuickCapture />
    </div>
  )
}
