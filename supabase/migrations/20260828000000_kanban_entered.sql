-- Distinguishes "actively pulled into Kanban work" from "just checked off
-- from a list" (Dagens Fokus/Backlog/Prio). Only items dragged within the
-- Kanban board itself (into Planerad/Pågår, or straight to Klar) should
-- ever show in the board's Klar column — everything else that gets marked
-- done still shows in Utförda, just not as board clutter. See KanbanBoard.jsx.
alter table items add column kanban_entered boolean not null default false;
