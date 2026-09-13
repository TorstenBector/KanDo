-- One-off: make the app owner's main account a superadmin so the dashboard
-- can be used/previewed.
insert into superadmins (user_id)
select id from auth.users where email = 'beckman.torsten@gmail.com'
on conflict (user_id) do nothing;
