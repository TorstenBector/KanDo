-- Scheduling something into Dagens Fokus now actually sets its Kanban
-- status to 'planerad' (moves column for real, per user decision) — but
-- that overwrites whatever the item's status was before (e.g.
-- 'prioriterad'), which we still need in order to send it back to the
-- right place later ("→ Prioriterad" vs "← Backlog") instead of always
-- fully resetting it. This remembers that prior status until unscheduled.

alter table items add column pre_focus_status text;
