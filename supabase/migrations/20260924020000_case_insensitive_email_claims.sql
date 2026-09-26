-- Email addresses aren't case-sensitive in practice ("Beckman.Torsten+ADMIN@gmail.com"
-- should still match a login of "beckman.torsten+admin@gmail.com"), but every
-- self-claim policy below did an exact `=` comparison against the JWT's email
-- claim — a differently-cased invite/roster row was invisible to the very
-- account it was meant for, and just silently never got claimed. auth.jwt()
-- ->> 'email' is already normalized lowercase by Supabase Auth, so wrapping
-- both sides in lower() is enough; the unique indexes on these email columns
-- already use lower(email), so this just makes RLS match the same rule the
-- indexes already enforce.

alter policy company_roster_self_claim_read on company_roster
  using (claimed_by is null and lower(email) = lower(auth.jwt() ->> 'email'));

alter policy company_roster_self_claim_update on company_roster
  using (claimed_by is null and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (claimed_by = auth.uid());

alter policy company_admin_invites_self_claim_read on company_admin_invites
  using (claimed_by is null and lower(email) = lower(auth.jwt() ->> 'email'));

alter policy company_admin_invites_self_claim_update on company_admin_invites
  using (claimed_by is null and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (claimed_by = auth.uid());

alter policy company_admins_self_claim_insert on company_admins
  with check (
    user_id = auth.uid() and exists (
      select 1 from company_admin_invites cai
      where cai.company_id = company_admins.company_id
        and lower(cai.email) = lower(auth.jwt() ->> 'email')
    )
  );
