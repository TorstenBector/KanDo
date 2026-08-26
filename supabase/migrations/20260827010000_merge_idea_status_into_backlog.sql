-- "Idé" was both an item *type* and a Kanban *status* — the same word
-- meaning two different things caused real UX confusion (can't tell if
-- you're changing what something is vs. where it sits in the workflow).
-- Type (idea/project/task) stays; status no longer has an 'idea' stage —
-- everything starts directly in Backlog. See spec.md "Kanban".

update items set status = 'backlog' where status = 'idea';

alter table items alter column status set default 'backlog';

alter table items drop constraint items_status_check;
alter table items add constraint items_status_check
  check (status in ('backlog','prioriterad','planerad','pagar','klar'));
