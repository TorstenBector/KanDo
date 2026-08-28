import { useState } from 'react'
import { theme } from '../theme'

export default function TabMenu({ tabs, tab, setTab }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Meny"
        style={{
          background: 'transparent',
          border: 'none',
          color: theme.colors.textOnPrimary,
          cursor: 'pointer',
          fontSize: '1.3rem',
          lineHeight: 1,
          padding: '0.1rem 0.3rem',
        }}
      >
        ☰
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 190 }}
          />
          <div
            style={{
              position: 'absolute',
              top: '2rem',
              right: 0,
              background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              boxShadow: theme.shadow.md,
              padding: '0.4rem',
              width: '200px',
              zIndex: 200,
            }}
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id)
                  setOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.55rem 0.7rem',
                  border: 'none',
                  borderRadius: theme.radius.sm,
                  background: tab === t.id ? theme.colors.surfaceGreen : 'transparent',
                  color: theme.colors.text,
                  fontWeight: tab === t.id ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
