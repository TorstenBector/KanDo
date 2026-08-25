import { useState } from 'react'
import QuickCapture from './components/QuickCapture'
import DagensFokus from './components/DagensFokus'
import BacklogView from './components/BacklogView'
import KanbanBoard from './components/KanbanBoard'
import { theme } from './theme'

const TABS = [
  { id: 'fokus', label: 'Dagens Fokus' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'kanban', label: 'Kanban' },
]

export default function KandoApp() {
  const [tab, setTab] = useState('fokus')

  return (
    <div style={{ minHeight: '100vh', background: theme.colors.bg }}>
      <header
        style={{
          background: theme.colors.primary,
          color: theme.colors.textOnPrimary,
          padding: '0.75rem 1rem',
        }}
      >
        <strong style={{ fontSize: '1.1rem' }}>KanDo</strong>
      </header>

      <nav
        style={{
          display: 'flex',
          borderBottom: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: '0.65rem',
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
        {tab === 'kanban' && <KanbanBoard />}
      </main>

      <QuickCapture />
    </div>
  )
}
