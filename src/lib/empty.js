// Stable fallback for `useLiveQuery(...) ?? EMPTY_ARRAY` while Dexie is
// still loading — a fresh `[]` each render would make every useMemo that
// depends on it recompute on every render. Never mutate it.
export const EMPTY_ARRAY = []
