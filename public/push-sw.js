// Pushnotiser för KanDo (Plugg). Laddas in i den genererade service workern
// via workbox.importScripts i vite.config.js.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'KanDo', body: event.data ? event.data.text() : '' }
  }
  const options = {
    body: data.body || '',
    tag: data.tag,
    renotify: !!data.tag,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data,
    requireInteraction: data.kind === 'reminder',
    // Knappar visas på Android/dator; iPhone ignorerar dem (tryck på notisen öppnar appen).
    actions: Array.isArray(data.actions) ? data.actions : [],
  }
  event.waitUntil(self.registration.showNotification(data.title || 'KanDo', options))
})

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {}
  event.notification.close()

  if (event.action === 'confirm' && data.confirmUrl && data.sessionId) {
    event.waitUntil(
      fetch(data.confirmUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', sessionId: data.sessionId, token: data.confirmToken }),
      }).catch(() => {})
    )
    return
  }

  const url = new URL(data.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        // Appen är redan öppen: be den visa passet i stället för att ladda om.
        client.postMessage({ type: 'kando-open-url', url })
        return client.focus()
      }
    }
    return self.clients.openWindow(url)
  })())
})
