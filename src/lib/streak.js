// Streak: utmaningar + avbockningar (online-only via RPC:er, se
// supabase/migrations/20261123040000_streak.sql) och streakberäkning.
import { supabase } from './supabaseClient'
import { addDaysISO, parseLocalDateISO } from './date'

function fail(error) {
  throw new Error(error.message || 'Något gick fel')
}

export async function loadStreaks() {
  const { data, error } = await supabase.rpc('streak_overview')
  if (error) fail(error)
  return data ?? []
}

export async function createChallenge({ title, emoji, weekdays }) {
  const { data, error } = await supabase.rpc('create_streak_challenge', { p_title: title, p_emoji: emoji, p_weekdays: weekdays })
  if (error) fail(error)
  return data
}

export async function inviteToChallenge(challengeId, userId) {
  const { error } = await supabase.rpc('invite_to_streak', { p_challenge: challengeId, p_user: userId })
  if (error) fail(error)
  // Pushnotis till den inbjudna — best-effort.
  supabase.functions.invoke('plugg-push', { body: { action: 'streak-invite', challengeId, userId } }).catch(() => {})
}

export async function respondInvite(challengeId, accept) {
  const { error } = await supabase.rpc('respond_streak_invite', { p_challenge: challengeId, p_accept: accept })
  if (error) fail(error)
}

export async function checkIn(challengeId, dayISO, done) {
  const { error } = await supabase.rpc('checkin_streak', { p_challenge: challengeId, p_day: dayISO, p_done: done })
  if (error) fail(error)
  // Uppmuntran till vännerna: "X har gjort dagens!" — bara när man bockar av.
  if (done) supabase.functions.invoke('plugg-push', { body: { action: 'streak-checkin', challengeId, day: dayISO } }).catch(() => {})
}

export async function leaveChallenge(challengeId) {
  const { error } = await supabase.rpc('leave_streak', { p_challenge: challengeId })
  if (error) fail(error)
}

// ---- Beräkning ----

function isoWeekday(dateISO) {
  return ((parseLocalDateISO(dateISO).getDay() + 6) % 7) + 1
}

export function isScheduled(dateISO, weekdays) {
  return !weekdays?.length || weekdays.includes(isoWeekday(dateISO))
}

// Nuvarande streak: antal schemalagda dagar i rad med avbockning, bakåt
// från idag. Idag som inte är gjord än bryter inte streaken (dagen är inte
// slut) — den räknas bara inte.
export function currentStreak(days, weekdays, todayISO) {
  const done = new Set(days)
  let count = 0
  let date = todayISO
  for (let i = 0; i < 400; i++) {
    if (isScheduled(date, weekdays)) {
      if (done.has(date)) count++
      else if (date !== todayISO) break
    }
    date = addDaysISO(date, -1)
  }
  return count
}

export function bestStreak(days, weekdays, todayISO) {
  if (!days.length) return 0
  const done = new Set(days)
  const first = [...days].sort()[0]
  let best = 0
  let run = 0
  for (let date = first; date <= todayISO; date = addDaysISO(date, 1)) {
    if (!isScheduled(date, weekdays)) continue
    if (done.has(date)) {
      run++
      best = Math.max(best, run)
    } else if (date !== todayISO) {
      run = 0
    }
  }
  return best
}

export function lastNDays(todayISO, n) {
  const out = []
  for (let i = n - 1; i >= 0; i--) out.push(addDaysISO(todayISO, -i))
  return out
}

export function describeWeekdays(weekdays) {
  if (!weekdays?.length || weekdays.length === 7) return 'Varje dag'
  const names = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön']
  return [...weekdays].sort().map((d) => names[d - 1]).join(', ')
}
