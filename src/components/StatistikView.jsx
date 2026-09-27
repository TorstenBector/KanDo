import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { sortTagsByOrder } from '../hooks/useTags'
import { todayISO, addDaysISO, parseLocalDateISO, toLocalDateISO } from '../lib/date'
import { theme } from '../theme'

// Statistik/Trend (KanDo Vibe #7413): utförda KanDo's per dag, två veckor
// åt gången, staplade per tagg.
//
// Regler (bestämda med Torsten):
// - En KanDo räknas EN gång — under sin första toppnivåtagg i taggordningen
//   (Tagghantering). En undertagg ger ändå träff via föräldern, eftersom
//   addItemTag alltid lägger på föräldertaggen också.
// - Allt som klarmarkerats den dagen räknas, inte bara Dagens Fokus.
// - Återkommande KanDo's återaktiveras med completed_at = null men behåller
//   last_completed_at — de räknas på sin senaste klarmarkering (appen
//   sparar ingen historik över tidigare varv).
//
// Färger: validerad kategorisk palett (dataviz-skillens referens, kollad
// mot appens yta #EDE8D5 — alla kontroller PASS, kontrast-WARN för fyra
// färger → tabellen under diagrammet är avlastningen). De sju taggar med
// flest utförda KanDo's TOTALT (inte bara i perioden) får färg, i
// taggordning — så en tagg byter inte färg när man bläddrar mellan
// perioder, och de taggar man faktiskt jobbar mest i hamnar inte i
// "Övrigt" bara för att de ligger sist i Tagghantering. Resten, och
// otaggade, samlas i "Övrigt".
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7']
const OTHER = { id: '__other', name: 'Övrigt', color: '#9c9888' }
const WINDOW_DAYS = 14

function completionDay(item) {
  if (item.status === 'klar' && item.completed_at) return toLocalDateISO(new Date(item.completed_at))
  const recurring = item.recurrence_days || item.recurrence_weekdays?.length
  if (recurring && item.last_completed_at) return toLocalDateISO(new Date(item.last_completed_at))
  return null
}

function dayLabel(iso) {
  const d = parseLocalDateISO(iso)
  return {
    weekday: d.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', ''),
    date: d.getDate(),
    long: d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }),
  }
}

