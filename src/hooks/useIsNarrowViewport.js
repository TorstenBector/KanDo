import { useEffect, useState } from 'react'

// Roughly "this is already a phone" — matches Mobillook's own frame width
// (430px) plus a little margin. Used to hide/ignore the Mobillook toggle on
// devices where it can't do anything useful: it exists so a DESKTOP browser
// can preview the phone layout, but on an actual phone it just nests a
// simulated 430px frame inside an already-narrower real viewport, which is
// pointless at best and buggy at worst (KanDo Vibe #2078 — reported as
// "Mobilversion ska inte gå att markera på Mobilen, verkar buggig").
const NARROW_BREAKPOINT_PX = 480

export function useIsNarrowViewport() {
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= NARROW_BREAKPOINT_PX
  )

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT_PX}px)`)
    const update = () => setIsNarrow(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  return isNarrow
}
