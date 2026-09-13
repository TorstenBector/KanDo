-- One-off seed: make the +admin test account an admin of the test company,
-- so the admin dashboard can be previewed. Safe to delete manually later.
insert into company_admins (user_id, company_id)
select u.id, c.id
from auth.users u, companies c
where u.email = 'beckman.torsten+admin@gmail.com'
  and c.name = 'Testbolag AB'
on conflict (user_id) do update set company_id = excluded.company_id;
