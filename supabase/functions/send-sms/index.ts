// send-sms: KanDo-användare skickar SMS via SMSbang-telefonen, som hämtar sin
// kö från Jaktkoll-projektet. Den här funktionen kontrollerar inloggningen och
// lämnar SMS:et vidare till Jaktkolls sms-enqueue med KanDos hemliga nyckel
// (SMSBANG_API_KEY) — nyckeln får aldrig ligga i webbläsaren.
// Spärr per användare/dygn sköts av sms-enqueue.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(jwt)
    if (!user) return json({ error: 'Du behöver vara inloggad' }, 401)

    const { phone, name, message } = await req.json()

    const res = await fetch(Deno.env.get('SMSBANG_ENQUEUE_URL')!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': Deno.env.get('SMSBANG_API_KEY')!,
        // Supabase-gatewayen i Jaktkoll-projektet kräver projektets anon-nyckel.
        'apikey': Deno.env.get('SMSBANG_ANON_KEY')!,
        'Authorization': `Bearer ${Deno.env.get('SMSBANG_ANON_KEY')}`,
      },
      body: JSON.stringify({ clientId: 'kando', userId: user.id, mobile: phone, message }),
    })
    const result = await res.json().catch(() => ({ error: 'Oväntat svar från SMS-tjänsten' }))
    if (!res.ok) return json({ error: result.error || 'SMS kunde inte skickas' }, res.status)

    // Spara/uppdatera kontakten så den hamnar överst nästa gång.
    const cleanPhone = String(phone).replace(/[\s\-()]/g, '')
    await supabase.from('kando_sms_contacts').upsert(
      { user_id: user.id, phone: cleanPhone, name: (name || '').trim() || cleanPhone, last_used_at: new Date().toISOString() },
      { onConflict: 'user_id,phone' },
    )

    return json({ ok: true, remainingToday: result.remainingToday })
  } catch (error) {
    console.error('[send-sms] Fel:', (error as Error).message)
    return json({ error: (error as Error).message }, 400)
  }
})
