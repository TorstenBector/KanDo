import { Component } from 'react'
import { theme } from '../theme'

// The app had zero error boundaries — any render-time throw (a bad item
// shape from sync, a hook edge case, whatever) unmounted the whole React
// tree silently. No error, no fallback, just a frozen/blank screen with
// every click dead — exactly the "skärmen låser sig" reports from Dagens
// Fokus/Backlog/Kanban card-opening. This won't fix whatever throws, but it
// turns a silent full-app freeze into a visible, reportable error instead
// of a dead end that only a hard reload escapes.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('KanDo crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: theme.colors.bg,
          color: theme.colors.text,
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          zIndex: 9999,
          overflowY: 'auto',
        }}
      >
        <strong style={{ fontSize: '1.1rem', color: theme.colors.danger }}>Något gick sönder</strong>
        <p style={{ fontSize: '0.9rem', color: theme.colors.textMuted }}>
          KanDo stötte på ett fel och kunde inte rita om skärmen. Dina data är säkra lokalt — det här är bara vyn som kraschade.
        </p>
        <pre
          style={{
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm,
            padding: '0.75rem',
            fontSize: '0.75rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {this.state.error.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{
            alignSelf: 'flex-start',
            background: theme.colors.primary,
            color: theme.colors.textOnPrimary,
            border: 'none',
            borderRadius: theme.radius.sm,
            padding: '0.6rem 1.2rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Ladda om
        </button>
      </div>
    )
  }
}
