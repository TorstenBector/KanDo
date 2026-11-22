// Plugg: rena hjälpfunktioner för pass och tider (inga databasanrop).
// Datum som 'YYYY-MM-DD' och tider som 'HH:MM' i lokal tid — se date.js.
import { addDaysISO, parseLocalDateISO, todayISO } from './date'

export const WEEKDAYS = [
  { iso: 1, short: 'Mån', long: 'måndag' },
  { iso: 2, short: 'Tis', long: 'tisdag' },
  { iso: 3, short: 'Ons', long: 'onsdag' },
  { iso: 4, short: 'Tor', long: 'torsdag' },
  { iso: 5, short: 'Fre', long: 'fredag' },
  { iso: 6, short: 'Lör', long: 'lördag' },
  { iso: 7, short: 'Sön', long: 'söndag' },
]

// Hur långt fram pass genereras. Fylls på varje gång appen startar
// (topUpPluggSessions), så ett rullande fönster räcker.
export const GENERATE_DAYS_AHEAD = 28

// Kortet blir orange så här långt innan passet börjar.
export const HEADS_UP_MINUTES = 15

export const EXTEND_MINUTES = 10

export function isoWeekday(dateISO) {
  return ((parseLocalDateISO(dateISO).getDay() + 6) % 7) + 1
}

export function sessionStart(session) {
  const d = parseLocalDateISO(session.date)
  const [h, m] = session.start_time.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d
}

export function targetSeconds(session) {
  return ((session.planned_minutes ?? 0) + (session.extra_minutes ?? 0)) * 60
}

export function elapsedSeconds(session, nowMs = Date.now()) {
  if (!session.started_at) return 0
  const end = session.paused_at ? Date.parse(session.paused_at) : nowMs
  return Math.max(0, Math.floor((end - Date.parse(session.started_at)) / 1000) - (session.paused_seconds ?? 0))
}

// Vad passet "är" just nu, för färg och knappar:
//   klar      – klarmarkerat
//   pagar     – timern går
//   pausad    – startat men pausat
//   tidenUte  – startat och måltiden nådd, väntar på Klar / Kör 10 min till
//   missad    – en tidigare dag, aldrig klarmarkerat
//   snart     – 15 min innan start och framåt (orange), inte startat
//   planerad  – längre fram
export function sessionPhase(session, nowMs = Date.now()) {
  if (session.status === 'klar') return 'klar'
  if (session.status === 'pagar') {
    if (elapsedSeconds(session, nowMs) >= targetSeconds(session)) return 'tidenUte'
    return session.paused_at ? 'pausad' : 'pagar'
  }
  if (session.date < todayISO()) return 'missad'
  if (sessionStart(session).getTime() - nowMs <= HEADS_UP_MINUTES * 60 * 1000) return 'snart'
  return 'planerad'
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const rest = String(s % 60).padStart(2, '0')
  return `${m}:${rest}`
}

export function formatMinutes(seconds) {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${rest} min` : `${h} h`
}

export function describeSlot(slot) {
  const days = WEEKDAYS.filter((w) => slot.weekdays?.includes(w.iso)).map((w) => w.short).join(', ')
  return `${days} ${slot.time} · ${slot.minutes} min`
}

// Alla pass schemat ger mellan from och to (inklusive), som
// { date, start_time, planned_minutes }. Samma dag och tid från två rader
// i schemat blir ett pass (den längsta vinner).
export function expandSchedule(schedule, fromISO, toISO) {
  const byKey = new Map()
  for (let date = fromISO; date <= toISO; date = addDaysISO(date, 1)) {
    const wd = isoWeekday(date)
    for (const slot of schedule ?? []) {
      if (!slot?.weekdays?.includes(wd) || !slot.time || !(slot.minutes > 0)) continue
      const key = `${date}|${slot.time}`
      const prev = byKey.get(key)
      if (!prev || slot.minutes > prev.planned_minutes) {
        byKey.set(key, { date, start_time: slot.time, planned_minutes: Number(slot.minutes) })
      }
    }
  }
  return [...byKey.values()]
}

// Fönstret pass genereras inom: idag till provdagen (eller fönstrets slut).
export function generationWindow(activity, today = todayISO()) {
  const horizon = addDaysISO(today, GENERATE_DAYS_AHEAD - 1)
  const to = activity.end_date && activity.end_date < horizon ? activity.end_date : horizon
  return { from: today, to }
}

// Deterministiskt UUID ur en sträng (SHA-256, formaterat som v5-liknande
// UUID) — samma pass får samma id på alla enheter.
export async function stableUuid(input) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function sessionKey(activityId, date, time) {
  return `plugg|${activityId}|${date}|${time}`
}

export function daysUntil(dateISO) {
  const ms = parseLocalDateISO(dateISO) - parseLocalDateISO(todayISO())
  return Math.round(ms / 86400000)
}

export function nowTimeHHMM(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
