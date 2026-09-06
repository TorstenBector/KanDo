// Every "what day is it" / "N days from now" computation in this app must
// use the user's LOCAL calendar day, not UTC. Date#toISOString() is always
// UTC — slicing off just the date portion silently rolls "today" over at
// UTC midnight instead of local midnight. In any positive-UTC-offset
// timezone (Sweden included: UTC+1 winter, UTC+2 summer), local midnight
// arrives *before* UTC midnight, so the app's "today" kept showing
// yesterday's date for the first 1–2 hours after the user's actual
// midnight. Every date-only value in this app should go through these
// instead of touching toISOString()/new Date(isoString) directly.

export function toLocalDateISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO() {
  return toLocalDateISO(new Date())
}

// new Date("YYYY-MM-DD") parses a date-only string as UTC midnight — the
// same class of bug as above, just on the parsing side instead of the
// output side. The multi-arg Date constructor is always local time, so
// building the date manually from its parts sidesteps it entirely.
export function parseLocalDateISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDaysISO(iso, days) {
  const d = parseLocalDateISO(iso)
  d.setDate(d.getDate() + days)
  return toLocalDateISO(d)
}

export function addMonthsISO(months, baseDate = new Date()) {
  const d = new Date(baseDate)
  d.setMonth(d.getMonth() + months)
  return toLocalDateISO(d)
}
