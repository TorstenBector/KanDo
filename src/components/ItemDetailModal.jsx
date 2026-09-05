import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db } from '../lib/db'
import {
  updateItem, deleteItem, cloneItem, setRecurrence, setRecurrenceWeekdays,
  addChildItem, removeChildRelation, reorderChildren, markDoneWithConfirm,
  pauseItem, resumeItem, toggleShoppingList,
} from '../hooks/useItems'
import { useItemTags } from '../hooks/useTags'
import { useChildren, useParent } from '../hooks/useRelations'
import { useItemImages, addImage, removeImage } from '../hooks/useImages'
import TagInput from './TagInput'
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
  { value: 'weekdays', label: '🔁 Vissa veckodagar…' },
]
const WEEKDAYS = [
  { value: 1, label: 'Mån' },
  { value: 2, label: 'Tis' },
  { value: 3, label: 'Ons' },
  { value: 4, label: 'Tor' },
  { value: 5, label: 'Fre' },
  { value: 6, label: 'Lör' },
  { value: 7, label: 'Sön' },
]
const PAUSE_PRESETS = [
  { months: 1, label: '1 månad' },
  { months: 3, label: '3 månader' },
  { months: 4, label: '4 månader' },
  { months: 6, label: '6 månader' },
]

function addMonthsISO(months) {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export default function ItemDetailModal({ itemId, onClose }) {
  const item = useLiveQuery(() => (itemId ? db.items.get(itemId) : undefined), [itemId])
  const tags = useItemTags(itemId)
  const children = useChildren(itemId)
  const parent = useParent(itemId)
  const images = useItemImages(itemId)
  const [childInput, setChildInput] = useState('')
  const [customRecurrence, setCustomRecurrence] = useState(false)
  const [showWeekdays, setShowWeekdays] = useState(false)
  const [uploading, setUploading] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  async function handleImageSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again
    if (!file) return
    setUploading(true)
    try {
      await addImage(itemId, file)
    } finally {
      setUploading(false)
    }
  }

  if (!itemId || !item) return null

  async function handleChildDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = children.findIndex((c) => c.id === active.id)
    const newIndex = children.findIndex((c) => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(children, oldIndex, newIndex)
    await reorderChildren(item.id, reordered.map((c) => c.id))
  }

  const recurrencePreset = item.recurrence_weekdays?.length
    ? 'weekdays'
    : ([7, 14].includes(item.recurrence_days) ? String(item.recurrence_days) : (item.recurrence_days ? 'custom' : ''))

  function handleRecurrenceChange(value) {
    if (value === 'custom') {
      setCustomRecurrence(true)
      setShowWeekdays(false)
      return
    }
    if (value === 'weekdays') {
      setShowWeekdays(true)
      setCustomRecurrence(false)
      return
    }
    setCustomRecurrence(false)
    setShowWeekdays(false)
    setRecurrence(item.id, value ? Number(value) : null)
  }

  function toggleWeekday(day) {
    const current = item.recurrence_weekdays ?? []
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    setRecurrenceWeekdays(item.id, next)
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
          style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.5rem' }}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {images.map((img) => (
            <div key={img.id} style={{ position: 'relative' }}>
              <a href={img.data_url} target="_blank" rel="noreferrer">
                <img
                  src={img.data_url}
                  alt=""
                  style={{
                    width: '4.5rem', height: '4.5rem', objectFit: 'cover',
                    borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.border}`, display: 'block',
                  }}
                />
              </a>
              <button
                onClick={() => removeImage(img.id)}
                title="Ta bort bild"
                style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  width: '1.2rem', height: '1.2rem', borderRadius: '50%',
                  border: 'none', background: theme.colors.danger, color: '#fff',
                  fontSize: '0.7rem', cursor: 'pointer', lineHeight: 1, padding: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <label
            style={{
              width: '4.5rem', height: '4.5rem', borderRadius: theme.radius.sm,
              border: `1px dashed ${theme.colors.border}`, display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              color: theme.colors.textMuted, fontSize: '0.7rem', textAlign: 'center',
            }}
          >
            {uploading ? '…' : '📷 +'}
            <input type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>

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
          <div>
            <label style={labelStyle}>Inköpslista</label>
            <button
              onClick={() => toggleShoppingList(item.id)}
              style={item.in_shopping_list ? { ...secondaryBtn, background: theme.colors.primary, color: theme.colors.textOnPrimary, borderColor: theme.colors.primary } : secondaryBtn}
            >
              {item.in_shopping_list ? '✓ I inköpslistan' : '+ Inköpslista'}
            </button>
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
          {(showWeekdays || recurrencePreset === 'weekdays') && (
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', width: '100%' }}>
              {WEEKDAYS.map((w) => {
                const active = (item.recurrence_weekdays ?? []).includes(w.value)
                return (
                  <button
                    key={w.value}
                    onClick={() => toggleWeekday(w.value)}
                    style={active ? weekdayPillActive : weekdayPill}
                  >
                    {w.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <label style={labelStyle}>Bibliotek (pausa till)</label>
        <div style={{ marginBottom: '0.75rem' }}>
          {item.paused_until ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', color: theme.colors.text }}>
                🗄 Pausad till <strong>{item.paused_until}</strong>
              </span>
              <button onClick={() => resumeItem(item.id)} style={secondaryBtn}>Återuppta nu</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {PAUSE_PRESETS.map((p) => (
                <button key={p.months} onClick={() => pauseItem(item.id, addMonthsISO(p.months))} style={secondaryBtn}>
                  {p.label}
                </button>
              ))}
              <input
                type="date"
                onChange={(e) => e.target.value && pauseItem(item.id, e.target.value)}
                style={{ ...inputStyle, width: 'auto' }}
              />
            </div>
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
          <TagInput
            onAdd={(tag) => db.item_tags.put({ item_id: item.id, tag_id: tag.id })}
            excludeIds={new Set((tags ?? []).map((t) => t.id))}
          />
        </div>

        <label style={labelStyle}>Deluppgifter</label>
        <div style={{ marginBottom: '0.5rem' }}>
          {children.length > 1 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChildDragEnd}>
              <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {children.map((child) => (
                    <ChildRow key={child.id} child={child} parentId={item.id} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {children.map((child) => (
                <ChildRow key={child.id} child={child} parentId={item.id} />
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
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

function ChildRow({ child, parentId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: child.id })
  const done = child.status === 'klar'

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm, padding: '0.4rem 0.6rem',
  }

  return (
    <div ref={setNodeRef} style={style}>
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
      <div
        {...attributes}
        {...listeners}
        title="Dra för att ändra ordning"
        style={{
          flexShrink: 0, width: '1.4rem', height: '1.4rem', display: 'flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none',
          color: theme.colors.textMuted, fontSize: '0.95rem', letterSpacing: '-1px',
        }}
      >
        ⠿
      </div>
      <button
        onClick={() => removeChildRelation(parentId, child.id)}
        title="Koppla bort (tar inte bort objektet)"
        style={{ border: 'none', background: 'transparent', color: theme.colors.textMuted, cursor: 'pointer', fontSize: '0.85rem' }}
      >
        ✕
      </button>
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

const weekdayPill = {
  fontSize: '0.8rem',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '999px',
  padding: '0.3rem 0.65rem',
  background: 'transparent',
  color: theme.colors.textMuted,
  cursor: 'pointer',
}

const weekdayPillActive = {
  ...weekdayPill,
  border: `1px solid ${theme.colors.primary}`,
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  fontWeight: 600,
}

