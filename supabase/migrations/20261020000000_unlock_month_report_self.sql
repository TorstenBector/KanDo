-- Drivers without an admin (no company, or a company with no
-- company_admins row) could submit a month but nobody could ever unlock it
-- again — found 2026-10-20 (Vibe #8404). Let the report owner unlock their
-- own report in exactly that case; with an admin present, unlocking stays
-- an admin-only action.

create or replace function unlock_month_report(p_user_id uuid, p_year_month text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_has_admin boolean;
  v_is_admin boolean;
begin
  select company_id into v_company_id from month_reports
  where user_id = p_user_id and year_month = p_year_month;

  if not found then
    raise exception 'Ingen inskickad rapport hittades för den månaden.';
  end if;

  select exists(
    select 1 from company_admins ca where ca.company_id = v_company_id
  ) into v_has_admin;

  select exists(
    select 1 from company_admins ca
    where ca.company_id = v_company_id and ca.user_id = auth.uid()
  ) into v_is_admin;

  if not v_is_admin and not (p_user_id = auth.uid() and not v_has_admin) then
    raise exception 'Du är inte admin för det bolaget.';
  end if;

  update month_reports set status = 'draft'
  where user_id = p_user_id and year_month = p_year_month;
end;
$$;

grant execute on function unlock_month_report(uuid, text) to authenticated;
