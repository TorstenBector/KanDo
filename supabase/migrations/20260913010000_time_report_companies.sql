-- Tidrapportering: company/admin layer on top of the driver auth added in
-- 20260913000000_time_entries.sql. AnneMor (payroll admin) needs to see only
-- her own company's *submitted* reports, drivers need a roster pre-registered
-- by her so they can self-onboard by logging in with the email she gave them
-- (matched on first login, no invite email infra needed), and an approved
-- month must be genuinely locked server-side (not just disabled in the UI) —
-- see spec discussion 2026-09-13.

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table company_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade
);

-- Pre-registered by the admin before a driver ever logs in. Claimed (user_id
-- set) the first time a matching email completes magic-link sign-in — see
-- claimRosterOnLogin() in src/lib/companyApi.ts.
create table company_roster (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  phone text,
  email text not null,
  employee_number text,
  claimed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index company_roster_company_email_idx on company_roster(company_id, lower(email));

alter table driver_settings
  add column company_id uuid references companies(id),
  add column phone text,
  add column employee_number text;

create table month_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references companies(id),
  year_month text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  share_token uuid,
  unique (user_id, year_month)
);

create index month_reports_company_status_idx on month_reports(company_id, status);

-- Server-side enforcement of the lock — the UI disables inputs, but a
-- submitted month must actually reject writes even via a direct API call.
-- Admin unlock = flipping status back to 'draft' (month_reports_admin_unlock
-- policy below), which lifts this automatically since it re-checks live.
create or replace function check_month_not_locked() returns trigger as $$
declare
  rec record;
  ym text;
  is_locked boolean;
begin
  if TG_OP = 'DELETE' then
    rec := OLD;
  else
    rec := NEW;
  end if;
  ym := to_char(rec.date, 'YYYY-MM');
  select exists(
    select 1 from month_reports
    where user_id = rec.user_id and year_month = ym and status = 'submitted'
  ) into is_locked;
  if is_locked then
    raise exception 'Den här månaden är godkänd och låst. Be din admin låsa upp den innan du kan ändra.';
  end if;
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger time_entries_lock_check
  before insert or update or delete on time_entries
  for each row execute function check_month_not_locked();

-- Public print/view link (emailed on approval) — a security-definer RPC
-- instead of a blanket anon SELECT policy, so the only way to read anything
-- is knowing the exact random token; nothing is anon-listable.
create or replace function get_report_by_token(token uuid)
returns table (
  driver_name text,
  year_month text,
  submitted_at timestamptz,
  date date,
  check_in text,
  check_out text,
  break_minutes integer,
  trakt text,
  deviation text
) as $$
  select ds.driver_name, mr.year_month, mr.submitted_at,
         te.date, te.check_in, te.check_out, te.break_minutes, te.trakt, te.deviation
  from month_reports mr
  join driver_settings ds on ds.user_id = mr.user_id
  join time_entries te on te.user_id = mr.user_id
    and to_char(te.date, 'YYYY-MM') = mr.year_month
  where mr.share_token = token and mr.status = 'submitted'
  order by te.date;
$$ language sql security definer stable;

grant execute on function get_report_by_token(uuid) to anon;

alter table companies enable row level security;
alter table company_admins enable row level security;
alter table company_roster enable row level security;
alter table month_reports enable row level security;

create policy companies_admin_read on companies
  for select using (
    exists (select 1 from company_admins ca where ca.company_id = companies.id and ca.user_id = auth.uid())
  );

create policy companies_driver_read on companies
  for select using (
    exists (select 1 from driver_settings ds where ds.company_id = companies.id and ds.user_id = auth.uid())
  );

create policy company_admins_self on company_admins
  for select using (user_id = auth.uid());

create policy company_roster_admin on company_roster
  for all using (
    exists (select 1 from company_admins ca where ca.company_id = company_roster.company_id and ca.user_id = auth.uid())
  ) with check (
    exists (select 1 from company_admins ca where ca.company_id = company_roster.company_id and ca.user_id = auth.uid())
  );

-- A driver needs to read (and claim) their own not-yet-claimed roster row by
-- email on first login — narrowed to unclaimed rows matching their own auth
-- email so this can't be used to browse the rest of the roster.
create policy company_roster_self_claim_read on company_roster
  for select using (
    claimed_by is null and email = (select email from auth.users where id = auth.uid())
  );

create policy company_roster_self_claim_update on company_roster
  for update using (
    claimed_by is null and email = (select email from auth.users where id = auth.uid())
  ) with check (claimed_by = auth.uid());

create policy month_reports_owner_select on month_reports
  for select using (user_id = auth.uid());

create policy month_reports_owner_insert on month_reports
  for insert with check (user_id = auth.uid());

-- Owner can only touch it while still a draft — once submitted, only the
-- admin-unlock policy below can change it back.
create policy month_reports_owner_update on month_reports
  for update using (user_id = auth.uid() and status = 'draft') with check (user_id = auth.uid());

create policy month_reports_admin_read on month_reports
  for select using (
    status = 'submitted' and exists (
      select 1 from company_admins ca where ca.company_id = month_reports.company_id and ca.user_id = auth.uid()
    )
  );

create policy month_reports_admin_unlock on month_reports
  for update using (
    exists (select 1 from company_admins ca where ca.company_id = month_reports.company_id and ca.user_id = auth.uid())
  ) with check (
    exists (select 1 from company_admins ca where ca.company_id = month_reports.company_id and ca.user_id = auth.uid())
  );

create policy time_entries_admin_read on time_entries
  for select using (
    exists (
      select 1 from month_reports mr
      join company_admins ca on ca.company_id = mr.company_id
      where mr.user_id = time_entries.user_id
        and mr.year_month = to_char(time_entries.date, 'YYYY-MM')
        and mr.status = 'submitted'
        and ca.user_id = auth.uid()
    )
  );

create policy driver_settings_admin_read on driver_settings
  for select using (
    exists (
      select 1 from company_admins ca
      where ca.company_id = driver_settings.company_id and ca.user_id = auth.uid()
    )
  );
