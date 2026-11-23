// Läget för SMSbang-telefonen (Jaktkoll-projektets sms-status) — samma
// nyckel som sms-enqueue. Används av send-sms (varning i SMS-rutan) och
// plugg-push (larm när telefonen varit tyst länge).

export type SmsGatewayStatus = {
  online: boolean
  gateways: { gatewayId: string; lastSeenUtc: string | null; secondsSinceSeen: number | null; batteryPct: number | null; charging: boolean | null; network: string | null }[]
  pending: { total: number; oldestUtc: string | null }
  mine?: { pending: number }
}

export async function fetchSmsStatus(userId?: string): Promise<SmsGatewayStatus> {
  const enqueueUrl = Deno.env.get('SMSBANG_ENQUEUE_URL')!
  const url = enqueueUrl.replace(/sms-enqueue\/?$/, 'sms-status')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': Deno.env.get('SMSBANG_API_KEY')!,
      apikey: Deno.env.get('SMSBANG_ANON_KEY')!,
      Authorization: `Bearer ${Deno.env.get('SMSBANG_ANON_KEY')}`,
    },
    body: JSON.stringify({ clientId: 'kando', userId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `sms-status ${res.status}`)
  return data as SmsGatewayStatus
}
