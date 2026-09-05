import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { markDoneWithConfirm, reopenItem, sendToBacklog, scheduleToday } from '../hooks/useItems'
import { useChildrenByParent } from '../hooks/useRelations'
import ItemDetailModal from './ItemDetailModal'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const COLLAPSE_THRESHOLD = 3
const PRIORITY_WEIGHT = { hog: 0, medel: 1, lag: 2 }

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function addDaysISO(iso, days) {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDateLabel(iso) {
  const d = new Date(iso)
  const label = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Default order: backlog_priority (Hög/Medel/Låg) first, then position in
// the Prio list within each tier — a composite of both attributes rather
// than either alone.
function byPriorityThenRank(a, b) {
  const aWeight = a.backlog_priority ? PRIORITY_WEIGHT[a.backlog_priority] : 3
  const bWeight = b.backlog_priority ? PRIORITY_WEIGHT[b.backlog_priority] : 3
  if (aWeight !== bWeight) return aWeight - bWeight
  return (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999)
}

export default function DagensFokus({ selectedTagIds }) {
  const [showDone, setShowDone] = useState(false)
  const [detailItemId, setDetailItemId] = useState(null)
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [groupByTag, setGroupByTag] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  // Parents with many children take up a lot of space, so they start
  // collapsed — expanding is an opt-in per parent.
  const [expandedParents, setExpandedParents] = useState(() => new Set())
  const toggleParent = (id) =>
    setExpandedParents((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const { childrenByParent } = useChildrenByParent()
  const isToday = selectedDate === todayISO()

  const scheduled = useLiveQuery(async () => {
    return db.items.where('scheduled_date').equals(selectedDate).toArray()
  }, [selectedDate])

  // The "top 5 priorities" fallback only makes sense for today — a future
  // date with nothing scheduled yet should just look empty, not borrow
  // today's priority list.
  const topPriority = useLiveQuery(async () => {
    if (!isToday) return []
    const all = await db.items.where('status').equals('prioriterad').toArray()
    return all.sort(byPriorityThenRank).slice(0, 5)
  }, [isToday])

  const showScheduled = (scheduled?.length ?? 0) > 0
  const unfilteredList = showScheduled ? scheduled : (topPriority ?? [])

  const taggedItemIds = useLiveQuery(async () => {
    if (!selectedTagIds || selectedTagIds.size === 0) return null
    const links = await db.item_tags.where('tag_id').anyOf([...selectedTagIds]).toArray()
    return new Set(links.map((l) => l.item_id))
  }, [selectedTagIds])
  const rawList = useMemo(
    () => (selectedTagIds?.size > 0 && taggedItemIds ? unfilteredList.filter((i) => taggedItemIds.has(i.id)) : unfilteredList),
    [unfilteredList, selectedTagIds, taggedItemIds]
  )

  const activeItems = useMemo(
    () => rawList.filter((i) => i.status !== 'klar').sort(byPriorityThenRank),
    [rawList]
  )
  const doneItems = useMemo(
    () => rawList.filter((i) => i.status === 'klar').sort(byPriorityThenRank),
    [rawList]
  )
  const collapseDone = doneItems.length > COLLAPSE_THRESHOLD

  // Nest a child under its parent only when both are open and visible in
  // today's list — a child whose parent is done or not scheduled here stays
  // a normal top-level row instead of nesting under something you can't see.
  const activeIdSet = useMemo(() => new Set(activeItems.map((i) => i.id)), [activeItems])
  const parentIdByChildId = useMemo(() => {
    const map = new Map()
    for (const [parentId, children] of childrenByParent.entries()) {
      for (const child of children) map.set(child.id, parentId)
    }
    return map
  }, [childrenByParent])
  const activeTopLevel = useMemo(
    () => activeItems.filter((item) => {
      const parentId = parentIdByChildId.get(item.id)
      return !parentId || !activeIdSet.has(parentId)
    }),
    [activeItems, parentIdByChildId, activeIdSet]
  )

  // "Har jag flera Ute, vill jag se alla uppgifter jag bör göra innan jag
  // går in" — group active items by tag instead of a flat priority list.
  const activeIds = useMemo(() => activeItems.map((i) => i.id), [activeItems])
  const tagsByItemId = useLiveQuery(async () => {
    if (!groupByTag || activeIds.length === 0) return new Map()
    const links = await db.item_tags.where('item_id').anyOf(activeIds).toArray()
    const tagIds = [...new Set(links.map((l) => l.tag_id))]
    const tags = await db.tags.bulkGet(tagIds)
    const tagById = new Map(tags.filter(Boolean).map((t) => [t.id, t]))
    const map = new Map()
    for (const link of links) {
      const tag = tagById.get(link.tag_id)
      if (!tag) continue
      if (!map.has(link.item_id)) map.set(link.item_id, [])
      map.get(link.item_id).push(tag)
    }
    return map
  }, [groupByTag, activeIds])

  const tagGroups = useMemo(() => {
    if (!groupByTag || !tagsByItemId) return null
    const groups = new Map() // tagId -> { tag, items: [] }
    const untagged = []
    for (const item of activeItems) {
      const tags = tagsByItemId.get(item.id) ?? []
      if (tags.length === 0) {
        untagged.push(item)
        continue
      }
      for (const tag of tags) {
        if (!groups.has(tag.id)) groups.set(tag.id, { tag, items: [] })
        groups.get(tag.id).items.push(item)
      }
    }
    const sorted = [...groups.values()].sort((a, b) => a.tag.name.localeCompare(b.tag.name, 'sv'))
    if (untagged.length > 0) sorted.push({ tag: null, items: untagged })
    return sorted
  }, [groupByTag, tagsByItemId, activeItems])

  // "Vill se alla KanDos som tidigare varit satta som Dagens Fokus men som
  // inte blivit utförda" — every day scheduled before today that never got
  // marked done, regardless of which day it was, reviewed one at a time.
  const today = todayISO()
  const allMissed = useLiveQuery(async () => {
    const all = await db.items.where('scheduled_date').below(today).toArray()
    return all.filter((i) => i.status !== 'klar').sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
  }, [today]) ?? []
  const missedItems = useMemo(
    () => (selectedTagIds?.size > 0 && taggedItemIds ? allMissed.filter((i) => taggedItemIds.has(i.id)) : allMissed),
    [allMissed, selectedTagIds, taggedItemIds]
  )

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem' }}>
        <button onClick={() => setSelectedDate(addDaysISO(selectedDate, -1))} style={dateNavBtn}>‹</button>
        <span style={{ color: theme.colors.text, fontSize: '0.9rem', fontWeight: 600, minWidth: '9rem', textAlign: 'center' }}>
          {isToday ? 'Schemalagt idag' : formatDateLabel(selectedDate)}
        </span>
        <button onClick={() => setSelectedDate(addDaysISO(selectedDate, 1))} style={dateNavBtn}>›</button>
        {!isToday && (
          <button onClick={() => setSelectedDate(todayISO())} style={{ ...dateNavBtn, width: 'auto', padding: '0 0.6rem' }}>
            Idag
          </button>
        )}
        <button
          onClick={() => setGroupByTag((g) => !g)}
          style={{
            marginLeft: 'auto',
            border: `1px solid ${groupByTag ? theme.colors.primary : theme.colors.border}`,
            background: groupByTag ? theme.colors.primary : theme.colors.surface,
            color: groupByTag ? theme.colors.textOnPrimary : theme.colors.text,
            borderRadius: theme.radius.sm,
            padding: '0.35rem 0.6rem',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          🏷 Gruppera efter tagg
        </button>
        {missedItems.length > 0 && (
          <button
            onClick={() => setReviewMode((r) => !r)}
            style={{
              border: `1px solid ${reviewMode ? theme.colors.primary : theme.colors.warning}`,
              background: reviewMode ? theme.colors.primary : theme.colors.surface,
              color: reviewMode ? theme.colors.textOnPrimary : theme.colors.text,
              borderRadius: theme.radius.sm,
              padding: '0.35rem 0.6rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            🔁 Missade ({missedItems.length})
          </button>
        )}
      </div>

      {reviewMode ? (
        <MissedReview items={missedItems} onOpenDetail={setDetailItemId} onClose={() => setReviewMode(false)} />
      ) : (
        <>
      {isToday && !showScheduled && (
        <p style={{ color: theme.colors.textMuted, fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          Inget schemalagt idag — de fem högst prioriterade
        </p>
      )}

      {rawList.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>
          {isToday
            ? 'Inget att visa än. Fånga något med Snabbfånga, eller flytta objekt till "Prioriterad" i Kanban.'
            : 'Inget schemalagt för den här dagen än. Öppna en KanDo (✎) och sätt schemalagt datum för att lägga den hit.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* Done items float to the top, but collapse into one line past the
            threshold so what's left to do gets the visual space instead. */}
        {collapseDone && !showDone ? (
          <button
            onClick={() => setShowDone(true)}
            style={{
              background: theme.colors.surfaceGreen,
              border: `1px solid ${theme.colors.success}`,
              borderRadius: theme.radius.sm,
              padding: '0.6rem 0.8rem',
              boxShadow: theme.shadow.sm,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              color: theme.colors.text,
            }}
          >
            <span style={{ color: theme.colors.success, fontSize: '1.1rem' }}>✓</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Utförda ({doneItems.length})</span>
            <span
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                color: theme.colors.textMuted,
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              Visa
              <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>⌄</span>
            </span>
          </button>
        ) : (
          <>
            {collapseDone && (
              <button
                onClick={() => setShowDone(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: theme.colors.textMuted,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  padding: '0 0 0.1rem',
                  alignSelf: 'flex-start',
                }}
              >
                – Dölj utförda
              </button>
            )}
            <div style={itemGridStyle}>
              {doneItems.map((item) => (
                <FocusRow key={item.id} item={item} showScheduled={showScheduled} onOpenDetail={setDetailItemId} />
              ))}
            </div>
          </>
        )}

        {groupByTag && tagGroups ? (
          tagGroups.map(({ tag, items }) => (
            <div key={tag?.id ?? 'untagged'} style={{ marginTop: '0.5rem' }}>
              <h3 style={{ color: theme.colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase', margin: '0 0 0.4rem' }}>
                {tag ? `${tag.kind === 'context' ? '📍 ' : ''}${tag.name}` : 'Otaggat'} ({items.length})
              </h3>
              <div style={itemGridStyle}>
                {items.map((item) => (
                  <FocusRow key={item.id} item={item} showScheduled={showScheduled} onOpenDetail={setDetailItemId} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div style={itemGridStyle}>
            {activeTopLevel.map((item) => {
              const children = (childrenByParent.get(item.id) ?? []).filter((c) => activeIdSet.has(c.id))
              const collapsed = !expandedParents.has(item.id)
              return (
                <div key={item.id}>
                  <FocusRow
                    item={item}
                    showScheduled={showScheduled}
                    onOpenDetail={setDetailItemId}
                    childCount={children.length}
                    collapsed={collapsed}
                    onToggleCollapse={() => toggleParent(item.id)}
                  />
                  {children.length > 0 && !collapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem', marginLeft: '1.6rem' }}>
                      {children.map((child) => (
                        <FocusRow key={child.id} item={child} showScheduled={showScheduled} onOpenDetail={setDetailItemId} isChild />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
        </>
      )}

      <ItemDetailModal itemId={detailItemId} onClose={() => setDetailItemId(null)} />
    </div>
  )
}

const SWIPE_THRESHOLD = 90

// One at a time, Tinder-style: swipe right (or the button) reschedules to
// today for a fresh attempt; swipe left (or the button) sends it back to
// Backlog without a date, off today's radar until re-triaged from there.
function MissedReview({ items, onOpenDetail, onClose }) {
  const item = items[0]

  if (!item) {
    return (
      <div style={{ padding: '1.5rem 0', textAlign: 'center' }}>
        <p style={{ color: theme.colors.textMuted, margin: '0 0 0.75rem' }}>Inga fler missade — bra jobbat! 🎉</p>
        <button onClick={onClose} style={{ ...dateNavBtn, width: 'auto', padding: '0 0.8rem' }}>Stäng genomgång</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem 0 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <MissedCard
        key={item.id}
        item={item}
        onOpenDetail={onOpenDetail}
        onSwipeRight={() => scheduleToday(item.id)}
        onSwipeLeft={() => sendToBacklog(item.id)}
      />
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button onClick={() => sendToBacklog(item.id)} style={{ ...secondaryReviewBtn, color: theme.colors.textMuted }}>
          ← Backlog
        </button>
        <button onClick={() => scheduleToday(item.id)} style={{ ...secondaryReviewBtn, color: theme.colors.success, borderColor: theme.colors.success }}>
          Dagens Fokus →
        </button>
      </div>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: theme.colors.textMuted, fontSize: '0.8rem', cursor: 'pointer' }}>
        ✕ Stäng genomgång
      </button>
    </div>
  )
}

function MissedCard({ item, onOpenDetail, onSwipeRight, onSwipeLeft }) {
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef(0)
  const movedRef = useRef(false)

  function handlePointerDown(e) {
    setDragging(true)
    movedRef.current = false
    startXRef.current = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function handlePointerMove(e) {
    if (!dragging) return
    const delta = e.clientX - startXRef.current
    if (Math.abs(delta) > 4) movedRef.current = true
    setDragX(delta)
  }
  function handlePointerUp() {
    setDragging(false)
    if (dragX > SWIPE_THRESHOLD) onSwipeRight()
    else if (dragX < -SWIPE_THRESHOLD) onSwipeLeft()
    setDragX(0)
  }

  const rotation = dragX / 18
  const rightHintOpacity = Math.min(Math.max(dragX / SWIPE_THRESHOLD, 0), 1)
  const leftHintOpacity = Math.min(Math.max(-dragX / SWIPE_THRESHOLD, 0), 1)

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={() => { if (!movedRef.current) onOpenDetail(item.id) }}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '360px',
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.md,
        padding: '1.2rem 1rem',
        boxShadow: theme.shadow.md,
        transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
        transition: dragging ? 'none' : 'transform 0.25s ease',
        touchAction: 'pan-y',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute', top: '0.6rem', right: '0.8rem',
          fontWeight: 700, fontSize: '0.9rem', color: theme.colors.success,
          opacity: rightHintOpacity, textTransform: 'uppercase',
        }}
      >
        Idag ✓
      </span>
      <span
        style={{
          position: 'absolute', top: '0.6rem', left: '0.8rem',
          fontWeight: 700, fontSize: '0.9rem', color: theme.colors.textMuted,
          opacity: leftHintOpacity, textTransform: 'uppercase',
        }}
      >
        Backlog
      </span>
      <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase', marginTop: '1rem' }}>
        {TYPE_LABEL[item.type]} · Missade sedan {formatDateLabel(item.scheduled_date)}
      </div>
      <div style={{ color: theme.colors.text, fontWeight: 600, fontSize: '1.1rem', marginTop: '0.3rem' }}>
        {item.title}
      </div>
    </div>
  )
}

function FocusRow({ item, showScheduled, onOpenDetail, childCount = 0, collapsed = false, onToggleCollapse, isChild = false }) {
  const done = item.status === 'klar'
  return (
    <div
      style={{
        background: isChild ? theme.colors.childTint : (done ? theme.colors.surfaceGreen : theme.colors.surface),
        border: `1px solid ${isChild ? theme.colors.childTintBorder : (done ? theme.colors.success : theme.colors.border)}`,
        borderRadius: theme.radius.sm,
        padding: isChild ? '0.45rem 0.7rem' : '0.6rem 0.8rem',
        boxShadow: isChild ? 'none' : theme.shadow.sm,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
      }}
    >
      <button
        onClick={() => (done ? reopenItem(item.id) : markDoneWithConfirm(item.id))}
        title={done ? 'Ångra' : 'Markera som klar'}
        style={{
          border: `1.5px solid ${theme.colors.success}`,
          background: done ? theme.colors.success : theme.colors.bg,
          borderRadius: '50%',
          width: isChild ? '1.1rem' : '1.3rem',
          height: isChild ? '1.1rem' : '1.3rem',
          flexShrink: 0,
          cursor: 'pointer',
          padding: 0,
          color: done ? '#ffffff' : theme.colors.success,
          fontSize: '0.8rem',
          fontWeight: 700,
        }}
      >
        ✓
      </button>
      <div onClick={() => onOpenDetail(item.id)} style={{ flex: 1, cursor: 'pointer' }}>
        <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
          {TYPE_LABEL[item.type]}
        </div>
        <div
          style={{
            color: done ? theme.colors.textMuted : theme.colors.text,
            fontWeight: 500,
            fontSize: isChild ? '0.87rem' : '1rem',
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {item.title}
        </div>
        {item.claimed_by && (
          <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, marginTop: '0.1rem' }}>
            🙋 Tagen av {item.claimed_by}
          </div>
        )}
      </div>
      {childCount > 0 && (
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Visa deluppgifter' : 'Dölj deluppgifter'}
          aria-expanded={!collapsed}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            border: `1px solid ${theme.colors.border}`,
            background: theme.colors.bg,
            borderRadius: '999px',
            padding: '0.15rem 0.55rem',
            cursor: 'pointer',
            color: theme.colors.textMuted,
            fontSize: '0.75rem',
            flexShrink: 0,
          }}
        >
          <span>{childCount}</span>
          <span style={{ transform: collapsed ? 'none' : 'rotate(90deg)', display: 'inline-block', transition: 'transform 0.15s ease' }}>
            ▸
          </span>
        </button>
      )}
      {showScheduled && (
        <button
          onClick={() => sendToBacklog(item.id)}
          title="Tillbaka till Backlog"
          style={{
            border: `1px solid ${theme.colors.border}`,
            background: 'transparent',
            borderRadius: theme.radius.sm,
            padding: '0.25rem 0.5rem',
            fontSize: '0.7rem',
            color: theme.colors.textMuted,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          ← Backlog
        </button>
      )}
    </div>
  )
}

// Wide desktop screens get several cards side by side instead of one row
// stretched edge-to-edge; narrow/mobile viewports naturally collapse to a
// single column since there's no room for a second 340px card.
const itemGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
  gap: '0.75rem',
  alignItems: 'start',
}

const secondaryReviewBtn = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  borderRadius: '999px',
  padding: '0.5rem 1.1rem',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const dateNavBtn = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  color: theme.colors.text,
  borderRadius: theme.radius.sm,
  width: '1.8rem',
  height: '1.8rem',
  cursor: 'pointer',
  fontSize: '1rem',
}
