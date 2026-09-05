import { useState } from 'react'
import { db } from '../lib/db'
import { createItem, scheduleToday, togglePrioritized, toggleShoppingList } from '../hooks/useItems'
import { findOrCreateTag } from '../hooks/useTags'
import { theme } from '../theme'

function deriveTitle(text) {
  const firstLine = text.trim().split('\n')[0]
  return firstLine.length > 80 ? firstLine.slice(0, 77) + '…' : firstLine
}

export default function QuickCapture() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [prioritized, setPrioritized] = useState(false)
  const [scheduledToday, setScheduledToday] = useState(false)
  const [shoppingList, setShoppingList] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tagKind, setTagKind] = useState('category')

  function reset() {
    setText('')
    setPrioritized(false)
    setScheduledToday(false)
    setShoppingList(false)
    setTagInput('')
    setTagKind('category')
    setOpen(false)
  }

  async function handleSave() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    const item = await createItem({ type: 'idea', title: deriveTitle(trimmed), original_text: trimmed })
    // New item always starts in Backlog — togglePrioritized flips it to
    // Prioriterad (with a correct priority_rank), same as the "+ Prioriterad"
    // pill elsewhere.
    if (prioritized) await togglePrioritized(item.id)
    if (scheduledToday) await scheduleToday(item.id)
    if (shoppingList) await toggleShoppingList(item.id)
    const tagName = tagInput.trim()
    if (tagName) {
      const tag = await findOrCreateTag(tagName, tagKind)
      await db.item_tags.put({ item_id: item.id, tag_id: tag.id })
    }
    setSaving(false)
    reset()
  }

  return (
    <>
      {/* Hidden while the panel is open — it sits at a higher z-index than
          the panel overlay (so it stays reachable from every other screen),
          which otherwise floats it right on top of the panel's own Spara
          button in the same bottom-right corner. */}
      {!open && (
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
      )}

      {open && (
        <div
          onClick={reset}
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

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.6rem' }}>
              <button onClick={() => setPrioritized((v) => !v)} style={prioritized ? pillActive : pill}>
                {prioritized ? '✓ Prioriterad' : '+ Prioriterad'}
              </button>
              <button onClick={() => setScheduledToday((v) => !v)} style={scheduledToday ? pillActive : pill}>
                {scheduledToday ? '✓ Dagens Fokus' : '+ Dagens Fokus'}
              </button>
              <button onClick={() => setShoppingList((v) => !v)} style={shoppingList ? pillActive : pill}>
                {shoppingList ? '✓ Inköpslista' : '+ Inköpslista'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', alignItems: 'center' }}>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="+ tagg (valfritt)"
                style={{
                  flex: 1,
                  fontSize: '0.85rem',
                  border: `1px dashed ${theme.colors.border}`,
                  borderRadius: '999px',
                  padding: '0.3rem 0.7rem',
                  background: 'transparent',
                  color: theme.colors.text,
                }}
              />
              {tagInput.trim() && (
                <button
                  onClick={() => setTagKind((k) => (k === 'category' ? 'context' : 'category'))}
                  title="Byt taggtyp"
                  style={{ ...pill, flexShrink: 0 }}
                >
                  {tagKind === 'context' ? '📍 Sammanhang' : '🏷 Kategori'}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button onClick={reset} style={secondaryBtn}>Avbryt</button>
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

const pill = {
  fontSize: '0.8rem',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '999px',
  padding: '0.3rem 0.7rem',
  background: 'transparent',
  color: theme.colors.textMuted,
  cursor: 'pointer',
}

const pillActive = {
  ...pill,
  border: `1px solid ${theme.colors.primary}`,
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
}
