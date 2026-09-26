-- Tidkoll: let one person admin more than one company. company_admins.user_id
-- used to be the primary key on its own, capping every admin at exactly one
-- company — Torsten runs several companies from his own account (superadmin
-- who also admins test/client companies) and needs to pick which one he's
-- viewing. All existing RLS policies already do a plain
-- `exists (... where company_id = X and user_id = auth.uid())` lookup rather
-- than assuming a single row, so none of them need to change.

alter table company_admins drop constraint company_admins_pkey;
alter table company_admins add primary key (user_id, company_id);
alter table company_admins alter column user_id set not null;