export default function StatistikView() {
  const [endDate, setEndDate] = useState(todayISO)
  const [selectedDay, setSelectedDay] = useState(null)
  const startDate = addDaysISO(endDate, -(WINDOW_DAYS - 1))
  const isCurrent = endDate >= todayISO()

  const data = useLiveQuery(async () => {
    const [items, tags, links] = await Promise.all([db.items.toArray(), db.tags.toArray(), db.item_tags.toArray()])
    return { items, tags, links }
  }, [])

  const { days, series, maxTotal } = useMemo(() => {
    const dayList = Array.from({ length: WINDOW_DAYS }, (_, i) => addDaysISO(startDate, i))
    if (!data) return { days: dayList.map((iso) => ({ iso, total: 0, counts: new Map() })), series: [], maxTotal: 0 }

    const topLevel = sortTagsByOrder(data.tags.filter((t) => !t.parent_tag_id))
    const rank = new Map(topLevel.map((t, i) => [t.id, i]))
    const tagIdsByItem = new Map()
    for (const l of data.links) {
      if (!rank.has(l.tag_id)) continue
      if (!tagIdsByItem.has(l.item_id)) tagIdsByItem.set(l.item_id, [])
      tagIdsByItem.get(l.item_id).push(l.tag_id)
    }
    for (const ids of tagIdsByItem.values()) ids.sort((a, b) => rank.get(a) - rank.get(b))

    // Primär tagg per utförd KanDo, över all historik — styr vilka som får färg.
    const primaryByItem = new Map()
    const allTimeCount = new Map()
    for (const item of data.items) {
      if (!completionDay(item)) continue
      const primary = tagIdsByItem.get(item.id)?.[0]
      if (!primary) continue
      primaryByItem.set(item.id, primary)
      allTimeCount.set(primary, (allTimeCount.get(primary) ?? 0) + 1)
    }
    const colored = topLevel
      .filter((t) => allTimeCount.has(t.id))
      .sort((a, b) => allTimeCount.get(b.id) - allTimeCount.get(a.id) || rank.get(a.id) - rank.get(b.id))
      .slice(0, SERIES_COLORS.length)
      .sort((a, b) => rank.get(a.id) - rank.get(b.id))
    const colorByTag = new Map(colored.map((t, i) => [t.id, SERIES_COLORS[i]]))

    const byDay = new Map(dayList.map((iso) => [iso, new Map()]))
    for (const item of data.items) {
      const day = completionDay(item)
      if (!day || !byDay.has(day)) continue
      const primary = primaryByItem.get(item.id)
      const key = primary && colorByTag.has(primary) ? primary : OTHER.id
      const counts = byDay.get(day)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const used = new Set()
    for (const counts of byDay.values()) for (const k of counts.keys()) used.add(k)
    const seriesList = [
      ...topLevel.filter((t) => used.has(t.id) && colorByTag.has(t.id)).map((t) => ({ id: t.id, name: t.name, color: colorByTag.get(t.id) })),
      ...(used.has(OTHER.id) ? [OTHER] : []),
    ]
    const dayRows = dayList.map((iso) => {
      const counts = byDay.get(iso)
      let total = 0
      for (const v of counts.values()) total += v
      return { iso, total, counts }
    })
    return { days: dayRows, series: seriesList, maxTotal: Math.max(0, ...dayRows.map((d) => d.total)) }
  }, [data, startDate])

  const periodTotal = days.reduce((sum, d) => sum + d.total, 0)
  const selected = days.find((d) => d.iso === selectedDay)

  return (
    <div style={{ padding: '1rem', maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button onClick={() => { setEndDate(addDaysISO(endDate, -WINDOW_DAYS)); setSelectedDay(null) }} style={navBtn} aria-label="Föregående två veckor">‹</button>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 600, color: theme.colors.text, fontSize: '0.9rem' }}>
          {dayLabel(startDate).date}/{parseLocalDateISO(startDate).getMonth() + 1} – {dayLabel(endDate).date}/{parseLocalDateISO(endDate).getMonth() + 1}
        </span>
        <button
          onClick={() => { setEndDate(addDaysISO(endDate, WINDOW_DAYS)); setSelectedDay(null) }}
          disabled={isCurrent}
          style={{ ...navBtn, opacity: isCurrent ? 0.35 : 1, cursor: isCurrent ? 'default' : 'pointer' }}
          aria-label="Nästa två veckor"
        >
          ›
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem', color: theme.colors.textMuted, fontSize: '0.85rem' }}>
        <span style={{ fontSize: '1.6rem', fontWeight: 700, color: theme.colors.text }}>{periodTotal}</span>
        <span>utförda · snitt {(periodTotal / WINDOW_DAYS).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} per dag</span>
      </div>

      {series.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.9rem', marginBottom: '0.6rem' }}>
          {series.map((s) => (
            <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: theme.colors.text }}>
              <span style={{ width: '0.75rem', height: '0.75rem', borderRadius: '3px', background: s.color, flexShrink: 0 }} />
              {s.name}
            </span>
          ))}
        </div>
      )}

      <div style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '0.75rem 0.5rem 0.5rem' }}>
        {periodTotal === 0 ? (
          <p style={{ color: theme.colors.textMuted, textAlign: 'center', margin: '2rem 0' }}>Inga utförda KanDo's under de här två veckorna.</p>
        ) : (
          <BarChart days={days} series={series} maxTotal={maxTotal} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        )}
      </div>

      {selected && (
        <div style={{ marginTop: '0.6rem', background: theme.colors.bg, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '0.6rem 0.8rem', fontSize: '0.85rem', color: theme.colors.text }}>
          <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>
            {dayLabel(selected.iso).long.replace(/^./, (c) => c.toUpperCase())} — {selected.total} utförda
          </div>
          {series.filter((s) => selected.counts.get(s.id)).map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: '0.65rem', height: '0.65rem', borderRadius: '2px', background: s.color }} />
              <span style={{ flex: 1 }}>{s.name}</span>
              <span style={{ fontWeight: 600 }}>{selected.counts.get(s.id)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabellvyn — avlastning för färger med låg kontrast och för den som
          vill ha siffrorna, inte bara staplarna. */}
      {series.length > 0 && (
        <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse', fontSize: '0.85rem', color: theme.colors.text }}>
          <thead>
            <tr style={{ color: theme.colors.textMuted, textAlign: 'left' }}>
              <th style={thStyle}>Tagg</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Utförda</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Andel</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => {
              const count = days.reduce((sum, d) => sum + (d.counts.get(s.id) ?? 0), 0)
              return (
                <tr key={s.id} style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-block', width: '0.65rem', height: '0.65rem', borderRadius: '2px', background: s.color, marginRight: '0.4rem' }} />
                    {s.name}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{count}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: theme.colors.textMuted }}>{Math.round((count / periodTotal) * 100)} %</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p style={{ color: theme.colors.textMuted, fontSize: '0.75rem', marginTop: '0.75rem' }}>
        Varje KanDo räknas en gång, under sin första tagg i taggordningen. Tryck på en stapel för detaljer.
      </p>
    </div>
  )
}

const CHART_H = 180
const LABEL_H = 34
const TOP_PAD = 18

// Ritas i sin faktiska pixelbredd (inte en fast viewBox som skalas), så
// att etiketterna får samma storlek i mobilen som på datorn.
function BarChart(props) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return <div ref={ref}>{width > 0 && <BarChartSvg {...props} W={width} />}</div>
}

