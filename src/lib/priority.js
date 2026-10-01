const PRIORITY_WEIGHT = { hog: 0, medel: 1, lag: 2 }

// Default order: backlog_priority (Hög/Medel/Låg) first, then position in
// the Prio list within each tier — a composite of both attributes rather
// than either alone. Shared by Dagens Fokus' day and week views.
export function byPriorityThenRank(a, b) {
  const aWeight = a.backlog_priority ? PRIORITY_WEIGHT[a.backlog_priority] : 3
  const bWeight = b.backlog_priority ? PRIORITY_WEIGHT[b.backlog_priority] : 3
  if (aWeight !== bWeight) return aWeight - bWeight
  return (a.priority_rank ?? 999999) - (b.priority_rank ?? 999999)
}
