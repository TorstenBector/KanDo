// Web Push: prenumeration på den här enheten. Servern (edge function
// plugg-push) skickar påminnelser inför pluggpass. Publik VAPID-nyckel —
// den privata finns bara som hemlighet i Supabase.
import { supabase } from './supabaseClient'

export const VAPID_PUBLIC_KEY = 'BHLwF1U3_-w_qyor97sGQIAHlbLrOrkbF3gIGvWbcsk1nYdEs2iUOyvk1w9E3V558KwSJHJ99psO3hOFj4DrTBs'

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

// 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'
export async function getPushState() {
  // iPhone: notiser fungerar bara när KanDo lagts till på hemskärmen (iOS 16.4+).
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

async function saveSubscription(sub) {
  const json = sub.toJSON()
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error) throw new Error(error.message)
}

// Måste anropas från ett tryck (iOS kräver det för behörighetsfrågan).
export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Du behöver tillåta notiser för KanDo.')
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  await saveSubscription(sub)
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

// Prenumerationen kan bytas ut av webbläsaren — spara om den vid uppstart
// så servern alltid har den aktuella (tyst, bara om notiser redan är på).
export async function refreshPushSubscription() {
  try {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await saveSubscription(sub)
  } catch {
    // Inte kritiskt — försöker igen nästa start.
  }
}

export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke('plugg-push', { body: { action: 'test' } })
  if (error) throw new Error(error.message)
  return data
}
