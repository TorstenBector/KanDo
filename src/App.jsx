import LandingPage from './components/LandingPage'
import KandoApp from './KandoApp'

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
  return <KandoApp />
}
