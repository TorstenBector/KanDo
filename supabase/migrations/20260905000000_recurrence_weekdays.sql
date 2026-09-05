-- Complement to the existing day-count interval (recurrence_days): pick
-- specific weekdays instead (e.g. "always on Mondays"). The two modes are
-- alternatives, not combined — see setRecurrence/setRecurrenceWeekdays in
-- useItems.js, which clear one when the other is set.
-- ISO weekday numbers: 1=Monday .. 7=Sunday.

alter table items
  add column recurrence_weekdays jsonb;
