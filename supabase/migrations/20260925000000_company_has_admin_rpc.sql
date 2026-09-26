-- Lets a driver's own client check whether their company actually has an
-- admin watching the dashboard — company_admins has no RLS policy letting a
-- plain driver read it (by design, it would leak admin identities/emails to
-- everyone at the company), so this exposes only the boolean a driver needs
-- to know whether "Skicka in via Mail" is their only way to reach payroll.
-- SECURITY DEFINER, same bypass-table-RLS pattern as unlock_month_report.

create or replace function company_has_admin(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(select 1 from company_admins where company_id = p_company_id);
$$;

grant execute on function company_has_admin(uuid) to authenticated;
