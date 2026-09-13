-- Reminder settings + a reliable login-email column for "who hasn't
-- submitted yet" review + reminders.
--
-- driver_email is the mailto *sender* field the driver can freely edit —
-- it isn't necessarily their actual auth login address, so it can't be
-- trusted for sending a login-link reminder. login_email is set once at
-- profile creation (whichever email they actually authenticated with) and
-- never edited by the driver.
--
-- Weekly reporting periods were floated alongside this but are a materially
-- bigger change (month navigation, submit/lock, PDF export are all built
-- around calendar months) — scoped out for now, monthly only.

alter table companies add column reminder_days integer not null default 2;
alter table driver_settings add column login_email text;

update driver_settings ds
set login_email = cr.email
from company_roster cr
where cr.claimed_by = ds.user_id and ds.login_email is null;
