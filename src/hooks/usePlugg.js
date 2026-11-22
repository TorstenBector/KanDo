// Plugg: aktiviteter och pass. Allt skrivs först till Dexie (pending) och
// pushas sen, precis som items — se sync.js (pushPlugg/pullPlugg).
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { supabase } from '../lib/supabaseClient'
import { useSyncStore } from '../store/syncStore'
import { todayISO } from '../lib/date'
import { EXTEND_MINUTES, elapsedSeconds, expandSchedule, generationWindow, nowTimeHHMM, sessionKey, stableUuid } from '../lib/plugg'

function triggerPush() {
  useSyncStore.getState().pushOnly()
}

function currentUserId() {
  return useSyncStore.getState().session?.user?.id ?? null
}

function deleteRemote(table, ids) {
  if (!ids.length || !useSyncStore.getState().session) return
  // Best-effort som övriga raderingar: lokalt är redan rätt, och en annan
  // enhets pull städar bort sina kopior när raderna saknas på servern.
  supabase.from(table).delete().in('id', ids).then(() => {}, () => {})
}

async function writeRow(table, id, changes) {
  await db[table].update(id, { ...changes, updated_at: new Date().toISOString(), _syncStatus: 'pending' })
}

export function usePluggActivities() {
  return useLiveQuery(async () => {
    const all = await db.plugg_activities.toArray()
    return all.sort((a, b) => (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999') || a.created_at.localeCompare(b.created_at))
  }, [])
}

export function usePluggSessionsOn(dateISO) {
  return useLiveQuery(async () => {
    const sessions = await db.plugg_sessions.where('date').equals(dateISO).toArray()
    return sessions.sort((a, b) => a.start_time.localeCompare(b.start_time))
  }, [dateISO])
}

export function usePluggSessionsFor(activityId) {
  return useLiveQuery(async () => {
    if (!activityId) return []
    const sessions = await db.plugg_sessions.where('activity_id').equals(activityId).toArray()
    return sessions.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
  }, [activityId])
}

// Pass och aktiviteter för en dag, som par — för Dagens Fokus och Plugg.
export function usePluggDay(dateISO) {
  return useLiveQuery(async () => {
    const sessions = await db.plugg_sessions.where('date').equals(dateISO).toArray()
    if (sessions.length === 0) return []
    const activities = await db.plugg_activities.bulkGet([...new Set(sessions.map((s) => s.activity_id))])
    const byId = new Map(activities.filter(Boolean).map((a) => [a.id, a]))
    return sessions
      .filter((s) => byId.has(s.activity_id))
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((session) => ({ session, activity: byId.get(session.activity_id) }))
  }, [dateISO])
}

// Synkar en aktivitets kommande pass mot schemat: lägger till saknade,
// uppdaterar längd på ej startade, tar bort ej startade som inte längre
// finns i schemat. Startade, klara och tidigare pass rörs aldrig.
export async function syncActivitySessions(activityId) {
  const activity = await db.plugg_activities.get(activityId)
  if (!activity) return
  const today = todayISO()
  const nowHHMM = nowTimeHHMM()
  const { from, to } = generationWindow(activity, today)
  const wanted = activity.archived_at || to < from ? [] : expandSchedule(activity.schedule, from, to)

  const existing = await db.plugg_sessions.where('activity_id').equals(activityId).toArray()
  const existingById = new Map(existing.map((s) => [s.id, s]))
  const wantedIds = new Set()
  const now = new Date().toISOString()
  const userId = activity.user_id ?? currentUserId()
  const toAdd = []

  for (const w of wanted) {
    const id = await stableUuid(sessionKey(activityId, w.date, w.start_time))
    wantedIds.add(id)
    const current = existingById.get(id)
    if (current) {
      if (current.status === 'planerad' && current.planned_minutes !== w.planned_minutes) {
        await writeRow('plugg_sessions', id, { planned_minutes: w.planned_minutes })
      }
      continue
    }
    // Ett nytt schema ska inte skapa pass som redan borde ha startat idag.
    if (w.date === today && w.start_time < nowHHMM) continue
    toAdd.push({
      id,
      user_id: userId,
      activity_id: activityId,
      date: w.date,
      start_time: w.start_time,
      planned_minutes: w.planned_minutes,
      extra_minutes: 0,
      status: 'planerad',
      started_at: null,
      paused_at: null,
      paused_seconds: 0,
      completed_at: null,
      actual_seconds: null,
      confirmed_at: null,
      created_at: now,
      updated_at: now,
      _syncStatus: 'pending',
    })
  }
  if (toAdd.length) await db.plugg_sessions.bulkPut(toAdd)

  const stale = existing
    .filter((s) => s.date >= today && s.status === 'planerad' && !wantedIds.has(s.id))
    .map((s) => s.id)
  if (stale.length) {
    await db.plugg_sessions.bulkDelete(stale)
    deleteRemote('plugg_sessions', stale)
  }
}

// Körs vid uppstart (efter första synken): fyller på det rullande fönstret.
export async function topUpPluggSessions() {
  const activities = await db.plugg_activities.toArray()
  for (const a of activities) {
    if (a.archived_at) continue
    await syncActivitySessions(a.id)
  }
  triggerPush()
}

export async function createActivity({ title, description, end_date, schedule }) {
  const now = new Date().toISOString()
  const activity = {
    id: crypto.randomUUID(),
    user_id: currentUserId(),
    title: title.trim(),
    description: description?.trim() || null,
    end_date: end_date || null,
    schedule,
    archived_at: null,
    created_at: now,
    updated_at: now,
    _syncStatus: 'pending',
  }
  await db.plugg_activities.add(activity)
  await syncActivitySessions(activity.id)
  triggerPush()
  return activity
}

export async function updateActivity(id, { title, description, end_date, schedule }) {
  await writeRow('plugg_activities', id, {
    title: title.trim(),
    description: description?.trim() || null,
    end_date: end_date || null,
    schedule,
  })
  await syncActivitySessions(id)
  triggerPush()
}

export async function setActivityArchived(id, archived) {
  await writeRow('plugg_activities', id, { archived_at: archived ? new Date().toISOString() : null })
  await syncActivitySessions(id)
  triggerPush()
}

export async function deleteActivity(id) {
  const sessionIds = await db.plugg_sessions.where('activity_id').equals(id).primaryKeys()
  await db.plugg_sessions.bulkDelete(sessionIds)
  await db.plugg_activities.delete(id)
  // Passen följer med på servern (on delete cascade).
  deleteRemote('plugg_activities', [id])
}

// ---- Passets timer ----

export async function startSession(id) {
  const session = await db.plugg_sessions.get(id)
  if (!session) return
  const now = new Date().toISOString()
  await writeRow('plugg_sessions', id, {
    status: 'pagar',
    started_at: now,
    paused_at: null,
    paused_seconds: 0,
    extra_minutes: 0,
    completed_at: null,
    actual_seconds: null,
    // Att starta räknas som att ha bekräftat påminnelsen.
    confirmed_at: session.confirmed_at ?? now,
  })
  triggerPush()
}

export async function pauseSession(id) {
  await writeRow('plugg_sessions', id, { paused_at: new Date().toISOString() })
  triggerPush()
}

export async function resumeSession(id) {
  const session = await db.plugg_sessions.get(id)
  if (!session?.paused_at) return
  const pausedFor = Math.max(0, Math.floor((Date.now() - Date.parse(session.paused_at)) / 1000))
  await writeRow('plugg_sessions', id, {
    paused_at: null,
    paused_seconds: (session.paused_seconds ?? 0) + pausedFor,
  })
  triggerPush()
}

export async function extendSession(id) {
  const session = await db.plugg_sessions.get(id)
  if (!session) return
  await writeRow('plugg_sessions', id, { extra_minutes: (session.extra_minutes ?? 0) + EXTEND_MINUTES })
  triggerPush()
}

// Han klarmarkerar själv — med eller utan timer.
export async function completeSession(id) {
  const session = await db.plugg_sessions.get(id)
  if (!session) return
  const now = new Date().toISOString()
  await writeRow('plugg_sessions', id, {
    status: 'klar',
    completed_at: now,
    actual_seconds: session.started_at ? elapsedSeconds(session) : null,
    paused_at: null,
  })
  triggerPush()
}

export async function resetSession(id) {
  await writeRow('plugg_sessions', id, {
    status: 'planerad',
    started_at: null,
    paused_at: null,
    paused_seconds: 0,
    extra_minutes: 0,
    completed_at: null,
    actual_seconds: null,
  })
  triggerPush()
}
