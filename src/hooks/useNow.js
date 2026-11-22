import { useEffect, useState } from 'react'

// Aktuell tid som uppdateras med ett intervall — för nedräkningar och för
// att ett pass ska bli orange av sig själv när det närmar sig.
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, intervalMs)
    // Tillbaka från bakgrunden: räkna om direkt i stället för att vänta.
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])
  return now
}
