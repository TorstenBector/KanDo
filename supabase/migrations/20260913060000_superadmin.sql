-- Superadmin: onboards new companies and assigns/removes their admins
-- (supports >1 admin per company for redundancy — company_admins already
-- allows that, it's one row per person, not per company). Manually promoted
-- to this table via a one-off migration, same pattern as Jaktkoll's
-- superuser (dashboard-managed, no self-service promotion).

create table superadmins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table superadmins enable row level security;

create policy superadmins_self on superadmins
  for select using (user_id = auth.uid());

-- Displayed email for an admin — company_admins.user_id alone can't be
-- resolved to an email client-side (auth.users isn't queryable directly,
-- same reason company_roster stores its own email column).
alter table company_admins add column email text;

-- Pre-registered by a superadmin before the admin-to-be ever logs in.
-- Claimed the first time a matching email completes magic-link sign-in.
create table company_admin_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  email text not null,
  claimed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index company_admin_invites_company_email_idx on company_admin_invites(company_id, lower(email));

alter table company_admin_invites enable row level security;

create policy superadmin_companies_all on companies
  for all using (
    exists (select 1 from superadmins sa where sa.user_id = auth.uid())
  ) with check (
    exists (select 1 from superadmins sa where sa.user_id = auth.uid())
  );

create policy superadmin_company_admins_all on company_admins
  for all using (
    exists (select 1 from superadmins sa where sa.user_id = auth.uid())
  ) with check (
    exists (select 1 from superadmins sa where sa.user_id = auth.uid())
  );

create policy superadmin_company_admin_invites_all on company_admin_invites
  for all using (
    exists (select 1 from superadmins sa where sa.user_id = auth.uid())
  ) with check (
    exists (select 1 from superadmins sa where sa.user_id = auth.uid())
  );

-- Invitee needs to read (and claim) their own not-yet-claimed invite by
-- email on first login — narrowed to unclaimed rows matching their own JWT
-- email, same pattern as company_roster_self_claim_*.
create policy company_admin_invites_self_claim_read on company_admin_invites
  for select using (
    claimed_by is null and email = (auth.jwt() ->> 'email')
  );

create policy company_admin_invites_self_claim_update on company_admin_invites
  for update using (
    claimed_by is null and email = (auth.jwt() ->> 'email')
  ) with check (claimed_by = auth.uid());

-- The invitee creates their own company_admins row when accepting — only
-- permitted when a matching invite for that company+their email exists.
create policy company_admins_self_claim_insert on company_admins
  for insert with check (
    user_id = auth.uid() and exists (
      select 1 from company_admin_invites cai
      where cai.company_id = company_admins.company_id
        and cai.email = (auth.jwt() ->> 'email')
    )
  );
