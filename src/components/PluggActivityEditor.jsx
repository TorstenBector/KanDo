import { useState } from 'react'
import { createActivity, deleteActivity, updateActivity } from '../hooks/usePlugg'
import { useBodyScrollLock, useVisualViewport } from '../hooks/useVisualViewport'
import { WEEKDAYS } from '../lib/plugg'
import { theme } from '../theme'

const MINUTE_PRESETS = [15, 30, 45, 60]

function emptySlot() {
  return { weekdays: [], time: '18:00', minutes: 30 }
}

// Ny/ändra pluggaktivitet. Toppankrad panel + useVisualViewport, samma
// iOS-mönster som Snabbfånga (se CLAUDE.md "UI-mönster").
export default function PluggActivityEditor({ activity, onClose }) {
  const [title, setTitle] = useState(activity?.title ?? '')
  const [description, setDescription] = useState(activity?.description ?? '')
  const [endDate, setEndDate] = useState(activity?.end_date ?? '')
  const [slots, setSlots] = useState(() => (activity?.schedule?.length ? activity.schedule.map((s) => ({ ...s })) : [emptySlot()]))
  const [saving, setSaving] = useState(false)
  const viewport = useVisualViewport()
  useBodyScrollLock(true)

  const validSlots = slots.filter((s) => s.weekdays.length > 0 && s.time && s.minutes > 0)
  const canSave = title.trim().length > 0 && validSlots.length > 0 && !saving

  const updateSlot = (index, changes) => setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...changes } : s)))
  const toggleDay = (index, iso) =>
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s
        const weekdays = s.weekdays.includes(iso) ? s.weekdays.filter((d) => d !== iso) : [...s.weekdays, iso].sort()
        return { ...s, weekdays }
      })
    )

  async function save() {
    if (!canSave) return
    setSaving(true)
    const data = {
      title,
      description,
      end_date: endDate || null,
      schedule: validSlots.map((s) => ({ weekdays: s.weekdays, time: s.time, minutes: Number(s.minutes) })),
    }
    if (activity) await updateActivity(activity.id, data)
    else await createActivity(data)
    onClose()
  }

  async function remove() {
    if (!window.confirm(`Ta bort "${activity.title}" och alla dess pass?`)) return
    await deleteActivity(activity.id)
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: viewport.offsetTop,
        height: viewport.height,
        background: 'rgba(26,58,26,0.45)',
        zIndex: 300,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.bg,
          width: '100%',
          maxWidth: '560px',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: `0 0 ${theme.radius.lg} ${theme.radius.lg}`,
          boxShadow: theme.shadow.md,
        }}
      >
        <div style={{ padding: '0.9rem 1rem 0.6rem', display: 'flex', gap: '0.5rem', alignItems: 'center', borderBottom: `1px solid ${theme.colors.border}` }}>
          <input
            autoFocus={!activity}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Vad ska du plugga till? T.ex. Fysikprov"
            style={{ ...inputStyle, flex: 1, fontSize: '1rem', fontWeight: 600 }}
          />
          <button onClick={save} disabled={!canSave} style={{ ...saveBtn, opacity: canSave ? 1 : 0.5 }}>
            Spara
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '0.9rem 1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label style={labelStyle}>
            Provdag (passen slutar efter den)
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={labelStyle}>Pluggpass varje vecka</div>
            {slots.map((slot, index) => (
              <div key={index} style={slotBox}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {WEEKDAYS.map((w) => {
                    const on = slot.weekdays.includes(w.iso)
                    return (
                      <button
                        key={w.iso}
                        onClick={() => toggleDay(index, w.iso)}
                        aria-pressed={on}
                        style={{
                          ...chip,
                          background: on ? theme.colors.primary : theme.colors.bg,
                          color: on ? theme.colors.textOnPrimary : theme.colors.text,
                          borderColor: on ? theme.colors.primary : theme.colors.border,
                        }}
                      >
                        {w.short}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', color: theme.colors.textMuted }}>kl</span>
                  <input type="time" value={slot.time} onChange={(e) => updateSlot(index, { time: e.target.value })} style={{ ...inputStyle, width: '6.5rem' }} />
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {MINUTE_PRESETS.map((m) => (
                      <button
                        key={m}
                        onClick={() => updateSlot(index, { minutes: m })}
                        aria-pressed={slot.minutes === m}
                        style={{
                          ...chip,
                          background: slot.minutes === m ? theme.colors.primary : theme.colors.bg,
                          color: slot.minutes === m ? theme.colors.textOnPrimary : theme.colors.text,
                          borderColor: slot.minutes === m ? theme.colors.primary : theme.colors.border,
                        }}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                  {slots.length > 1 && (
                    <button onClick={() => setSlots((prev) => prev.filter((_, i) => i !== index))} style={{ ...linkBtn, marginLeft: 'auto' }}>
                      Ta bort
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button onClick={() => setSlots((prev) => [...prev, emptySlot()])} style={{ ...linkBtn, alignSelf: 'flex-start', fontSize: '0.9rem' }}>
              + Lägg till fler pass (andra dagar eller tider)
            </button>
          </div>

          <label style={labelStyle}>
            Beskrivning
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="T.ex. kapitel 4–6, räkna övningsuppgifterna"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>

          {activity && (
            <button onClick={remove} style={{ ...linkBtn, color: theme.colors.danger, alignSelf: 'flex-start' }}>
              Ta bort aktiviteten
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  color: theme.colors.text,
  borderRadius: theme.radius.sm,
  padding: '0.5rem 0.6rem',
  // 16px förhindrar att iOS zoomar in vid fokus.
  fontSize: '16px',
  minWidth: 0,
}

const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: theme.colors.textMuted,
}

const slotBox = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  borderRadius: theme.radius.md,
  padding: '0.6rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.55rem',
}

const chip = {
  border: '1px solid',
  borderRadius: '999px',
  padding: '0.3rem 0.65rem',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const saveBtn = {
  border: 'none',
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  borderRadius: theme.radius.sm,
  padding: '0.55rem 1rem',
  fontSize: '0.95rem',
  fontWeight: 700,
  cursor: 'pointer',
  flexShrink: 0,
}

const linkBtn = {
  border: 'none',
  background: 'transparent',
  color: theme.colors.primary,
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
}
