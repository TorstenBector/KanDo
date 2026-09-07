-- Lets tags be manually reordered in Tagghantering (same idea as
-- item_relations.sort_order / items.priority_rank), so the order can drive
-- both the tag-chip bar everywhere and Dagens Fokus's "group by tag" order
-- instead of always being alphabetical. See TagManagementView.jsx.
alter table tags add column sort_order integer;
