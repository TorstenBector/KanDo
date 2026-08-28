import { useEffect, useState } from 'react'
import QuickCapture from './components/QuickCapture'
import DagensFokus from './components/DagensFokus'
import BacklogView from './components/BacklogView'
import PrioListView from './components/PrioListView'
import KanbanBoard from './components/KanbanBoard'
import UtfordaView from './components/UtfordaView'
import AccountPanel from './components/AccountPanel'
import TabMenu from './components/TabMenu'
import RegistrationScreen from './components/RegistrationScreen'
import { useSyncStore } from './store/syncStore'
import { useProfile } from './hooks/useProfile'
import { reactivateDueRecurringItems, migrateLegacyItemStatus } from './hooks/useItems'
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
  const setPassword = useSyncStore((s) => s.setPassword)
  const { profile, loading: profileLoading, saveProfile } = useProfile(session)

  useEffect(() => {
    // Local data repairs run before the first sync attempt, so a stale
    // record doesn't get pushed and rejected before it's been fixed.
    async function boot() {
      await migrateLegacyItemStatus()
      await reactivateDueRecurringItems()
      initSync()
    }
    boot()
  }, [initSync])

  // First-time users (logged in, no profile row yet) see the registration
  // screen instead of the app. Local-first use with no login is unaffected —
  // this only gates the moment right after a first successful magic-link login.
  if (session && !profileLoading && profile === null) {
    return <RegistrationScreen email={session.user.email} onSave={saveProfile} onSetPassword={setPassword} />
  }

  const currentTabLabel = TABS.find((t) => t.id === tab)?.label ?? ''

  return (
    <div style={{ minHeight: '100vh', background: theme.colors.bg }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 150,
          background: theme.colors.primary,
          color: theme.colors.textOnPrimary,
          boxShadow: theme.shadow.md,
        }}
      >
        <div
          style={{
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <strong style={{ fontSize: '1.1rem' }}>KanDo</strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AccountPanel />
            <TabMenu tabs={TABS} tab={tab} setTab={setTab} />
          </div>
        </div>
        <div
          style={{
            padding: '0 1rem 0.7rem',
            fontSize: '1.3rem',
            fontWeight: 700,
            color: theme.colors.textOnPrimary,
          }}
        >
          {currentTabLabel}
        </div>
      </header>

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
