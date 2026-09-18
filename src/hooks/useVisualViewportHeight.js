import { useEffect, useState } from 'react'

// CSS dvh shrinks with the on-screen keyboard in a normal Safari/Chrome
// TAB, but iOS is known to not resize dvh the same way for a PWA running
// STANDALONE (added to the home screen) — exactly how KanDo is meant to be
// used. The 85dvh fix for #4722 (Snabbfånga's Spara button hidden behind
// the keyboard) held in a browser tab but not once installed to the home
// screen (#4743 — same symptom, screenshot showed the keyboard's own
// toolbar right where Spara should have been, nothing between). The
// visualViewport API is the actual, reliable source for "how tall is the
// visible area right now" on iOS regardless of standalone/tab — falls back
// to window.innerHeight where visualViewport isn't supported at all.
export function useVisualViewportHeight() {
  const [height, setHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight
  )

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return undefined
    const update = () => setHeight(vv.height)
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return height
}