function BarChartSvg({ days, series, maxTotal, selectedDay, onSelectDay, W }) {
  const slot = W / days.length
  const barW = Math.min(28, slot * 0.6)
  const scaleMax = Math.max(1, niceMax(maxTotal))
  const y = (v) => TOP_PAD + CHART_H - (v / scaleMax) * CHART_H
  const gridSteps = [0, 0.5, 1].map((f) => Math.round(scaleMax * f))

  return (
    <svg viewBox={`0 0 ${W} ${TOP_PAD + CHART_H + LABEL_H}`} width={W} height={TOP_PAD + CHART_H + LABEL_H} style={{ display: 'block' }} role="img" aria-label="Utförda KanDo's per dag">
      {gridSteps.map((v) => (
        <g key={v}>
          <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke={theme.colors.border} strokeWidth={1} />
          {v > 0 && <text x={2} y={y(v) - 3} fontSize={11} fill={theme.colors.textMuted}>{v}</text>}
        </g>
      ))}
      {days.map((d, i) => {
        const cx = slot * i + slot / 2
        const x = cx - barW / 2
        const isToday = d.iso === todayISO()
        const isSelected = d.iso === selectedDay
        let acc = 0
        const segs = series.filter((s) => d.counts.get(s.id)).map((s) => {
          const v = d.counts.get(s.id)
          const seg = { s, from: acc, to: acc + v }
          acc += v
          return seg
        })
        const { weekday, date } = dayLabel(d.iso)
        return (
          <g key={d.iso} onClick={() => onSelectDay(isSelected ? null : d.iso)} style={{ cursor: d.total ? 'pointer' : 'default' }}>
            {/* Träffyta större än stapeln — hela kolumnen går att trycka på. */}
            <rect x={slot * i} y={0} width={slot} height={TOP_PAD + CHART_H + LABEL_H} fill={isSelected ? 'rgba(45,106,45,0.08)' : 'transparent'} />
            {segs.map(({ s, from, to }, idx) => {
              const top = idx === segs.length - 1
              const yTop = y(to)
              // 2px ytgap mellan staplade segment.
              const h = Math.max(0, y(from) - yTop - (idx > 0 ? 2 : 0))
              return top ? (
                <path key={s.id} d={roundedTop(x, yTop, barW, h, Math.min(4, h))} fill={s.color} />
              ) : (
                <rect key={s.id} x={x} y={yTop} width={barW} height={h} fill={s.color} />
              )
            })}
            {d.total > 0 && (
              <text x={cx} y={y(d.total) - 5} textAnchor="middle" fontSize={12} fontWeight={600} fill={theme.colors.text}>{d.total}</text>
            )}
            <text x={cx} y={TOP_PAD + CHART_H + 14} textAnchor="middle" fontSize={11} fill={isToday ? theme.colors.primary : theme.colors.textMuted} fontWeight={isToday ? 700 : 400}>{weekday}</text>
            <text x={cx} y={TOP_PAD + CHART_H + 28} textAnchor="middle" fontSize={11} fill={isToday ? theme.colors.primary : theme.colors.textMuted} fontWeight={isToday ? 700 : 400}>{date}</text>
          </g>
        )
      })}
    </svg>
  )
}

function niceMax(v) {
  if (v <= 4) return 4
  if (v <= 10) return Math.ceil(v / 2) * 2
  return Math.ceil(v / 5) * 5
}

function roundedTop(x, y, w, h, r) {
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
}

const navBtn = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  color: theme.colors.text,
  borderRadius: theme.radius.sm,
  width: '2rem',
  height: '2rem',
  cursor: 'pointer',
  fontSize: '1rem',
}

const thStyle = { fontWeight: 600, fontSize: '0.75rem', padding: '0.3rem 0.2rem' }
const tdStyle = { padding: '0.35rem 0.2rem' }
