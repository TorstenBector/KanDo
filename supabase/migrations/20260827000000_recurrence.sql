-- Recurring items: on completion, instead of staying done forever, they
-- reactivate back into Backlog once their frequency elapses. See spec.md
-- and BacklogView.jsx / useItems.js (markDone, reactivateDueRecurringItems).

alter table items
  add column recurrence_days integer,
  add column next_due_date date,
  add column last_completed_at timestamptz;
