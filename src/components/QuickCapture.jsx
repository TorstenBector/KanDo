import { useState } from 'react'
import { createItem, scheduleToday, togglePrioritized, toggleShoppingList, addChildItem, setRecurrence, setRecurrenceWeekdays } from '../hooks/useItems'
import { addItemTag } from '../hooks/useTags'
import { addAttachment, checkAttachmentAllowed, getAttachmentKind } from '../hooks/useAttachments'
import FileTile from './FileTile'
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight'
import TagInput from './TagInput'
import TagCoOccurrenceSuggestions from './TagCoOccurrenceSuggestions'
import { theme } from '../theme'

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

export default function QuickCapture() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [prioritized, setPrioritized] = useState(false)
  const [scheduledToday, setScheduledToday] = useState(false)
  const [shoppingList, setShoppingList] = useState(false)
  const [pendingTags, setPendingTags] = useState([])
  const [pendingAttachments, setPendingAttachments] = useState([]) // { id, file, kind, previewUrl? }
  const [pendingChildren, setPendingChildren] = useState([])
  const [childInput, setChildInput] = useState('')
  const [recurrenceDays, setRecurrenceDays] = useState(null)
  const [recurrenceWeekdays, setRecurrenceWeekdaysState] = useState([])
  const [customRecurrence, setCustomRecurrence] = useState(false)
  const [showWeekdays, setShowWeekdays] = useState(false)
  const viewportHeight = useVisualViewportHeight()

  function reset() {
    setTitle('')
    setDescription('')
    setPrioritized(false)
    setScheduledToday(false)
    setShoppingList(false)
    setPendingTags([])
    pendingAttachments.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl))
    setPendingAttachments([])
    setPendingChildren([])
    setChildInput('')
    setRecurrenceDays(null)
    setRecurrenceWeekdaysState([])
    setCustomRecurrence(false)
    setShowWeekdays(false)
    setOpen(false)
  }

  function stagePendingFile(file) {
    const error = checkAttachmentAllowed(file)
    if (error) {
      alert(error)
      return
    }
    const kind = getAttachmentKind(file)
    setPendingAttachments((prev) => [...prev, {
      id: crypto.randomUUID(),
      file,
      kind,
      previewUrl: kind === 'image' ? URL.createObjectURL(file) : null,
    }])
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again
    if (!file) return
    stagePendingFile(file)
  }

  // Lets a file copied in the OS (Explorer/Finder) or a clipboard screenshot
  // be pasted straight in, as an alternative to the file picker below.
  // Only intercepts when the clipboard actually carries a file — a plain
  // text paste into Titel/Beskrivning has no clipboardData.files and falls
  // through to the browser's normal paste untouched.
  function handlePanelPaste(e) {
    const files = e.clipboardData?.files
    if (!files || files.length === 0) return
    e.preventDefault()
    Array.from(files).forEach(stagePendingFile)
  }

  function removePendingAttachment(id) {
    setPendingAttachments((prev) => prev.filter((p) => {
      if (p.id === id) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
        return false
      }
      return true
    }))
  }

  function addPendingChild() {
    const t = childInput.trim()
    if (!t) return
    setPendingChildren((prev) => [...prev, t])
    setChildInput('')
  }

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
    setRecurrenceDays(value ? Number(value) : null)
    setRecurrenceWeekdaysState([])
  }

  function toggleWeekday(day) {
    setRecurrenceWeekdaysState((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()))
  }

  const recurrencePreset = recurrenceWeekdays.length
    ? 'weekdays'
    : ([7, 14].includes(recurrenceDays) ? String(recurrenceDays) : (recurrenceDays ? 'custom' : ''))

  // Titel+tagg räcker för att spara direkt — allt annat är valfritt djup,
  // ingenting av det får blockera det snabba fånget (KanDo Vibe #5492:
  // "Räcker det med en titel och en tag så skall jag kunna spara direkt").
  // try/finally krävs här: utan den lämnar ett fel mitt i sparandet
  // (t.ex. en Dexie-skrivning som kastar) `saving` på true för gott —
  // och eftersom QuickCapture aldrig unmountas (bara `open` växlar)
  // sitter Spara-knappen fast på "…" och är oklickbar tills sidan
  // laddas om, även efter att modalen stängts och öppnats igen.
  async function handleSave() {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    setSaving(true)
    try {
      const item = await createItem({
        type: 'idea',
        title: trimmedTitle,
        original_text: trimmedTitle,
        description: description.trim() || null,
      })
      if (prioritized) await togglePrioritized(item.id)
      if (scheduledToday) await scheduleToday(item.id)
      if (shoppingList) await toggleShoppingList(item.id)
      for (const tag of pendingTags) {
        await addItemTag(item.id, tag.id)
      }
      for (const { file } of pendingAttachments) {
        await addAttachment(item.id, file)
      }
      for (const childTitle of pendingChildren) {
        await addChildItem(item.id, childTitle)
      }
      if (recurrenceWeekdays.length > 0) {
        await setRecurrenceWeekdays(item.id, recurrenceWeekdays)
      } else if (recurrenceDays) {
        await setRecurrence(item.id, recurrenceDays)
      }
      reset()
    } catch (err) {
      console.error('Snabbfånga: kunde inte spara', err)
      alert('Kunde inte spara. Försök igen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
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
            // Toppankrad istället för bottenankrad (var: alignItems:'flex-end').
            // Ett tangentbord växer alltid UPPÅT FRÅN skärmens botten — så
            // länge panelens kritiska rad (Titel + Spara/Avbryt) ligger fast
            // i toppen kan den aldrig hamna bakom tangentbordet, oavsett om
            // visualViewport/dvh råkar räkna fel i en installerad PWA
            // (KanDo Vibe #4722/#4743/#3506 — tidigare lösningsförsök som
            // alla försökte kompensera EFTER att panelen redan var
            // bottenankrad, istället för att ta bort själva anledningen till
            // att den kunde kollidera med tangentbordet). KanDo Vibe #5492:
            // samma symptom dök upp igen med en ny skärmdump, så den gamla
            // fixen räckte inte — bytt strategi helt istället för att lappa
            // ännu en gång.
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 260,
            paddingTop: 'env(safe-area-inset-top, 0px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onPaste={handlePanelPaste}
            style={{
              background: theme.colors.bg,
              borderRadius: `0 0 ${theme.radius.lg} ${theme.radius.lg}`,
              width: '100%',
              maxWidth: '480px',
              maxHeight: Math.round(viewportHeight * 0.92),
              boxShadow: theme.shadow.md,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Fast rad: Titel + Spara/Avbryt högst upp till höger (KanDo
                Vibe #5492 — bytt från botten). Räcker med detta för att
                spara — allt nedan är valfritt djup. */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem 1rem', flexShrink: 0 }}>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
                }}
                placeholder="Titel (tala via mikrofonen, skriv, eller klistra in…)"
                style={{
                  flex: 1,
                  minWidth: 0,
                  borderRadius: theme.radius.sm,
                  border: `1px solid ${theme.colors.border}`,
                  padding: '0.5rem 0.6rem',
                  fontFamily: 'inherit',
                  fontSize: '1rem',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                }}
              />
              <button onClick={reset} style={secondaryBtn}>Avbryt</button>
              <button onClick={handleSave} disabled={saving || !title.trim()} style={primaryBtn}>
                {saving ? '…' : 'Spara'}
              </button>
            </div>

            {/* Taggar — "ett absolut måste att kunna lägga till" (KanDo Vibe
                #5492), därför fast i toppen tillsammans med Titel, inte
                nedbäddat i det scrollbara "mer info"-läget nedan. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', padding: '0 1rem 0.75rem', flexShrink: 0, borderBottom: `1px solid ${theme.colors.border}`, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                {pendingTags.filter((t) => t.kind !== 'context').map((tag) => (
                  <TagChip key={tag.id} tag={tag} onRemove={() => setPendingTags((tags) => tags.filter((t) => t.id !== tag.id))} />
                ))}
                <TagInput
                  fixedKind="category"
                  placeholder="+ tagg"
                  onAdd={(tag) => setPendingTags((tags) => (tags.some((t) => t.id === tag.id) ? tags : [...tags, tag]))}
                  excludeIds={new Set(pendingTags.map((t) => t.id))}
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '0.4rem', alignItems: 'center' }}>
                {pendingTags.filter((t) => t.kind === 'context').map((tag) => (
                  <TagChip key={tag.id} tag={tag} onRemove={() => setPendingTags((tags) => tags.filter((t) => t.id !== tag.id))} />
                ))}
                <TagInput
                  fixedKind="context"
                  placeholder="+ plats"
                  onAdd={(tag) => setPendingTags((tags) => (tags.some((t) => t.id === tag.id) ? tags : [...tags, tag]))}
                  excludeIds={new Set(pendingTags.map((t) => t.id))}
                />
              </div>
            </div>

            {/* Scrollbart "mer info"-läge — valfritt djup, blockerar aldrig
                snabbspara ovan (KanDo Vibe #5492: "räcker det med en titel
                och en tag så skall jag kunna spara direkt"). */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.85rem 1rem 1rem' }}>
              <div style={{ marginBottom: '0.4rem' }}>
                <TagCoOccurrenceSuggestions
                  appliedTagIds={new Set(pendingTags.map((t) => t.id))}
                  onAdd={(tag) => setPendingTags((tags) => (tags.some((t) => t.id === tag.id) ? tags : [...tags, tag]))}
                />
              </div>

              <label style={labelStyle}>Beskrivning</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="En mening eller två extra — hjälper dig hitta rätt KanDo senare och undvika dubletter."
                rows={3}
                style={{
                  width: '100%',
                  borderRadius: theme.radius.sm,
                  border: `1px solid ${theme.colors.border}`,
                  padding: '0.5rem 0.6rem',
                  fontFamily: 'inherit',
                  fontSize: '0.9rem',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  marginBottom: '0.85rem',
                }}
              />

              <label style={labelStyle}>Bilagor</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
                {pendingAttachments.map(({ id, file, kind, previewUrl }) => (
                  <div key={id} style={{ position: 'relative' }}>
                    {kind === 'image' ? (
                      <img
                        src={previewUrl}
                        alt=""
                        style={{ width: '4.5rem', height: '4.5rem', objectFit: 'cover', borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.border}`, display: 'block' }}
                      />
                    ) : (
                      <FileTile kind={kind} filename={file.name} />
                    )}
                    <button
                      onClick={() => removePendingAttachment(id)}
                      title="Ta bort bilaga"
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
                  title="Bild, Markdown, Excel eller textfil"
                  style={{
                    width: '4.5rem', height: '4.5rem', borderRadius: theme.radius.sm,
                    border: `1px dashed ${theme.colors.border}`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    color: theme.colors.textMuted, fontSize: '0.7rem', textAlign: 'center',
                  }}
                >
                  📎 +
                  <input
                    type="file"
                    accept="image/*,.md,.markdown,.txt,.xlsx,.xls"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              <label style={labelStyle}>Administrativt</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
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
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
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
                    onBlur={(e) => {
                      const days = Number(e.target.value)
                      if (days > 0) setRecurrenceDays(days)
                      setCustomRecurrence(false)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                    style={{ ...selectStyle, width: '110px' }}
                  />
                )}
                {(showWeekdays || recurrencePreset === 'weekdays') && (
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', width: '100%' }}>
                    {WEEKDAYS.map((w) => {
                      const active = recurrenceWeekdays.includes(w.value)
                      return (
                        <button key={w.value} onClick={() => toggleWeekday(w.value)} style={active ? weekdayPillActive : weekdayPill}>
                          {w.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <label style={labelStyle}>Ny deluppgift</label>
              <div>
                {pendingChildren.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', fontSize: '0.85rem', color: theme.colors.text }}>
                    <span style={{ flex: 1 }}>{t}</span>
                    <button
                      onClick={() => setPendingChildren((prev) => prev.filter((_, j) => j !== i))}
                      style={{ border: 'none', background: 'transparent', color: theme.colors.textMuted, cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem' }}>
                  <input
                    value={childInput}
                    onChange={(e) => setChildInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPendingChild())}
                    placeholder="+ ny deluppgift"
                    style={{ ...selectStyle, flex: 1 }}
                  />
                  <button onClick={addPendingChild} style={secondaryBtn}>Lägg till</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Bytt från en blek surfaceGreen/accentSoft-bakgrund med vanlig textfärg
// till samma tunga, ifyllda stil som pillActive (Prioriterad/Dagens Fokus)
// ovan — valda taggar såg "undertryckta" ut istället för tydligt valda
// (KanDo Vibe #4066, bekräftat med bifogad skärmdump).
function TagChip({ tag, onRemove }) {
  const isContext = tag.kind === 'context'
  return (
    <span
      onClick={onRemove}
      title="Klicka för att ta bort"
      style={{
        fontSize: '0.75rem',
        fontWeight: 600,
        padding: '0.15rem 0.5rem',
        borderRadius: '999px',
        background: isContext ? theme.colors.accent : theme.colors.primary,
        color: isContext ? theme.colors.primaryDark : theme.colors.textOnPrimary,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {isContext ? '📍 ' : ''}{tag.name}
    </span>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: '0.75rem',
  color: theme.colors.textMuted,
  fontWeight: 600,
  marginBottom: '0.3rem',
}

const selectStyle = {
  padding: '0.45rem 0.6rem',
  borderRadius: theme.radius.sm,
  border: `1px solid ${theme.colors.border}`,
  fontSize: '0.9rem',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const primaryBtn = {
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  border: 'none',
  borderRadius: theme.radius.sm,
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  fontWeight: 600,
  flexShrink: 0,
}

const secondaryBtn = {
  background: 'transparent',
  color: theme.colors.textMuted,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  flexShrink: 0,
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
