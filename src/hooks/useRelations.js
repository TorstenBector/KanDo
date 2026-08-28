import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'

function bySortOrder(a, b) {
  return (a.sort_order ?? 999999) - (b.sort_order ?? 999999)
}

// Groups children by parent for Backlog/Prio nesting, plus a set of every
// child id so those views can exclude them from the top-level list (they
// render nested under their parent instead).
export function useChildrenByParent() {
  return useLiveQuery(async () => {
    const relations = await db.item_relations.where('relation_type').equals('parent_child').toArray()
    relations.sort(bySortOrder)
    const childIds = relations.map((r) => r.to_item_id)
    const childItems = await db.items.bulkGet(childIds)
    const byId = new Map(childItems.filter(Boolean).map((i) => [i.id, i]))

    const childrenByParent = new Map()
    const childIdSet = new Set()
    for (const rel of relations) {
      const child = byId.get(rel.to_item_id)
      if (!child) continue
      childIdSet.add(rel.to_item_id)
      if (!childrenByParent.has(rel.from_item_id)) childrenByParent.set(rel.from_item_id, [])
      childrenByParent.get(rel.from_item_id).push(child)
    }
    return { childrenByParent, childIdSet }
  }, []) ?? { childrenByParent: new Map(), childIdSet: new Set() }
}

export function useChildren(itemId) {
  return useLiveQuery(async () => {
    if (!itemId) return []
    const relations = await db.item_relations
      .where({ from_item_id: itemId, relation_type: 'parent_child' })
      .toArray()
    relations.sort(bySortOrder)
    const children = await db.items.bulkGet(relations.map((r) => r.to_item_id))
    return children.filter(Boolean)
  }, [itemId]) ?? []
}

export function useParent(itemId) {
  return useLiveQuery(async () => {
    if (!itemId) return null
    const relation = await db.item_relations
      .where({ to_item_id: itemId, relation_type: 'parent_child' })
      .first()
    if (!relation) return null
    return (await db.items.get(relation.from_item_id)) ?? null
  }, [itemId])
}
