-- Two-level tag hierarchy (Vibe #2768, "Bygga träd av taggarna") — a tag
-- can belong to one parent tag (e.g. Inne/Ute/Städ under Hus). Kept to a
-- flat two levels by application logic in useTags.js/TagManagementView,
-- not enforced here — a tag with children can't itself get a parent, and
-- vice versa, checked before either write.
--
-- on delete set null: deleting a parent tag un-parents its children back
-- to top-level rather than cascading the delete into them — losing a
-- category shouldn't silently delete everything filed under it.
alter table tags add column parent_tag_id uuid references tags(id) on delete set null;

create index tags_parent_tag_id_idx on tags(parent_tag_id);
