// plugg-push: pushnotiser för KanDo Plugg.
//
//   action "tick"    – anropas varje minut av pg_cron (x-cron-secret). Skickar
//                      påminnelse 15 min före obekräftade pass och "tiden är
//                      ute" när ett pågående pass nått sin måltid.
//   action "test"    – inloggad användare skickar en testnotis till sina enheter.
//   action "confirm" – "Det ska jag komma ihåg" från notisens knapp (Android/
//                      dator; iPhone visar inga knappar). Signerad token i
//                      notisen i stället för inloggning, eftersom service
//                      workern inte har användarens session.
//
// Deployas med verify_jwt = false (cron och service worker har ingen JWT);
// varje action kontrollerar själv sin behörighet.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { bytesToB64url, sendWebPush, type VapidKeys } from '../_shared/webpush.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const REMINDER_MINUTES = 15
const FUNCTION_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/plugg-push`

const vapid: VapidKeys = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!,
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!,
  subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@kando.nu',
}
const cronSecret = Deno.env.get('PLUGG_CRON_SECRET')!

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function confirmToken(sessionId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(cronSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`confirm:${sessionId}`)))
  return bytesToB64url(sig)
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

// Skickar till alla användarens enheter; städar bort döda prenumerationer.
async function pushToUser(userId: string, data: Record<string, unknown>, subsByUser: Map<string, Sub[]>) {
  const subs = subsByUser.get(userId) ?? []
  let delivered = 0
  for (const sub of subs) {
    try {
      const res = await sendWebPush(sub, data, vapid)
      if (res.ok) {
        delivered++
        await supabase.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sub.id)
      } else if (res.gone) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        console.error('[plugg-push] push misslyckades', res.status, res.text)
      }
    } catch (err) {
      console.error('[plugg-push] push-fel', (err as Error).message)
    }
  }
  return delivered
}

async function loadSubs(userIds: string[]) {
  const map = new Map<string, Sub[]>()
  if (userIds.length === 0) return map
  const { data, error } = await supabase.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').in('user_id', userIds)
  if (error) throw error
  for (const s of data ?? []) {
    if (!map.has(s.user_id)) map.set(s.user_id, [])
    map.get(s.user_id)!.push(s)
  }
  return map
}

async function loadActivityTitles(ids: string[]) {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const { data } = await supabase.from('plugg_activities').select('id,title').in('id', ids)
  for (const a of data ?? []) map.set(a.id, a.title)
  return map
}

async function tick() {
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  // 1) Påminnelser: obekräftade pass som börjar inom 15 min (inte äldre än
  //    10 min efter start — ett nyss upplagt pass ska inte ge gamla notiser).
  const { data: due, error: dueErr } = await supabase
    .from('plugg_sessions')
    .select('id,user_id,activity_id,start_time,planned_minutes,starts_at')
    .eq('status', 'planerad')
    .is('confirmed_at', null)
    .is('reminder_sent_at', null)
    .lte('starts_at', iso(now + REMINDER_MINUTES * 60000))
    .gte('starts_at', iso(now - 10 * 60000))
  if (dueErr) throw dueErr

  // 2) Pågående pass (ej pausade) — "tiden är ute" räknas ut här.
  const { data: running, error: runErr } = await supabase
    .from('plugg_sessions')
    .select('id,user_id,activity_id,planned_minutes,extra_minutes,started_at,paused_at,paused_seconds,done_notified_target')
    .eq('status', 'pagar')
    .is('paused_at', null)
    .not('started_at', 'is', null)
  if (runErr) throw runErr

  const finished = (running ?? []).filter((s) => {
    const targetMin = (s.planned_minutes ?? 0) + (s.extra_minutes ?? 0)
    const elapsed = (now - Date.parse(s.started_at)) / 1000 - (s.paused_seconds ?? 0)
    const over = elapsed - targetMin * 60
    // Bara strax efter måltiden — ett pass som blivit liggande i timmar ska inte pinga.
    return over >= 0 && over < 30 * 60 && s.done_notified_target !== targetMin
  })

  const all = [...(due ?? []), ...finished]
  if (all.length === 0) return { reminders: 0, done: 0 }
  const subsByUser = await loadSubs([...new Set(all.map((s) => s.user_id))])
  const titles = await loadActivityTitles([...new Set(all.map((s) => s.activity_id))])

  let reminders = 0
  for (const s of due ?? []) {
    // Markera först (villkorat) så två samtidiga körningar inte båda skickar.
    const { data: claimed } = await supabase
      .from('plugg_sessions')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', s.id)
      .is('reminder_sent_at', null)
      .select('id')
    if (!claimed?.length) continue
    const minutesLeft = Math.max(0, Math.round((Date.parse(s.starts_at) - now) / 60000))
    const title = titles.get(s.activity_id) ?? 'Plugg'
    await pushToUser(s.user_id, {
      kind: 'reminder',
      title: `📚 ${title} kl ${s.start_time}`,
      body: minutesLeft > 0
        ? `Om ${minutesLeft} min · ${s.planned_minutes} min plugg. Tryck för att bekräfta.`
        : `Dags nu · ${s.planned_minutes} min plugg. Tryck för att bekräfta.`,
      tag: `plugg-${s.id}`,
      url: `/?plugg=${s.id}&bekrafta=1`,
      sessionId: s.id,
      confirmUrl: FUNCTION_URL,
      confirmToken: await confirmToken(s.id),
      actions: [{ action: 'confirm', title: 'Det ska jag komma ihåg' }],
    }, subsByUser)
    reminders++
  }

  let done = 0
  for (const s of finished) {
    const targetMin = (s.planned_minutes ?? 0) + (s.extra_minutes ?? 0)
    const { data: claimed } = await supabase
      .from('plugg_sessions')
      .update({ done_notified_target: targetMin })
      .eq('id', s.id)
      .or(`done_notified_target.is.null,done_notified_target.neq.${targetMin}`)
      .select('id')
    if (!claimed?.length) continue
    const title = titles.get(s.activity_id) ?? 'Plugg'
    await pushToUser(s.user_id, {
      kind: 'done',
      title: `🎉 Tiden är ute! ${title}`,
      body: `${targetMin} min klart. Öppna KanDo och välj Klar eller kör 10 min till.`,
      tag: `plugg-${s.id}`,
      url: `/?plugg=${s.id}`,
      sessionId: s.id,
    }, subsByUser)
    done++
  }
  return { reminders, done }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action ?? 'tick'

    if (action === 'tick') {
      if (!safeEqual(req.headers.get('x-cron-secret') ?? '', cronSecret)) return json({ error: 'forbidden' }, 403)
      return json({ ok: true, ...(await tick()) })
    }

    if (action === 'confirm') {
      const { sessionId, token } = body
      if (typeof sessionId !== 'string' || typeof token !== 'string' || !safeEqual(token, await confirmToken(sessionId))) {
        return json({ error: 'forbidden' }, 403)
      }
      await supabase
        .from('plugg_sessions')
        .update({ confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .is('confirmed_at', null)
      return json({ ok: true })
    }

    if (action === 'test') {
      const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
      const { data: { user } } = await supabase.auth.getUser(jwt)
      if (!user) return json({ error: 'Du behöver vara inloggad' }, 401)
      const subsByUser = await loadSubs([user.id])
      const delivered = await pushToUser(user.id, {
        kind: 'test',
        title: '🔔 KanDo-notiser fungerar!',
        body: 'Så här ser en påminnelse ut inför ett pluggpass.',
        tag: 'kando-test',
        url: '/?plugg=test',
      }, subsByUser)
      return json({ ok: true, devices: subsByUser.get(user.id)?.length ?? 0, delivered })
    }

    return json({ error: 'okänd action' }, 400)
  } catch (error) {
    console.error('[plugg-push] Fel:', (error as Error).message)
    return json({ error: (error as Error).message }, 500)
  }
})
