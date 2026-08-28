-- Lets subtasks (children in item_relations) be manually reordered, same
-- idea as items.priority_rank but scoped to one parent's children instead
-- of the global Prioriterad list. See ItemDetailModal.jsx.
alter table item_relations add column sort_order integer;
