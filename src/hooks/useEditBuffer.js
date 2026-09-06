import { useEffect, useRef, useState } from 'react'

// Backs a controlled input with local state that only re-syncs from the
// external value when `key` changes — not on every external update.
// Binding an input's `value` directly to something that arrives via an
// async round-trip (keystroke -> write -> IndexedDB -> Dexie liveQuery
// re-fetch -> re-render with the "new" value) means the DOM value gets
// reset out from under an in-progress edit the moment that round-trip
// lands. Most browsers resolve a value reset by snapping the cursor to
// the end of the field — exactly "delete a letter mid-word, cursor jumps
// to the last position" that was reported for editing a title.
//
// `key` should identify *which thing* is being edited (an item id) — the
// buffer adopts the external value once per key, then keeps its own state
// while key stays the same, even as the external value keeps changing
// underneath it because of the app's own writes syncing back around.
//
// externalValue may itself still be loading (undefined) when key is
// already set — e.g. a modal whose item comes from its own useLiveQuery,
// still resolving on the very first render. Passing undefined here (not
// already collapsed to '' by the caller) lets the buffer wait and adopt
// the real value the moment it actually arrives, instead of locking in
// an empty placeholder forever.
export function useEditBuffer(key, externalValue) {
  const [value, setValue] = useState(externalValue ?? '')
  const prevKeyRef = useRef(key)
  const hasAdoptedRef = useRef(externalValue !== undefined)

  useEffect(() => {
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key
      hasAdoptedRef.current = false
    }
    if (externalValue !== undefined && !hasAdoptedRef.current) {
      setValue(externalValue)
      hasAdoptedRef.current = true
    }
  }, [key, externalValue])

  return [value, setValue]
}
