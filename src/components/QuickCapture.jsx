import { useState } from 'react'
import { createItem } from '../hooks/useItems'
import { theme } from '../theme'

function deriveTitle(text) {
  const firstLine = text.trim().split('\n')[0]
  return firstLine.length > 80 ? firstLine.slice(0, 77) + '…' : firstLine
}

export default function QuickCapture() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    await createItem({ type: 'idea', title: deriveTitle(trimmed), original_text: trimmed })
    setSaving(false)
    setText('')
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Snabbfånga"
        style={{
          position: 'fixed',
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          right: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
          width: '3.5rem',
          height: '3.5rem',
          borderRadius: '50%',
          background: theme.colors.primary,
          color: theme.colors.textOnPrimary,
          border: 'none',
          boxShadow: theme.shadow.md,
          fontSize: '1.75rem',
          lineHeight: 1,
          cursor: 'pointer',
          zIndex: 250,
        }}
      >
        +
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26,58,26,0.45)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme.colors.bg,
              borderRadius: `${theme.radius.lg} ${theme.radius.lg} 0 0`,
              padding: '1rem',
              width: '100%',
              maxWidth: '480px',
              boxShadow: theme.shadow.md,
            }}
          >
            <div style={{ fontWeight: 600, color: theme.colors.text, marginBottom: '0.5rem' }}>
              Snabbfånga
            </div>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
              }}
              placeholder="Tala (mikrofonen i tangentbordet), skriv, eller klistra in…"
              rows={5}
              style={{
                width: '100%',
                borderRadius: theme.radius.sm,
                border: `1px solid ${theme.colors.border}`,
                padding: '0.6rem',
                fontFamily: 'inherit',
                fontSize: '1rem',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button onClick={() => setOpen(false)} style={secondaryBtn}>Avbryt</button>
              <button onClick={handleSave} disabled={saving || !text.trim()} style={primaryBtn}>
                {saving ? 'Sparar…' : 'Spara'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
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
