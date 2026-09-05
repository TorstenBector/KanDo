import LandingPage from './components/LandingPage'
import KandoApp from './KandoApp'
import SharedListPage from './components/SharedListPage'

// kando.nu is the marketing/vision page; app.kando.nu (and everything else,
// including local dev) is the actual app. See spec.md "Plattform".
const MARKETING_HOSTNAMES = ['kando.nu', 'www.kando.nu']

export function isMarketingHost(hostname) {
  return MARKETING_HOSTNAMES.includes(hostname)
}

export default function App() {
  if (isMarketingHost(window.location.hostname)) {
    return <LandingPage />
  }
  // Public, unauthenticated view of a shared list — see ShareListManager.jsx.
  const sharedToken = new URLSearchParams(window.location.search).get('dela')
  if (sharedToken) {
    return <SharedListPage token={sharedToken} />
  }
  return <KandoApp />
}
