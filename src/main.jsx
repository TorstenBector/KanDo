import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// "Tvinga uppdatering" (AccountPanel) startar om appen via en unik
// ?omstart=-URL för att gå förbi HTTP-cachen — städa bort den direkt så den
// inte syns i adressfältet eller följer med i ett bokmärke.
const bootUrl = new URL(window.location.href)
if (bootUrl.searchParams.has('omstart')) {
  bootUrl.searchParams.delete('omstart')
  window.history.replaceState(null, '', bootUrl.toString())
}

// registerType: 'autoUpdate' (vite.config.js) already applies a waiting
// service worker automatically — the gap was *noticing* one exists. Mobile
// users background/foreground the app far more than they fully quit it, so
// check on every return to foreground instead of only on cold navigation.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update()
    })
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
