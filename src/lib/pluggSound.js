// Signal när pluggpassets måltid är nådd. iOS släpper bara fram ljud från
// en AudioContext som skapats/väckts i ett tryck, så unlockAudio() anropas
// från Starta-knappen och samma context återanvänds när tiden är ute.
// När appen ligger i bakgrunden eller skärmen är låst pausar iOS sidans
// timers — där tar pushnotisen över (steg 2 i Plugg-specen).
let ctx = null

export function unlockAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    if (!ctx) ctx = new AudioCtx()
    if (ctx.state === 'suspended') ctx.resume()
  } catch {
    // Inget ljud tillgängligt — passet fungerar ändå, bara tyst.
  }
}

function beep(at, freq) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35)
  osc.connect(gain).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + 0.4)
}

export function playChime() {
  try {
    unlockAudio()
    if (ctx) {
      const t = ctx.currentTime + 0.05
      beep(t, 660)
      beep(t + 0.45, 880)
      beep(t + 0.9, 1100)
    }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200])
  } catch {
    // Tyst reserv — kortet visar ändå "Tiden är ute".
  }
}

// Samma pass ska bara pipa en gång per måltid, även om det syns på flera
// ställen (Dagens Fokus och Plugg) — nyckeln ändras när man förlänger.
const chimed = new Set()

export function chimeOnce(key) {
  if (chimed.has(key)) return
  chimed.add(key)
  playChime()
}
