import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { markDoneWithConfirm, reopenItem, scheduleOn } from '../hooks/useItems'
import { todayISO, addDaysISO, parseLocalDateISO, toLocalDateISO } from '../lib/date'
import { byPriorityThenRank } from '../lib/priority'
import { theme } from '../theme'

// Veckovy i Dagens Fokus (KanDo Vibe #7898): "vilka kort ligger mot vilken
// dag", en vecka i taget, utan klockslag. Bygger helt på scheduled_date —
// ingen ny datamodell. Flytt mellan dagar: tryck kort → Flytta → dag (mobil,
// där drag krockar med scroll/svep) eller dra-och-släpp (bara i bred vy).

// Container width, not window width — Mobillook previews the phone layout in
// a 430px frame on desktop, where window.innerWidth would say "wide".
const WIDE_MIN_PX = 840

function mondayOf(iso) {
  const d = parseLocalDateISO(iso)
  const offset = (d.getDay() + 6) % 7 // mån = 0 … sön = 6
  d.setDate(d.getDate() - offset)
  return toLocalDateISO(d)
}

// ISO 8601-veckonummer — svensk standard (veckan börjar måndag, v. 1 är
// veckan med årets första torsdag).
function isoWeek(mondayISO) {
  const thursday = parseLocalDateISO(addDaysISO(mondayISO, 3))
  const jan1 = new Date(thursday.getFullYear(), 0, 1)
  const dayOfYear = Math.round((thursday - jan1) / 86400000) // round: DST-dagar är 23/25 h
  return Math.floor(dayOfYear / 7) + 1
}

