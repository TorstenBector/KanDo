import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { reopenItem } from '../hooks/useItems'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfWeek(d) {
  const x = startOfDay(d)
  const day = (x.getDay() + 6) % 7 // Monday = 0
  x.setDate(x.getDate() - day)
  return x
}

function startOfMonth(d) {
  const x = startOfDay(d)
  x.setDate(1)
  return x
}

function startOfYear(d) {
  const x = startOfDay(d)
  x.setMonth(0, 1)
  return x
}

function groupByRecency(items) {
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const week = startOfWeek(now)
  const month = startOfMonth(now)
  const year = startOfYear(now)

  const groups = {
    Idag: [], Igår: [], 'Den här veckan': [], 'Den här månaden': [], 'Det här året': [], Tidigare: [],
  }
  for (const item of items) {
    const c = new Date(item.completed_at)
    if (c >= today) groups['Idag'].push(item)
    else if (c >= yesterday) groups['Igår'].push(item)
    else if (c >= week) groups['Den här veckan'].push(item)
    else if (c >= month) groups['Den här månaden'].push(item)
    else if (c >= year) groups['Det här året'].push(item)
    else groups['Tidigare'].push(item)
  }
  return groups
}

// ISO 8601 week number.
function isoWeekInfo(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return { isoYear: d.getUTCFullYear(), week }
}

function monthLabel(key) {
  const [y, m] = key.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  const label = d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export default function UtfordaView() {
  const items = useLiveQuery(async () => {
    const all = await db.items.where('status').equals('klar').toArray()
    return all.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
  }, []) ?? []

  const groups = groupByRecency(items)

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ color: theme.colors.text, margin: '0 0 1rem' }}>Utförda</h2>

      {items.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>Inget klarmarkerat än.</p>
      )}

      {Object.entries(groups).map(([label, groupItems]) =>
        groupItems.length === 0 ? null : (
          <div key={label} style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ color: theme.colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>
              {label}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {groupItems.map((item) => (
                <CompletedRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )
      )}

      {items.length > 0 && <BrowseHistory items={items} />}
    </div>
  )
}

function CompletedRow({ item }) {
  return (
    <div
      style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.sm,
        padding: '0.6rem 0.8rem',
        boxShadow: theme.shadow.sm,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
      }}
    >
      <span style={{ color: theme.colors.success, fontSize: '1rem' }}>✓</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.65rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
          {TYPE_LABEL[item.type]}
        </div>
        <div style={{ color: theme.colors.text, fontWeight: 500, textDecoration: 'line-through' }}>
          {item.title}
        </div>
        {item.recurrence_days && item.next_due_date && (
          <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textDecoration: 'none' }}>
            🔁 Återkommer {item.next_due_date}
          </div>
        )}
      </div>
      <button
        onClick={() => reopenItem(item.id)}
        title="Ångra"
        style={{
          border: `1px solid ${theme.colors.border}`,
          background: 'transparent',
          borderRadius: theme.radius.sm,
          padding: '0.25rem 0.5rem',
          fontSize: '0.7rem',
          color: theme.colors.textMuted,
          cursor: 'pointer',
        }}
      >
        Ångra
      </button>
    </div>
  )
}

function BrowseHistory({ items }) {
  const [expandedMonth, setExpandedMonth] = useState(null)
  const [expandedWeek, setExpandedWeek] = useState(null)

  const byMonth = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      const d = new Date(item.completed_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(item)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [items])

  const weeksInMonth = useMemo(() => {
    if (!expandedMonth) return []
    const monthItems = byMonth.find(([k]) => k === expandedMonth)?.[1] ?? []
    const map = new Map()
    for (const item of monthItems) {
      const { isoYear, week } = isoWeekInfo(new Date(item.completed_at))
      const key = `${isoYear}-v${String(week).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(item)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [expandedMonth, byMonth])

  const weekItems = weeksInMonth.find(([k]) => k === expandedWeek)?.[1] ?? []

  function toggleMonth(key) {
    setExpandedWeek(null)
    setExpandedMonth((cur) => (cur === key ? null : key))
  }

  return (
    <div style={{ marginTop: '1.5rem', borderTop: `1px solid ${theme.colors.border}`, paddingTop: '1rem' }}>
      <h3 style={{ color: theme.colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase', margin: '0 0 0.6rem' }}>
        Bläddra i historik
      </h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: expandedMonth ? '0.75rem' : 0 }}>
        {byMonth.map(([key, monthItems]) => (
          <button
            key={key}
            onClick={() => toggleMonth(key)}
            style={expandedMonth === key ? chipActive : chip}
          >
            {monthLabel(key)} ({monthItems.length})
          </button>
        ))}
      </div>

      {expandedMonth && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: expandedWeek ? '0.75rem' : 0 }}>
          {weeksInMonth.map(([key, wItems]) => (
            <button
              key={key}
              onClick={() => setExpandedWeek((cur) => (cur === key ? null : key))}
              style={expandedWeek === key ? chipActive : chip}
            >
              {key.split('-')[1]} ({wItems.length})
            </button>
          ))}
        </div>
      )}

      {expandedWeek && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {weekItems.map((item) => (
            <CompletedRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

const chip = {
  fontSize: '0.8rem',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '999px',
  padding: '0.3rem 0.7rem',
  background: theme.colors.surface,
  color: theme.colors.text,
  cursor: 'pointer',
}

const chipActive = {
  ...chip,
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  border: `1px solid ${theme.colors.primary}`,
  fontWeight: 600,
}
