import { useEffect, useState } from 'react'

// Den synliga ytan på iOS — höjd OCH hur långt den är panorerad
// (offsetTop). CSS dvh krymper inte med tangentbordet i en hemskärms-PWA
// (#4743), så höjden måste komma från visualViewport. Och när tangentbordet
// öppnas panorerar iOS dessutom vyn för att visa det fokuserade fältet —
// en panel fäst mot fönstrets överkant (position: fixed; top: 0) åker då
// uppåt ur bild och tar Titel/Spara med sig (KanDo Vibe #7282). Med
// offsetTop kan panelen i stället fästas mot den yta som faktiskt syns.
// Faller tillbaka på window.innerHeight där visualViewport saknas.
function readViewport() {
  const vv = window.visualViewport
  return {
    height: vv?.height ?? window.innerHeight,
    offsetTop: vv?.offsetTop ?? 0,
  }
}

export function useVisualViewport() {
  const [viewport, setViewport] = useState(readViewport)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return undefined
    const update = () => setViewport(readViewport())
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return viewport
}

// Tangentbordet räknas som öppet när den synliga ytan är klart lägre än
// fönstret (marginal för adressfält/verktygsrader som också kan krympa den).
export function isKeyboardOpen(viewport) {
  return window.innerHeight - viewport.height > 150
}

// Låser sidan bakom en öppen panel. En sida som scrollar bakom en fast
// panel är den vanliga orsaken till att iOS ritar markören på fel ställe i
// ett textfält (KanDo Vibe #7278: markören under textraden medan texten
// hamnade rätt) — och det är samma scroll som panorerar bort panelen.
// position:fixed på body är det enda som faktiskt stoppar det på iOS
// (overflow:hidden räcker inte); scrollpositionen återställs när den låses upp.
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined
    const { body } = document
    const scrollY = window.scrollY
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    return () => {
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.width = prev.width
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
