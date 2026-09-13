-- Fix: policies referencing auth.users directly fail with "permission denied
-- for table users" for anon/authenticated roles (that table isn't grant-
-- accessible even from inside a USING clause). Read the email out of the
-- JWT claim instead — same auth.jwt() pattern used elsewhere (e.g. Jaktkoll's
-- get_my_role()).

alter policy company_roster_self_claim_read on company_roster
  using (claimed_by is null and email = (auth.jwt() ->> 'email'));

alter policy company_roster_self_claim_update on company_roster
  using (claimed_by is null and email = (auth.jwt() ->> 'email'))
  with check (claimed_by = auth.uid());
