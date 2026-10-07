// Påminnelse som kalenderhändelse (.ics) med larm (KanDo Vibe #8293).
// En webbapp kan inte själv ringa ett larm när den är stängd eller styra
// volym/vibration — telefonens kalender kan. Händelsen får ett larm på
// starttiden; ljud och vibration följer kalenderns egna inställningar.

function pad(n) {
  return String(n).padStart(2, '0')
}

// UTC-format (…Z) så att alla kalendrar tolkar tiden likadant, oavsett
// tidszonsstöd. Indata är lokal tid på enheten.
function toIcsUtc(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// RFC 5545: rader längre än 75 oktetter viks med CRLF + mellanslag.
function fold(line) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts = []
  let current = ''
  let currentBytes = 0
  for (const ch of line) {
    const chBytes = new TextEncoder().encode(ch).length
    if (currentBytes + chBytes > (parts.length === 0 ? 75 : 74)) {
      parts.push(current)
      current = ''
      currentBytes = 0
    }
    current += ch
    currentBytes += chBytes
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export function buildReminderIcs({ title, description, dateISO, time }) {
  const start = new Date(`${dateISO}T${time}:00`)
  const end = new Date(start.getTime() + 15 * 60 * 1000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KanDo//Påminnelse//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@kando.nu`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(title)}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:PT0M',
    `DESCRIPTION:${escapeText(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function downloadReminderIcs(opts) {
  const blob = new Blob([buildReminderIcs(opts)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'kando-paminnelse.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