function dayName(iso) {
  const s = parseLocalDateISO(iso).toLocaleDateString('sv-SE', { weekday: 'short' }).replace(/\./g, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function dayMonth(iso) {
  return parseLocalDateISO(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace(/\./g, '')
}

export default function WeekView({ selectedTagIds, viewToggle, onOpenDetail, onOpenDay }) {
  const today = todayISO()
  const [weekStart, setWeekStart] = useState(() => mondayOf(today))
  const [selectedId, setSelectedId] = useState(null)
  const [moving, setMoving] = useState(false)
  const [dragOverDay, setDragOverDay] = useState(null)

  const rootRef = useRef(null)
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE_MIN_PX))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)), [weekStart])
  const weekEnd = days[6]
  const isCurrentWeek = weekStart === mondayOf(today)

  const items = useLiveQuery(
    () => db.items.where('scheduled_date').between(weekStart, weekEnd, true, true).toArray(),
    [weekStart, weekEnd]
  ) ?? []

  const taggedItemIds = useLiveQuery(async () => {
    if (!selectedTagIds || selectedTagIds.size === 0) return null
    const links = await db.item_tags.where('tag_id').anyOf([...selectedTagIds]).toArray()
    return new Set(links.map((l) => l.item_id))
  }, [selectedTagIds])

  const itemsByDay = useMemo(() => {
    const visible = selectedTagIds?.size > 0 && taggedItemIds ? items.filter((i) => taggedItemIds.has(i.id)) : items
    const map = new Map(days.map((d) => [d, []]))
    for (const item of visible) map.get(item.scheduled_date)?.push(item)
    // Öppna först (i prioordning), klara sist.
    for (const list of map.values()) {
      list.sort((a, b) => ((a.status === 'klar') - (b.status === 'klar')) || byPriorityThenRank(a, b))
    }
    return map
  }, [items, days, selectedTagIds, taggedItemIds])

  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : null

  const clearSelection = () => {
    setSelectedId(null)
    setMoving(false)
  }

  const moveTo = async (dateISO, id = selectedId) => {
    if (!id) return
    const item = items.find((i) => i.id === id)
    // Klara kort flyttas inte — scheduleOn() sätter status 'planerad', vilket
    // tyst hade öppnat det klara kortet igen.
    if (item && item.status !== 'klar' && item.scheduled_date !== dateISO) await scheduleOn(id, dateISO)
    clearSelection()
  }

  const shiftWeek = (delta) => {
    clearSelection()
    setWeekStart((w) => addDaysISO(w, delta * 7))
  }

  return (
    <div ref={rootRef}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem 0.5rem', flexWrap: 'wrap', margin: '0 0 0.75rem' }}>
        {viewToggle}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => shiftWeek(-1)} style={navBtn} aria-label="Föregående vecka">‹</button>
          <span style={{ textAlign: 'center', minWidth: '7.5rem', lineHeight: 1.2 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: theme.colors.text }}>v. {isoWeek(weekStart)}</span>
            <span style={{ display: 'block', fontSize: '0.72rem', color: theme.colors.textMuted, whiteSpace: 'nowrap' }}>
              {dayMonth(weekStart)} – {dayMonth(weekEnd)}
            </span>
          </span>
          <button onClick={() => shiftWeek(1)} style={navBtn} aria-label="Nästa vecka">›</button>
          {!isCurrentWeek && (
            <button onClick={() => { clearSelection(); setWeekStart(mondayOf(today)) }} style={{ ...navBtn, width: 'auto', padding: '0 0.6rem', fontSize: '0.8rem' }}>
              Denna vecka
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: wide ? 'repeat(7, minmax(0, 1fr))' : '1fr',
          gap: wide ? '0.4rem' : '0.5rem',
        }}
      >
        {days.map((dateISO) => {
          const list = itemsByDay.get(dateISO) ?? []
          const open = list.filter((i) => i.status !== 'klar').length
          const done = list.length - open
          const isToday = dateISO === today
          const isPast = dateISO < today
          return (
            <div
              key={dateISO}
              onDragOver={wide ? (e) => { e.preventDefault(); setDragOverDay(dateISO) } : undefined}
              onDragLeave={wide ? () => setDragOverDay((d) => (d === dateISO ? null : d)) : undefined}
              onDrop={wide ? (e) => {
                e.preventDefault()
                setDragOverDay(null)
                moveTo(dateISO, e.dataTransfer.getData('text/plain'))
              } : undefined}
              style={{
                background: isToday ? theme.colors.surfaceGreen : theme.colors.surface,
                border: isToday ? `2px solid ${theme.colors.primary}` : `1px solid ${dragOverDay === dateISO ? theme.colors.primary : theme.colors.border}`,
                borderRadius: theme.radius.md,
                padding: '0.5rem 0.6rem',
                minHeight: wide ? '14rem' : undefined,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                boxShadow: theme.shadow.sm,
              }}
            >
              <button
                onClick={() => !moving && onOpenDay(dateISO)}
                title="Öppna dagen i Dag-läget"
                style={{
                  display: 'flex',
                  flexDirection: wide ? 'column' : 'row',
                  alignItems: wide ? 'flex-start' : 'baseline',
                  justifyContent: 'space-between',
                  gap: wide ? 0 : '0.5rem',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: moving ? 'default' : 'pointer',
                  textAlign: 'left',
                  color: theme.colors.text,
                }}
              >
                <span style={{ fontWeight: 800, fontSize: '0.9rem', opacity: isPast && !isToday ? 0.75 : 1 }}>
                  {dayName(dateISO)}
                  <span style={{ fontWeight: 600, fontSize: '0.78rem', color: theme.colors.textMuted, marginLeft: '0.3rem' }}>{dayMonth(dateISO)}</span>
                  {isToday && <span style={todayBadge}>Idag</span>}
                </span>
                {list.length > 0 && (
                  <span style={{ fontSize: '0.72rem', color: theme.colors.textMuted, whiteSpace: 'nowrap' }}>
                    {open} kvar{done > 0 ? ` · ${done} ${done === 1 ? 'klar' : 'klara'}` : ''}
                  </span>
                )}
              </button>

              {list.length === 0 && !moving && (
                <span style={{ fontSize: '0.78rem', color: theme.colors.textMuted, fontStyle: 'italic' }}>Inget planerat</span>
              )}

              {list.map((item) => (
                <WeekCard
                  key={item.id}
                  item={item}
                  missed={isPast && item.status !== 'klar'}
                  selected={item.id === selectedId}
                  draggable={wide}
                  onSelect={() => { if (!moving) setSelectedId(item.id === selectedId ? null : item.id) }}
                />
              ))}

              {moving && selectedItem?.scheduled_date !== dateISO && (
                <button onClick={() => moveTo(dateISO)} style={dropTarget}>Flytta hit</button>
              )}
            </div>
          )
        })}
      </div>

      {wide && (
        <p style={{ fontSize: '0.75rem', color: theme.colors.textMuted, margin: '0.6rem 0 0' }}>
          Dra ett kort till en annan dag för att flytta det.
        </p>
      )}

      {selectedItem && (
        <div style={actionBar}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
            {moving ? `Välj dag för "${selectedItem.title}"` : selectedItem.title}
          </span>
          {moving ? (
            <button onClick={() => setMoving(false)} style={barBtn}>Avbryt</button>
          ) : (
            <>
              {selectedItem.status !== 'klar' && (
                <button onClick={() => setMoving(true)} style={barBtn}>Flytta</button>
              )}
              <button onClick={() => { onOpenDetail(selectedItem.id); clearSelection() }} style={barBtn}>Öppna</button>
              <button onClick={clearSelection} style={{ ...barBtn, border: 'none' }} aria-label="Stäng">✕</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function WeekCard({ item, missed, selected, draggable, onSelect }) {
  const done = item.status === 'klar'
  return (
    <div
      onClick={onSelect}
      draggable={draggable && !done}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.45rem',
        background: missed ? theme.colors.warningSoft : theme.colors.bg,
        border: `1px solid ${missed ? theme.colors.warning : theme.colors.border}`,
        outline: selected ? `2px solid ${theme.colors.accent}` : 'none',
        outlineOffset: '1px',
        borderRadius: theme.radius.sm,
        padding: '0.35rem 0.5rem',
        cursor: draggable && !done ? 'grab' : 'pointer',
        opacity: done ? 0.6 : 1,
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); done ? reopenItem(item.id) : markDoneWithConfirm(item.id) }}
        title={done ? 'Ångra' : 'Markera som klar'}
        style={{
          border: `1.5px solid ${theme.colors.success}`,
          background: done ? theme.colors.success : 'transparent',
          borderRadius: '50%',
          width: '1rem',
          height: '1rem',
          flexShrink: 0,
          marginTop: '0.1rem',
          cursor: 'pointer',
          padding: 0,
          color: done ? '#ffffff' : theme.colors.success,
          fontSize: '0.6rem',
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        ✓
      </button>
      <span style={{ fontSize: '0.84rem', color: theme.colors.text, textDecoration: done ? 'line-through' : 'none', minWidth: 0, overflowWrap: 'anywhere' }}>
        {item.short_id && <span style={{ fontSize: '0.7rem', color: theme.colors.textMuted, marginRight: '0.3rem' }}>#{item.short_id}</span>}
        {item.title}
      </span>
    </div>
  )
}

const navBtn = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  color: theme.colors.text,
  borderRadius: theme.radius.sm,
  width: '1.8rem',
  height: '1.8rem',
  cursor: 'pointer',
  fontSize: '1rem',
}

const todayBadge = {
  fontSize: '0.64rem',
  fontWeight: 800,
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  borderRadius: '999px',
  padding: '0.05rem 0.45rem',
  marginLeft: '0.4rem',
  verticalAlign: '0.1rem',
}

const dropTarget = {
  border: `1.5px dashed ${theme.colors.primary}`,
  background: 'transparent',
  color: theme.colors.primary,
  borderRadius: theme.radius.sm,
  padding: '0.35rem',
  fontSize: '0.78rem',
  fontWeight: 700,
  cursor: 'pointer',
}

const actionBar = {
  position: 'sticky',
  bottom: '0.5rem',
  zIndex: 140,
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginTop: '0.75rem',
  background: theme.colors.primaryDark,
  color: theme.colors.textOnPrimary,
  borderRadius: theme.radius.md,
  padding: '0.5rem 0.75rem',
  boxShadow: theme.shadow.md,
}

const barBtn = {
  border: `1px solid ${theme.colors.textOnPrimary}`,
  background: 'transparent',
  color: theme.colors.textOnPrimary,
  borderRadius: '999px',
  padding: '0.2rem 0.65rem',
  fontSize: '0.78rem',
  cursor: 'pointer',
  flexShrink: 0,
}
