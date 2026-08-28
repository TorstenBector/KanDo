import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import {
  updateItem, deleteItem, cloneItem, setRecurrence,
  addChildItem, removeChildRelation, markDoneWithConfirm,
} from '../hooks/useItems'
import { findOrCreateTag, useItemTags } from '../hooks/useTags'
import { useChildren, useParent } from '../hooks/useRelations'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const PRIORITY_OPTIONS = [
  { value: '', label: 'Ingen prio' },
  { value: 'hog', label: 'Hög' },
  { value: 'medel', label: 'Medel' },
  { value: 'lag', label: 'Låg' },
]
const RECURRENCE_PRESETS = [
  { value: '', label: '🔁 Ingen upprepning' },
  { value: '7', label: '🔁 Varje vecka' },
  { value: '14', label: '🔁 Var 14:e dag' },
  { value: 'custom', label: '🔁 Anpassat…' },
]

export default function ItemDetailModal({ itemId, onClose }) {
  const item = useLiveQuery(() => (itemId ? db.items.get(itemId) : undefined), [itemId])
  const tags = useItemTags(itemId)
  const children = useChildren(itemId)
  const parent = useParent(itemId)
  const [tagInput, setTagInput] = useState('')
  const [childInput, setChildInput] = useState('')
  const [customRecurrence, setCustomRecurrence] = useState(false)

  if (!itemId || !item) return null

  const recurrencePreset = [7, 14].includes(item.recurrence_days)
    ? String(item.recurrence_days)
    : (item.recurrence_days ? 'custom' : '')

  function handleRecurrenceChange(value) {
    if (value === 'custom') {
      setCustomRecurrence(true)
      return
    }
    setCustomRecurrence(false)
    setRecurrence(item.id, value ? Number(value) : null)
  }

  async function addTag(kind) {
    const name = tagInput.trim()
    if (!name) return
    const tag = await findOrCreateTag(name, kind)
    await db.item_tags.put({ item_id: item.id, tag_id: tag.id })
    setTagInput('')
  }

  async function removeTag(tagId) {
    await db.item_tags.where({ item_id: item.id, tag_id: tagId }).delete()
  }

  async function handleAddChild() {
    const title = childInput.trim()
    if (!title) return
    await addChildItem(item.id, title)
    setChildInput('')
  }

  async function handleDelete() {
    if (!window.confirm(`Ta bort "${item.title}" permanent?`)) return
    await deleteItem(item.id)
    onClose()
  }

  async function handleClone() {
    await cloneItem(item.id)
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,58,26,0.45)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 300,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.bg,
          borderRadius: `${theme.radius.lg} ${theme.radius.lg} 0 0`,
          padding: '1rem',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: theme.shadow.md,
          boxSizing: 'border-box',
        }}
      >
        {parent && (
          <div style={{ fontSize: '0.75rem', color: theme.colors.textMuted, marginBottom: '0.5rem' }}>
            ↳ Deluppgift till <strong>{parent.title}</strong>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <select
            value={item.type}
            onChange={(e) => updateItem(item.id, { type: e.target.value })}
            style={selectStyle}
          >
            <option value="idea">Idé</option>
            <option value="project">Projekt</option>
            <option value="task">Task</option>
          </select>
          <input
            value={item.title}
            onChange={(e) => updateItem(item.id, { title: e.target.value })}
            style={{ ...inputStyle, flex: 1, fontWeight: 600, fontSize: '1.05rem' }}
          />
        </div>

        <label style={labelStyle}>Beskrivning</label>
        <textarea
          value={item.description ?? ''}
          onChange={(e) => updateItem(item.id, { description: e.target.value })}
          placeholder="Lägg till detaljer, kontext, anteckningar…"
          rows={4}
          style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.75rem' }}
        />

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <label style={labelStyle}>Prioritet</label>
            <select
              value={item.backlog_priority ?? ''}
              onChange={(e) => updateItem(item.id, { backlog_priority: e.target.value || null })}
              style={selectStyle}
            >
              {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Schemalagt datum</label>
            <input
              type="date"
              value={item.scheduled_date ?? ''}
              onChange={(e) => updateItem(item.id, { scheduled_date: e.target.value || null })}
              style={selectStyle}
            />
          </div>
        </div>

        <label style={labelStyle}>Upprepning</label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <select
            value={recurrencePreset}
            onChange={(e) => handleRecurrenceChange(e.target.value)}
            style={selectStyle}
          >
            {RECURRENCE_PRESETS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {customRecurrence && (
            <input
              type="number"
              min="1"
              autoFocus
              placeholder="antal dagar"
              defaultValue={item.recurrence_days && ![7, 14].includes(item.recurrence_days) ? item.recurrence_days : ''}
              onBlur={(e) => {
                const days = Number(e.target.value)
                if (days > 0) setRecurrence(item.id, days)
                setCustomRecurrence(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
              style={{ ...inputStyle, width: '110px' }}
            />
          )}
        </div>

        <label style={labelStyle}>Taggar</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem', alignItems: 'center' }}>
          {(tags ?? []).map((tag) => (
            <span
              key={tag.id}
              onClick={() => removeTag(tag.id)}
              title="Klicka för att ta bort"
              style={{
                fontSize: '0.75rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
                background: tag.kind === 'category' ? theme.colors.surfaceGreen : theme.colors.accentSoft,
                color: theme.colors.text,
                cursor: 'pointer',
              }}
            >
              {tag.kind === 'context' ? '📍 ' : ''}{tag.name}
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag('category')}
            placeholder="+ tagg"
            style={{ ...inputStyle, width: '90px', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
          />
          {tagInput && (
            <>
              <button onClick={() => addTag('category')} style={miniLinkBtn}>som kategori</button>
              <button onClick={() => addTag('context')} style={miniLinkBtn}>som sammanhang</button>
            </>
          )}
        </div>

        <label style={labelStyle}>Deluppgifter</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
          {children.map((child) => {
            const done = child.status === 'klar'
            return (
              <div
                key={child.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.sm, padding: '0.4rem 0.6rem',
                }}
              >
                <button
                  onClick={() => markDoneWithConfirm(child.id)}
                  style={{
                    border: `1.5px solid ${theme.colors.success}`,
                    background: done ? theme.colors.success : theme.colors.bg,
                    borderRadius: '50%', width: '1.1rem', height: '1.1rem', flexShrink: 0,
                    cursor: 'pointer', padding: 0, color: done ? '#fff' : theme.colors.success, fontSize: '0.7rem',
                  }}
                >
                  ✓
                </button>
                <span style={{
                  flex: 1, fontSize: '0.9rem', color: done ? theme.colors.textMuted : theme.colors.text,
                  textDecoration: done ? 'line-through' : 'none',
                }}>
                  {child.title}
                </span>
                <button
                  onClick={() => removeChildRelation(item.id, child.id)}
                  title="Koppla bort (tar inte bort objektet)"
                  style={{ border: 'none', background: 'transparent', color: theme.colors.textMuted, cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  ✕
                </button>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              value={childInput}
              onChange={(e) => setChildInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddChild()}
              placeholder="+ ny deluppgift"
              style={{ ...inputStyle, flex: 1, fontSize: '0.85rem' }}
            />
            <button onClick={handleAddChild} style={secondaryBtn}>Lägg till</button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleClone} style={secondaryBtn}>Klona</button>
            <button onClick={handleDelete} style={{ ...secondaryBtn, color: theme.colors.danger, borderColor: theme.colors.danger }}>
              Ta bort
            </button>
          </div>
          <button onClick={onClose} style={primaryBtn}>Stäng</button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: '0.75rem',
  color: theme.colors.textMuted,
  fontWeight: 600,
  marginBottom: '0.25rem',
}

const inputStyle = {
  padding: '0.45rem 0.6rem',
  borderRadius: theme.radius.sm,
  border: `1px solid ${theme.colors.border}`,
  fontSize: '0.9rem',
  boxSizing: 'border-box',
}

const selectStyle = { ...inputStyle }

const primaryBtn = {
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  border: 'none',
  borderRadius: theme.radius.sm,
  padding: '0.5rem 1.1rem',
  cursor: 'pointer',
  fontWeight: 600,
}

const secondaryBtn = {
  background: 'transparent',
  color: theme.colors.text,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  padding: '0.4rem 0.8rem',
  cursor: 'pointer',
  fontSize: '0.85rem',
}

const miniLinkBtn = {
  fontSize: '0.7rem',
  border: 'none',
  background: 'transparent',
  color: theme.colors.primary,
  cursor: 'pointer',
  textDecoration: 'underline',
}
