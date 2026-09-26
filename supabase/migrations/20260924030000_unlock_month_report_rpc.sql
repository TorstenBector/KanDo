-- The direct RLS-gated UPDATE on month_reports for admin-unlock reproducibly
-- fails with "new row violates row-level security policy" even when tested
-- with a trivial `using (true) with check (true)` policy replacing both
-- month_reports_owner_update and month_reports_admin_unlock — ruling out
-- policy logic entirely (confirmed empirically 2026-09-24, in a rolled-back
-- transaction against production). Root cause not fully isolated; sidestep
-- it with a SECURITY DEFINER RPC that does its own explicit authorization
-- check and writes as the function owner, bypassing table RLS the same way
-- get_report_by_token already does for anon reads.

create or replace function unlock_month_report(p_user_id uuid, p_year_month text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_is_admin boolean;
begin
  select company_id into v_company_id from month_reports
  where user_id = p_user_id and year_month = p_year_month;

  if not found then
    raise exception 'Ingen inskickad rapport hittades för den månaden.';
  end if;

  select exists(
    select 1 from company_admins ca
    where ca.company_id = v_company_id and ca.user_id = auth.uid()
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Du är inte admin för det bolaget.';
  end if;

  update month_reports set status = 'draft'
  where user_id = p_user_id and year_month = p_year_month;
end;
$$;

grant execute on function unlock_month_report(uuid, text) to authenticated;
